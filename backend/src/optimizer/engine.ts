// The keyword optimizer's deterministic engine (docs/overhaul-v3-backend.md
// section 11.1). Pure: it takes one window of API-shaped data plus the
// caches (intent, vehicle parse), the inventory snapshot, existing
// negatives, recent change events and the history of earlier suggestions,
// and returns candidate rows for keyword_suggestions. No model calls and
// no SQL in here — engineData.ts reads the DB, the scoring harness
// (scripts/scoreOptimizer.ts) feeds it generated demo data instead.
//
// Facts are computed here, never by the model: every number in a
// candidate's evidence comes from the input. The LLM step (step 7) may
// only rank and explain what this returns.
//
// Every threshold in ENGINE_DEFAULTS is a STARTING DEFAULT, tuned against
// the harness, not a rule.

import { nMin } from './significance.js'
import { normalizeTerm, WASTE_INTENTS } from './intent.js'
import { checkCollisions, negativeBlocks, JUNK_NEGATIVES, type ConvertingTerm, type NegativeSpec } from './negatives.js'
import { daysBetween, matchStock, targetCpaMicros, type StockMatch } from './stock.js'
import { GENERIC_WORDS, parseVehicle, type VehicleParse } from './vehicleParse.js'
import { modelKey, proposeCampaigns } from './campaigns.js'
import { proposeAds, type AdSettings, type ProposalForAds } from './ads.js'
import { engineVerdicts, findWinners } from './winners.js'
import type { InventorySnapshot } from './inventory/types.js'
import type {
  Basis,
  Confidence,
  ExpectedImpact,
  Intent,
  MatchType,
  SuggestionEvidence,
  SuggestionPayload,
  SuggestionStatus,
  SuggestionType,
} from './types.js'

export { ENGINE_DEFAULTS, type EngineThresholds } from './thresholds.js'
import { ENGINE_DEFAULTS, type EngineThresholds } from './thresholds.js'

export interface EngineSettings {
  pValue: number // keyword_min_confidence_p
  allowedSpendShare: number // inventory_allowed_spend_share
  leadToSaleRate: number // inventory_lead_to_sale_rate
  budgetFloorIdr: number // campaign_daily_budget_floor_idr (3.3)
  budgetCeilingIdr: number // campaign_daily_budget_ceiling_idr (3.3)
}

export interface WindowStats {
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
  conversionsValueMicros: number
}

export interface EngineKeyword {
  id: number
  adGroupId: number
  text: string
  matchType: MatchType
  cpcBidMicros: number | null // null = automated bidding
  firstServedOn: string | null // first day with impressions, up to the window end
  stats: WindowStats
  qualityScore: number | null // the newest in the window
  rankLostShare: number | null // mean over the window's days that report it
}

export interface EngineSearchTerm {
  id: number
  adGroupId: number
  keywordId: number
  text: string
  stats: WindowStats
}

export interface EngineNegative {
  scope: 'campaign' | 'ad_group' | 'shared_set'
  campaignId: number | null
  adGroupId: number | null
  text: string
  matchType: MatchType
}

export interface SuggestionHistory {
  id?: number // the row's id (3.6: an ad links to its stored campaign proposal)
  fingerprint: string
  status: SuggestionStatus
  statusChangedOn: string | null // 'YYYY-MM-DD'
  campaignName?: string | null // new_campaign: the proposed name (3.3), kept unique
  adTarget?: string | null // new_ad: payload.ad_target (3.6), for dedupe across changed facts
}

/** 3.6 — an enabled ad in an enabled ad group, with its window totals. */
export interface EngineAd {
  id: number
  adGroupId: number
  label: string
  headlines: string[]
  descriptions: string[]
  finalUrl: string | null
  adStrength: 'poor' | 'average' | 'good' | 'excellent' | null
  stats: WindowStats
}

/** 3.6 — a promote_search_term suggestion the owner applied. */
export interface PromotedTerm {
  text: string
  searchTermId: number | null
  adGroupId: number | null
  conversions: number
  appliedOn: string // 'YYYY-MM-DD'
}

export interface EngineInput {
  asOf: string // the newest day with data
  windowStart: string
  windowEnd: string
  campaigns: { id: number; name: string }[]
  adGroups: { id: number; campaignId: number; name: string }[]
  keywords: EngineKeyword[]
  searchTerms: EngineSearchTerm[]
  intents: ReadonlyMap<string, Intent> // normalized term → intent; absent = not classified
  vehicleParses: ReadonlyMap<number, VehicleParse> // keyword id → parse
  inventory: InventorySnapshot
  negatives: EngineNegative[]
  changeEvents: { campaignId: number | null; changedOn: string }[] // campaignId null = account-level
  history: SuggestionHistory[] // the newest row per fingerprint
  settings: EngineSettings
  // 3.6 — ad suggestions. Absent = no ads are proposed.
  ads?: EngineAd[]
  adSettings?: AdSettings | null
  promotedTerms?: PromotedTerm[]
  thresholds?: Partial<EngineThresholds>
}

export interface Candidate {
  type: SuggestionType
  campaignId: number | null
  adGroupId: number | null
  keywordId: number | null
  searchTermId: number | null
  payload: SuggestionPayload
  evidence: SuggestionEvidence
  basis: Basis
  confidence: Confidence
  expectedImpact: ExpectedImpact | null
  inventorySnapshotOn: string | null
  fingerprint: string
}

export type SkipReason = 'open' | 'planned' | 'applied' | 'dismissed_cooldown' | 'change_event' | 'collision' | 'already_negative' | 'cap' | 'checks'

export interface EngineResult {
  candidates: Candidate[] // new rows to insert
  // Fired but over a per-run cap (new_keyword, new_campaign, new_ad): the next run
  // offers them again. Not stored; the harness scores them as found.
  capped: Candidate[]
  // 3.5: candidates whose fingerprint already has an open, planned or applied
  // row, recomputed this run. Not stored; the pipeline compares them with the
  // stored rows to tell whether anything changed since the last run.
  existing: Candidate[]
  // Every fingerprint the rules produced this run, including the skipped
  // ones whose condition still holds. An open row from an earlier run whose
  // fingerprint is not in here no longer applies (superseded).
  produced: string[]
  skipped: { fingerprint: string; type: SuggestionType; reason: SkipReason; detail?: string }[]
  // Zero-conversion search terms that have clicks but too few to call:
  // the honest "not enough data" answer, counted for the run summary.
  notEnoughData: number
  inventoryAvailable: boolean
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The evidence window for a run on `asOf`: windowDays long, ending
 * conversionLagDays before it. */
export function evidenceWindow(asOf: string, thresholds: Partial<EngineThresholds> = {}): { start: string; end: string } {
  const t = { ...ENGINE_DEFAULTS, ...thresholds }
  const end = addDays(asOf, -t.conversionLagDays)
  return { start: addDays(end, -(t.windowDays - 1)), end }
}

export { fingerprintOf } from './fingerprint.js'
import { fingerprintOf } from './fingerprint.js'

const ZERO = 1e-9
const isZero = (conversions: number) => conversions < ZERO
const cpa = (s: WindowStats) => (s.conversions > ZERO ? s.costMicros / s.conversions : null)
const rate = (s: WindowStats) => (s.clicks > 0 ? s.conversions / s.clicks : 0)
const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000


export { adGroupTotals } from './rollup.js'
import { adGroupTotals, addStats, emptyStats } from './rollup.js'

const NON_BUYER_NEGATIVE_INTENTS: readonly Intent[] = ['job_seeker', 'student', 'consumer']

export function runEngine(input: EngineInput): EngineResult {
  const t: EngineThresholds = { ...ENGINE_DEFAULTS, ...input.thresholds }
  const { settings } = input
  const windowWeeks = (daysBetween(input.windowStart, input.windowEnd) + 1) / 7
  const inventoryAvailable = input.inventory.source !== 'unavailable' && input.inventory.snapshotOn !== null
  const snapshotOn = inventoryAvailable ? input.inventory.snapshotOn : null

  // --- indexes and rollups -------------------------------------------------
  const adGroupById = new Map(input.adGroups.map((a) => [a.id, a]))
  const campaignOfAdGroup = (adGroupId: number) => adGroupById.get(adGroupId)?.campaignId ?? null
  const keywordById = new Map(input.keywords.map((k) => [k.id, k]))
  const adGroupStats = adGroupTotals(input.keywords)
  const campaignStats = new Map<number, WindowStats>()
  for (const k of input.keywords) {
    const c = campaignOfAdGroup(k.adGroupId)
    if (c !== null) addStats(campaignStats.get(c) ?? campaignStats.set(c, emptyStats()).get(c)!, k.stats)
  }
  const termsByKeyword = new Map<number, EngineSearchTerm[]>()
  for (const s of input.searchTerms) {
    if (!termsByKeyword.has(s.keywordId)) termsByKeyword.set(s.keywordId, [])
    termsByKeyword.get(s.keywordId)!.push(s)
  }
  const intentOf = (text: string): Intent | null => input.intents.get(normalizeTerm(text)) ?? null
  const nMinFor = (s: WindowStats | undefined) => nMin(s ? rate(s) : 0, settings.pValue)

  const coldStart = (k: EngineKeyword | undefined) =>
    !k || k.firstServedOn === null || daysBetween(k.firstServedOn, input.windowEnd) + 1 < t.coldStartDays
  const cap = (c: Confidence, cold: boolean): Confidence => (cold ? 'low' : c)

  const stockFor = (keywordId: number): StockMatch | null => {
    if (!inventoryAvailable) return null
    const parse = input.vehicleParses.get(keywordId)
    return parse ? matchStock(parse, input.inventory.vehicles, snapshotOn!) : null
  }
  const stockEvidence = (m: StockMatch | null) =>
    m ? { stock_count: m.stockCount, avg_days_listed: m.avgDaysListed, avg_margin_idr: m.avgMarginIdr } : {}

  const evidence = (s: WindowStats | null, minClicks: number | null, extra: Record<string, unknown> = {}): SuggestionEvidence => ({
    window_start: input.windowStart,
    window_end: input.windowEnd,
    clicks: s ? s.clicks : null,
    impressions: s ? s.impressions : null,
    cost_micros: s ? s.costMicros : null,
    conversions: s ? round2(s.conversions) : null,
    conversions_value_micros: s ? s.conversionsValueMicros : null,
    min_clicks_required: minClicks,
    ...extra,
  })
  const wastedPerWeek = (s: WindowStats): ExpectedImpact => ({
    wasted_spend_micros_per_week: Math.round(s.costMicros / windowWeeks),
  })

  // Existing negatives that apply to a campaign / ad group.
  const negativesFor = (campaignId: number | null, adGroupId: number | null) =>
    input.negatives.filter(
      (n) =>
        n.scope === 'shared_set' ||
        (n.scope === 'campaign' && n.campaignId === campaignId) ||
        (n.scope === 'ad_group' && n.adGroupId === adGroupId)
    )
  const blockedByExisting = (text: string, campaignId: number | null, adGroupId: number | null) =>
    negativesFor(campaignId, adGroupId).some((n) => negativeBlocks(n, text))

  // Converting terms a negative in this scope would reach.
  const convertingTermsIn = (scope: 'campaign' | 'ad_group', id: number): ConvertingTerm[] =>
    input.searchTerms
      .filter((s) => s.stats.conversions > ZERO && (scope === 'ad_group' ? s.adGroupId === id : campaignOfAdGroup(s.adGroupId) === id))
      .map((s) => ({ text: s.text, conversions: s.stats.conversions, intent: intentOf(s.text) }))

  const raw: Candidate[] = []
  const skipped: EngineResult['skipped'] = []
  let notEnoughData = 0

  /** Runs the collision check; suppresses the negative when it would block
   * a converting buyer term, otherwise returns the collisions to report. */
  const collisionsOrSkip = (
    neg: NegativeSpec,
    scope: 'campaign' | 'ad_group',
    scopeId: number,
    fingerprint: string
  ): { search_term: string; conversions: number }[] | null => {
    const check = checkCollisions(neg, convertingTermsIn(scope, scopeId))
    if (check.blockedBuyers.length > 0) {
      skipped.push({
        fingerprint,
        type: 'negative_keyword',
        reason: 'collision',
        detail: check.blockedBuyers.map((b) => b.search_term).join(', '),
      })
      return null
    }
    return check.collisions
  }

  // --- negative_keyword: one search term ------------------------------------
  // Zero conversions past n_min clicks, or a job/student/consumer term past
  // nonBuyerMinClicks. Below both, the term is "not enough data".
  for (const s of input.searchTerms) {
    if (!isZero(s.stats.conversions) || s.stats.clicks === 0) continue
    const kw = keywordById.get(s.keywordId)
    const campaignId = campaignOfAdGroup(s.adGroupId)
    if (campaignId === null) continue
    const minClicks = nMinFor(adGroupStats.get(s.adGroupId))
    const intent = intentOf(s.text)
    const rules: string[] = []
    if (s.stats.clicks >= minClicks) rules.push('negative.zero_conversions')
    const nonBuyer = intent !== null && NON_BUYER_NEGATIVE_INTENTS.includes(intent)
    if (nonBuyer && s.stats.clicks >= t.nonBuyerMinClicks) rules.push('negative.non_buyer_intent')
    if (rules.length === 0) {
      notEnoughData += 1
      continue
    }
    // Junk is junk anywhere in the campaign; a buyer-intent term that just
    // doesn't convert here is an ad-group call.
    const scope: 'campaign' | 'ad_group' = nonBuyer ? 'campaign' : 'ad_group'
    const scopeId = scope === 'campaign' ? campaignId : s.adGroupId
    const neg: NegativeSpec = { text: s.text, matchType: 'exact' }
    const fingerprint = fingerprintOf('negative_keyword', `${scope}:${scopeId}|exact|${normalizeTerm(s.text)}`)
    if (blockedByExisting(s.text, campaignId, s.adGroupId)) {
      skipped.push({ fingerprint, type: 'negative_keyword', reason: 'already_negative' })
      continue
    }
    const collisions = collisionsOrSkip(neg, scope, scopeId, fingerprint)
    if (collisions === null) continue
    const strong = s.stats.clicks >= 2 * minClicks || (nonBuyer && s.stats.clicks >= minClicks)
    raw.push({
      type: 'negative_keyword',
      campaignId,
      adGroupId: s.adGroupId,
      keywordId: s.keywordId,
      searchTermId: s.id,
      payload: { kind: 'negative_keyword', text: s.text, match_type: 'exact', scope, collisions },
      evidence: evidence(s.stats, minClicks, {
        rules,
        intent,
        ad_group_conversion_rate: round4(rate(adGroupStats.get(s.adGroupId) ?? emptyStats())),
        p_value: settings.pValue,
      }),
      basis: 'evidence',
      confidence: cap(strong ? 'high' : 'medium', coldStart(kw)),
      expectedImpact: wastedPerWeek(s.stats),
      inventorySnapshotOn: null,
      fingerprint,
    })
  }

  // --- negative_keyword: a word shared by several zero-conversion terms -----
  // Per campaign: a word (not generic, not a vehicle, not in any of the
  // campaign's keywords) that appears only in terms with no conversions,
  // across wasteTokenMinTerms+ terms with n_min clicks between them.
  const proposedTokenNegatives = new Set<string>() // `${campaignId}|${text}`
  const vehicleWords = new Map<string, boolean>()
  const isVehicleWord = (w: string) =>
    vehicleWords.get(w) ?? vehicleWords.set(w, parseVehicle(w).make !== null).get(w)!
  for (const campaign of input.campaigns) {
    const terms = input.searchTerms.filter((s) => campaignOfAdGroup(s.adGroupId) === campaign.id)
    if (terms.length === 0) continue
    const keywordWords = new Set(
      input.keywords.filter((k) => campaignOfAdGroup(k.adGroupId) === campaign.id).flatMap((k) => normalizeTerm(k.text).split(' '))
    )
    const byToken = new Map<string, EngineSearchTerm[]>()
    for (const s of terms) {
      for (const w of new Set(normalizeTerm(s.text).split(' '))) {
        if (w.length < 3 || /^\d+$/.test(w) || GENERIC_WORDS.has(w) || keywordWords.has(w)) continue
        if (isVehicleWord(w)) continue
        if (!byToken.has(w)) byToken.set(w, [])
        byToken.get(w)!.push(s)
      }
    }
    const minClicks = nMinFor(campaignStats.get(campaign.id))
    for (const [token, list] of [...byToken.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (list.length < t.wasteTokenMinTerms || list.some((s) => !isZero(s.stats.conversions))) continue
      const total = list.reduce((acc, s) => addStats(acc, s.stats), emptyStats())
      if (total.clicks < minClicks) continue
      const neg: NegativeSpec = { text: token, matchType: 'phrase' }
      const fingerprint = fingerprintOf('negative_keyword', `campaign:${campaign.id}|phrase|${token}`)
      if (blockedByExisting(token, campaign.id, null)) {
        skipped.push({ fingerprint, type: 'negative_keyword', reason: 'already_negative' })
        continue
      }
      const collisions = collisionsOrSkip(neg, 'campaign', campaign.id, fingerprint)
      if (collisions === null) continue
      proposedTokenNegatives.add(`${campaign.id}|${token}`)
      raw.push({
        type: 'negative_keyword',
        campaignId: campaign.id,
        adGroupId: null,
        keywordId: null,
        searchTermId: null,
        payload: { kind: 'negative_keyword', text: token, match_type: 'phrase', scope: 'campaign', collisions },
        evidence: evidence(total, minClicks, {
          rules: ['negative.waste_token'],
          term_count: list.length,
          example_terms: list.slice(0, 5).map((s) => s.text),
          p_value: settings.pValue,
        }),
        basis: 'evidence',
        confidence: total.clicks >= 2 * minClicks ? 'high' : 'medium',
        expectedImpact: wastedPerWeek(total),
        inventorySnapshotOn: null,
        fingerprint,
      })
    }
  }

  // --- negative_keyword (preventive): the standard junk list ----------------
  // basis 'prior' (unverified): suggested because it's junk for any used-car
  // dealer, not because this account has proven it. Only for campaigns with
  // a broad keyword (the match type that reaches junk) and no such negative.
  for (const campaign of input.campaigns) {
    const keywords = input.keywords.filter((k) => campaignOfAdGroup(k.adGroupId) === campaign.id)
    if (!keywords.some((k) => k.matchType === 'broad')) continue
    for (const junk of JUNK_NEGATIVES) {
      const fingerprint = fingerprintOf('negative_keyword', `campaign:${campaign.id}|${junk.matchType}|${normalizeTerm(junk.text)}`)
      if (proposedTokenNegatives.has(`${campaign.id}|${normalizeTerm(junk.text)}`)) continue
      const already = negativesFor(campaign.id, null).some((n) => normalizeTerm(n.text) === normalizeTerm(junk.text))
      if (already) {
        skipped.push({ fingerprint, type: 'negative_keyword', reason: 'already_negative' })
        continue
      }
      const collisions = collisionsOrSkip(junk, 'campaign', campaign.id, fingerprint)
      if (collisions === null) continue
      // The visible terms it would catch, if any, so "unverified" still says
      // what it touches.
      const matched = input.searchTerms.filter((s) => campaignOfAdGroup(s.adGroupId) === campaign.id && negativeBlocks(junk, s.text))
      const total = matched.reduce((acc, s) => addStats(acc, s.stats), emptyStats())
      raw.push({
        type: 'negative_keyword',
        campaignId: campaign.id,
        adGroupId: null,
        keywordId: null,
        searchTermId: null,
        payload: { kind: 'negative_keyword', text: junk.text, match_type: junk.matchType, scope: 'campaign', collisions },
        evidence: evidence(matched.length > 0 ? total : null, null, {
          rules: ['negative.preventive'],
          junk_list_entry: junk.id,
          category: junk.category,
          matched_term_count: matched.length,
        }),
        basis: 'prior',
        confidence: 'low',
        expectedImpact: matched.length > 0 && isZero(total.conversions) && total.costMicros > 0 ? wastedPerWeek(total) : null,
        inventorySnapshotOn: null,
        fingerprint,
      })
    }
  }

  // --- promote_search_term ---------------------------------------------------
  // A buyer-intent term that isn't a keyword yet, with promoteMinConversions+
  // conversions at a CPA no worse than its parent keyword's.
  const keywordTextsByAdGroup = new Map<number, Set<string>>()
  for (const k of input.keywords) {
    if (!keywordTextsByAdGroup.has(k.adGroupId)) keywordTextsByAdGroup.set(k.adGroupId, new Set())
    keywordTextsByAdGroup.get(k.adGroupId)!.add(normalizeTerm(k.text))
  }
  for (const s of input.searchTerms) {
    if (s.stats.conversions < t.promoteMinConversions) continue
    if (intentOf(s.text) !== 'buyer') continue
    const parent = keywordById.get(s.keywordId)
    const campaignId = campaignOfAdGroup(s.adGroupId)
    if (!parent || campaignId === null) continue
    if (keywordTextsByAdGroup.get(s.adGroupId)?.has(normalizeTerm(s.text))) continue
    const termCpa = cpa(s.stats)!
    const parentCpa = cpa(parent.stats)
    if (parentCpa === null || termCpa > t.promoteMaxCpaRatio * parentCpa) continue
    const fingerprint = fingerprintOf('promote_search_term', `ad_group:${s.adGroupId}|${normalizeTerm(s.text)}`)
    if (blockedByExisting(s.text, campaignId, s.adGroupId)) {
      skipped.push({ fingerprint, type: 'promote_search_term', reason: 'already_negative' })
      continue
    }
    raw.push({
      type: 'promote_search_term',
      campaignId,
      adGroupId: s.adGroupId,
      keywordId: s.keywordId,
      searchTermId: s.id,
      payload: { kind: 'promote_search_term', text: s.text, to_match_type: 'exact', ad_group_id: s.adGroupId },
      evidence: evidence(s.stats, null, {
        rules: ['promote.converting_buyer_term'],
        term_cpa_micros: Math.round(termCpa),
        parent_keyword_cpa_micros: Math.round(parentCpa),
        parent_keyword_conversions: round2(parent.stats.conversions),
        parent_match_type: parent.matchType,
      }),
      basis: 'evidence',
      confidence: cap(s.stats.conversions >= 2 * t.promoteMinConversions ? 'high' : 'medium', coldStart(parent)),
      expectedImpact: null,
      inventorySnapshotOn: null,
      fingerprint,
    })
  }

  // --- change_match_type -----------------------------------------------------
  // A broad/phrase keyword spending matchTypeWasteShare+ of its visible spend
  // on non-buyer intents, with enough of that traffic to be sure: tighten it
  // one step. (The "exact keyword with a buyer-intent surplus → loosen"
  // branch in section 11.1 is not built: the spec doesn't define the surplus
  // precisely enough to compute.)
  for (const k of input.keywords) {
    if (k.matchType === 'exact' || k.stats.costMicros <= 0) continue
    const campaignId = campaignOfAdGroup(k.adGroupId)
    if (campaignId === null) continue
    const terms = termsByKeyword.get(k.id) ?? []
    const visible = terms.reduce((acc, s) => addStats(acc, s.stats), emptyStats())
    if (visible.costMicros <= 0 || visible.costMicros / k.stats.costMicros < t.matchTypeMinCoverage) continue
    const waste = terms
      .filter((s) => {
        const i = intentOf(s.text)
        return i !== null && WASTE_INTENTS.includes(i)
      })
      .reduce((acc, s) => addStats(acc, s.stats), emptyStats())
    const share = waste.costMicros / visible.costMicros
    const minClicks = nMinFor(adGroupStats.get(k.adGroupId))
    if (share < t.matchTypeWasteShare || waste.clicks < minClicks) continue
    const to: MatchType = k.matchType === 'broad' ? 'phrase' : 'exact'
    raw.push({
      type: 'change_match_type',
      campaignId,
      adGroupId: k.adGroupId,
      keywordId: k.id,
      searchTermId: null,
      payload: { kind: 'change_match_type', from: k.matchType, to },
      evidence: evidence(k.stats, minClicks, {
        rules: ['match_type.non_buyer_spend'],
        non_buyer_spend_share: round4(share),
        non_buyer_cost_micros: waste.costMicros,
        non_buyer_clicks: waste.clicks,
        non_buyer_conversions: round2(waste.conversions),
        intent_coverage: round4(Math.min(1, visible.costMicros / k.stats.costMicros)),
      }),
      basis: 'evidence',
      confidence: cap(share >= 2 * t.matchTypeWasteShare ? 'high' : 'medium', coldStart(k)),
      expectedImpact: isZero(waste.conversions) ? wastedPerWeek(waste) : null,
      inventorySnapshotOn: null,
      fingerprint: fingerprintOf('change_match_type', `keyword:${k.id}|${to}`),
    })
  }

  // --- pause_keyword ---------------------------------------------------------
  // n_min clicks, zero conversions, and a reason it won't recover: Quality
  // Score ≤ pauseMaxQualityScore, or no stock of the vehicle it names.
  for (const k of input.keywords) {
    if (!isZero(k.stats.conversions)) continue
    const minClicks = nMinFor(adGroupStats.get(k.adGroupId))
    if (k.stats.clicks < minClicks) continue
    const campaignId = campaignOfAdGroup(k.adGroupId)
    if (campaignId === null) continue
    const stock = stockFor(k.id)
    const rules: string[] = []
    if (k.qualityScore !== null && k.qualityScore <= t.pauseMaxQualityScore) rules.push('pause.low_quality_score')
    if (stock !== null && stock.stockCount === 0) rules.push('pause.no_stock')
    if (rules.length === 0) continue
    raw.push({
      type: 'pause_keyword',
      campaignId,
      adGroupId: k.adGroupId,
      keywordId: k.id,
      searchTermId: null,
      payload: { kind: 'pause_keyword' },
      evidence: evidence(k.stats, minClicks, { rules, quality_score: k.qualityScore, ...stockEvidence(stock) }),
      basis: 'evidence',
      confidence: cap(k.stats.clicks >= 2 * minClicks ? 'high' : 'medium', coldStart(k)),
      expectedImpact: wastedPerWeek(k.stats),
      inventorySnapshotOn: stock ? snapshotOn : null,
      fingerprint: fingerprintOf('pause_keyword', `keyword:${k.id}`),
    })
  }

  // --- spin_out_campaign -----------------------------------------------------
  // spinOutMinKeywords+ keywords on one make/model in an ad group, whose
  // combined CPA is ≤ spinOutMaxCpaRatio × the ad group's, with enough
  // conversions, sharing the ad group with other (weaker) keywords.
  const clusters = new Map<string, { adGroupId: number; make: string; model: string; members: EngineKeyword[] }>()
  for (const k of input.keywords) {
    const p = input.vehicleParses.get(k.id)
    if (!p || p.make === null || p.model === null) continue
    const key = `${k.adGroupId}|${p.make}|${p.model}`
    if (!clusters.has(key)) clusters.set(key, { adGroupId: k.adGroupId, make: p.make, model: p.model, members: [] })
    clusters.get(key)!.members.push(k)
  }
  for (const c of clusters.values()) {
    if (c.members.length < t.spinOutMinKeywords) continue
    const campaignId = campaignOfAdGroup(c.adGroupId)
    const agStats = adGroupStats.get(c.adGroupId)
    if (campaignId === null || !agStats) continue
    const total = c.members.reduce((acc, k) => addStats(acc, k.stats), emptyStats())
    const clusterCpa = cpa(total)
    const agCpa = cpa(agStats)
    if (total.conversions < t.spinOutMinConversions || clusterCpa === null || agCpa === null) continue
    if (clusterCpa > t.spinOutMaxCpaRatio * agCpa) continue
    const memberIds = new Set(c.members.map((k) => k.id))
    const rest = input.keywords
      .filter((k) => k.adGroupId === c.adGroupId && !memberIds.has(k.id))
      .reduce((acc, k) => addStats(acc, k.stats), emptyStats())
    const restCpa = cpa(rest)
    if (rest.costMicros <= 0 || (restCpa !== null && restCpa <= clusterCpa)) continue
    const stock = inventoryAvailable
      ? matchStock({ make: c.make, model: c.model, yearFrom: null, yearTo: null }, input.inventory.vehicles, snapshotOn!)
      : null
    raw.push({
      type: 'spin_out_campaign',
      campaignId,
      adGroupId: c.adGroupId,
      keywordId: null,
      searchTermId: null,
      payload: {
        kind: 'spin_out_campaign',
        keyword_ids: [...memberIds].sort((a, b) => a - b),
        suggested_name: `Search — ${c.make} ${c.model}`,
        make: c.make,
        model: c.model,
      },
      evidence: evidence(total, null, {
        rules: ['spin_out.strong_cluster'],
        cluster_cpa_micros: Math.round(clusterCpa),
        ad_group_cpa_micros: Math.round(agCpa),
        rest_of_ad_group_cpa_micros: restCpa === null ? null : Math.round(restCpa),
        cluster_size: c.members.length,
        ...stockEvidence(stock),
      }),
      basis: 'evidence',
      confidence: cap(total.conversions >= 2 * t.spinOutMinConversions ? 'high' : 'medium', c.members.every((k) => coldStart(k))),
      expectedImpact: null,
      inventorySnapshotOn: stock ? snapshotOn : null,
      fingerprint: fingerprintOf('spin_out_campaign', `ad_group:${c.adGroupId}|${c.make}|${c.model}`.toLowerCase()),
    })
  }

  // --- raise_bid_candidate ---------------------------------------------------
  // Manual-bid keyword losing raiseBidMinRankLost+ of its impressions to rank
  // (more than the rest of its ad group), converting at or below target, on
  // aging stock. Target = the ad group's CPA (evidence) or, failing that,
  // the margin-based target (prior: it leans on the guessed lead-to-sale rate).
  const newKeywordCandidates: Candidate[] = []
  if (inventoryAvailable) {
    for (const k of input.keywords) {
      if (k.cpcBidMicros === null || k.rankLostShare === null || k.rankLostShare < t.raiseBidMinRankLost) continue
      if (k.stats.conversions < t.raiseBidMinConversions) continue
      const campaignId = campaignOfAdGroup(k.adGroupId)
      const stock = stockFor(k.id)
      if (campaignId === null || !stock || stock.stockCount === 0 || stock.avgDaysListed === null || stock.avgDaysListed <= t.agingDays) continue
      const peers = input.keywords.filter((p) => p.adGroupId === k.adGroupId && p.id !== k.id && p.rankLostShare !== null)
      const peerRankLost = peers.length ? peers.reduce((s, p) => s + p.rankLostShare!, 0) / peers.length : null
      if (peerRankLost !== null && k.rankLostShare <= peerRankLost) continue
      const kwCpa = cpa(k.stats)!
      const agCpa = cpa(adGroupStats.get(k.adGroupId) ?? emptyStats())
      const marginTarget = targetCpaMicros(stock.avgMarginIdr, settings.allowedSpendShare, settings.leadToSaleRate)
      let basis: Basis
      if (agCpa !== null && kwCpa <= agCpa) basis = 'evidence'
      else if (marginTarget !== null && kwCpa <= marginTarget.targetCpaMicros) basis = 'prior'
      else continue
      raw.push({
        type: 'raise_bid_candidate',
        campaignId,
        adGroupId: k.adGroupId,
        keywordId: k.id,
        searchTermId: null,
        payload: { kind: 'raise_bid_candidate', current_bid_micros: k.cpcBidMicros, rank_lost_share: round4(k.rankLostShare) },
        evidence: evidence(k.stats, null, {
          rules: ['raise_bid.rank_lost_on_aging_stock'],
          keyword_cpa_micros: Math.round(kwCpa),
          ad_group_cpa_micros: agCpa === null ? null : Math.round(agCpa),
          target_cpa_micros: marginTarget ? marginTarget.targetCpaMicros : null,
          ad_group_rank_lost_share: peerRankLost === null ? null : round4(peerRankLost),
          ...stockEvidence(stock),
        }),
        basis,
        confidence: cap(basis === 'evidence' && k.stats.conversions >= 2 * t.raiseBidMinConversions ? 'high' : 'medium', coldStart(k)),
        expectedImpact: null,
        inventorySnapshotOn: snapshotOn,
        fingerprint: fingerprintOf('raise_bid_candidate', `keyword:${k.id}`),
      })
    }

    // --- new_keyword (from stock) --------------------------------------------
    // An available make/model no keyword names yet. basis 'prior' until it
    // has its own data; a capped test keyword.
    const covered = new Set<string>()
    const makeAdGroups = new Map<string, Map<number, number>>() // make → ad group → keyword count
    for (const k of input.keywords) {
      const p = input.vehicleParses.get(k.id)
      if (!p || p.make === null) continue
      if (p.model !== null) covered.add(`${p.make}|${p.model}`.toLowerCase())
      const counts = makeAdGroups.get(p.make) ?? makeAdGroups.set(p.make, new Map()).get(p.make)!
      counts.set(k.adGroupId, (counts.get(k.adGroupId) ?? 0) + 1)
    }
    const allKeywordTexts = new Set(input.keywords.map((k) => normalizeTerm(k.text)))
    const models = new Map<string, { make: string; model: string }>()
    for (const v of input.inventory.vehicles) {
      if (v.status !== 'available') continue
      const key = `${v.make}|${v.model}`.toLowerCase()
      if (!covered.has(key) && !models.has(key)) models.set(key, { make: v.make, model: v.model })
    }
    for (const m of models.values()) {
      const stock = matchStock({ make: m.make, model: m.model, yearFrom: null, yearTo: null }, input.inventory.vehicles, snapshotOn!)
      if (!stock || stock.stockCount === 0) continue
      const text = `${m.make} ${m.model} bekas`.toLowerCase()
      if (allKeywordTexts.has(normalizeTerm(text))) continue
      const counts = makeAdGroups.get(m.make)
      const adGroupId = counts ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : null
      const campaignId = adGroupId === null ? null : campaignOfAdGroup(adGroupId)
      const fingerprint = fingerprintOf('new_keyword', `${normalizeTerm(text)}|phrase`)
      if (blockedByExisting(text, campaignId, adGroupId)) {
        skipped.push({ fingerprint, type: 'new_keyword', reason: 'already_negative' })
        continue
      }
      const target = targetCpaMicros(stock.avgMarginIdr, settings.allowedSpendShare, settings.leadToSaleRate)
      newKeywordCandidates.push({
        type: 'new_keyword',
        campaignId,
        adGroupId,
        keywordId: null,
        searchTermId: null,
        payload: {
          kind: 'new_keyword',
          text,
          match_type: 'phrase',
          ad_group_id: adGroupId,
          source: 'stock',
          vehicle_ids: stock.vehicleIds.map(Number).filter(Number.isFinite),
          is_test: true,
        },
        evidence: evidence(null, null, {
          rules: ['new_keyword.uncovered_stock'],
          make: m.make,
          model: m.model,
          target_cpa_micros: target ? target.targetCpaMicros : null,
          ...stockEvidence(stock),
        }),
        basis: 'prior',
        confidence: 'low',
        expectedImpact: null,
        inventorySnapshotOn: snapshotOn,
        fingerprint,
      })
    }
    // Most units first, then the freshest.
    newKeywordCandidates.sort(
      (a, b) =>
        (b.evidence.stock_count as number) - (a.evidence.stock_count as number) ||
        ((a.evidence.avg_days_listed as number | null) ?? 0) - ((b.evidence.avg_days_listed as number | null) ?? 0) ||
        a.fingerprint.localeCompare(b.fingerprint)
    )
  }

  // --- new_campaign (3.3, campaigns.ts) ---------------------------------------
  // Already ranked best first; capped below like new_keyword. Winner
  // keywords (3.6) lead each proposal's ad groups.
  const spunOut = new Set(
    raw.flatMap((c) => (c.payload.kind === 'spin_out_campaign' && c.payload.make && c.payload.model ? [modelKey(c.payload.make, c.payload.model)] : []))
  )
  const winners = findWinners(input, t, engineVerdicts(input))
  const campaignCandidates = proposeCampaigns(input, t, spunOut, winners)

  // --- guards ----------------------------------------------------------------
  const changedCampaigns = new Set<number | null>()
  for (const e of input.changeEvents) {
    const age = daysBetween(e.changedOn, input.asOf)
    if (age >= 0 && age < t.changeGuardDays) changedCampaigns.add(e.campaignId)
  }
  const recentlyChanged = (campaignId: number | null) =>
    changedCampaigns.has(null) || (campaignId !== null && changedCampaigns.has(campaignId))
  const history = new Map(input.history.map((h) => [h.fingerprint, h]))
  const inCooldown = (h: SuggestionHistory) => h.statusChangedOn !== null && daysBetween(h.statusChangedOn, input.asOf) < t.dismissedCooldownDays

  const produced: string[] = []
  const candidates: Candidate[] = []
  const capped: Candidate[] = []
  const existing: Candidate[] = []
  const seen = new Set<string>()
  const counts = { new_keyword: 0, new_campaign: 0, new_ad: 0 }
  const capFor = { new_keyword: t.newKeywordCap, new_campaign: t.campaignCap, new_ad: t.adCap }
  /** Runs one candidate through the guards; returns where it went. */
  const guard = (c: Candidate): 'new' | 'existing' | 'skipped' => {
    if (seen.has(c.fingerprint)) return 'skipped'
    seen.add(c.fingerprint)
    produced.push(c.fingerprint)
    const h = history.get(c.fingerprint)
    // An approved campaign proposal (planned) is kept like an open row:
    // never suggested twice, and never superseded by a later run.
    if (h?.status === 'open' || h?.status === 'planned' || h?.status === 'applied') {
      skipped.push({ fingerprint: c.fingerprint, type: c.type, reason: h.status })
      existing.push(c)
      return 'existing'
    }
    if (h?.status === 'dismissed' && inCooldown(h)) {
      skipped.push({ fingerprint: c.fingerprint, type: c.type, reason: 'dismissed_cooldown' })
      return 'skipped'
    }
    // 3.6: an ad's target, whatever its facts: a planned ad blocks a new
    // one; an applied or dismissed one does for the cooldown.
    if (c.payload.kind === 'new_ad') {
      const target = c.payload.ad_target
      const same = input.history.filter((x) => x.adTarget === target && x.fingerprint !== c.fingerprint)
      const block = same.find((x) => x.status === 'planned') ?? same.find((x) => (x.status === 'applied' || x.status === 'dismissed') && inCooldown(x))
      if (block) {
        skipped.push({ fingerprint: c.fingerprint, type: c.type, reason: block.status === 'dismissed' ? 'dismissed_cooldown' : (block.status as SkipReason) })
        return 'skipped'
      }
    }
    if (recentlyChanged(c.campaignId)) {
      skipped.push({ fingerprint: c.fingerprint, type: c.type, reason: 'change_event' })
      return 'skipped'
    }
    // Per-run caps. A campaign proposal's own ads aren't capped (bounded by
    // the campaign cap × its ad groups).
    const capKey = c.type === 'new_keyword' || c.type === 'new_campaign' ? c.type : c.payload.kind === 'new_ad' && c.payload.basis !== 'new_campaign' ? 'new_ad' : null
    if (capKey) {
      if (counts[capKey] >= capFor[capKey]) {
        skipped.push({ fingerprint: c.fingerprint, type: c.type, reason: 'cap' })
        capped.push(c)
        return 'skipped'
      }
      counts[capKey] += 1
    }
    candidates.push(c)
    return 'new'
  }

  const proposals: ProposalForAds[] = []
  for (const c of [...raw, ...newKeywordCandidates, ...campaignCandidates]) {
    const where = guard(c)
    if (c.type !== 'new_campaign') continue
    const h = history.get(c.fingerprint)
    // Ads go with proposals that are stored this run or kept open/planned.
    if (where === 'new' || (where === 'existing' && (h?.status === 'open' || h?.status === 'planned'))) {
      proposals.push({ candidate: c, suggestionId: where === 'existing' ? (h?.id ?? null) : null })
    }
  }

  // --- new_ad (3.6, ads.ts) ----------------------------------------------------
  const ads = proposeAds(input, t, winners, proposals)
  for (const f of ads.failedChecks) skipped.push({ fingerprint: f.fingerprint, type: 'new_ad', reason: 'checks', detail: f.problems.join('; ') })
  for (const c of ads.candidates) guard(c)

  return { candidates, capped, existing, produced, skipped, notEnoughData, inventoryAvailable }
}
