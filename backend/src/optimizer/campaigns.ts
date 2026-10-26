// Contract 3.3 — whole new campaign proposals from the inventory, the
// `new_campaign` suggestion (docs/overhaul-v3-backend.md section 11.7).
// Pure, like the rest of the engine: runEngine calls proposeCampaigns and
// applies the shared guards (dedupe, dismissed cooldown, change events) and
// the per-run cap (campaignCap) to what it returns.
//
// Three bases are built here:
// - uncovered_stock: a make/model with uncoveredMinUnits+ available units
//   that no enabled keyword names and no campaign is named after;
// - aging_stock: a thinly covered model with agingMinUnits+ units that are
//   aging (agingDays+ listed) or in the top quartile of margin. Thin =
//   thinCoverageMaxKeywords or fewer enabled keywords, or only needs_data /
//   steady verdicts with under promoteMinConversions conversions between
//   them (a model whose keywords convert is covered, even below n_min);
// - theme: a price band whose thinly covered models, not proposed on their
//   own this run, hold themeMinUnits+ units across themeMinModels+ models.
// proven_cluster is NOT built: a strong cluster stays a spin_out_campaign
// (engine.ts), and a model with a spin-out this run gets no new_campaign at
// all, so the same cluster is never proposed twice. Body-type
// themes aren't built either: the inventory has no body type.
//
// Every proposal leans on the guessed lead-to-sale rate (target CPA) and
// has no data of its own yet, so it is basis 'prior' and confidence at most
// 'medium'. Every number comes from the input.

import { normalizeTerm } from './intent.js'
import { negativeBlocks, JUNK_NEGATIVES, type NegativeSpec } from './negatives.js'
import { daysBetween, targetCpaMicros } from './stock.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import { engineVerdicts, winnersFor, type Winner } from './winners.js'
import { fingerprintOf } from './fingerprint.js'
import { normalizeCampaignName } from './campaignName.js'
import type { EngineThresholds } from './thresholds.js'
import type { Candidate, EngineInput, EngineKeyword } from './engine.js'
import type { CampaignBasis, Confidence, MatchType, NewCampaignPayload } from './types.js'
import type { Vehicle } from './inventory/types.js'

// Price bands for theme campaigns, in whole rupiah. STARTING DEFAULT, sized
// for the Jakarta used market (most stock between Rp 100 and 450 juta).
export const PRICE_BANDS: readonly { key: string; label: string; minIdr: number; maxIdr: number | null }[] = [
  { key: 'under_150', label: 'Used Cars Under Rp 150 Juta', minIdr: 0, maxIdr: 150_000_000 },
  { key: '150_250', label: 'Used Cars Rp 150–250 Juta', minIdr: 150_000_000, maxIdr: 250_000_000 },
  { key: '250_400', label: 'Used Cars Rp 250–400 Juta', minIdr: 250_000_000, maxIdr: 400_000_000 },
  { key: 'over_400', label: 'Used Cars Over Rp 400 Juta', minIdr: 400_000_000, maxIdr: null },
]

// Place words the generated keywords may borrow when the account's own
// keywords already use them. STARTING DEFAULT, Jabodetabek.
export const LOCATION_WORDS: readonly string[] = ['jakarta', 'bekasi', 'tangerang', 'depok', 'bogor', 'jabodetabek']
const LOCATIONS_PER_MODEL = 1

const THIN_VERDICTS = new Set(['needs_data', 'steady'])

type ProposalKeyword = NewCampaignPayload['ad_groups'][number]['keywords'][number]

interface ModelStock {
  make: string
  model: string
  units: Vehicle[] // available units only
}

interface Draft {
  basis: CampaignBasis
  fingerprint: string
  baseName: string
  theme: string | null
  groups: ModelStock[] // one ad group each, units already narrowed (theme: the band's units)
  confidence: Confidence
  extra: Record<string, unknown>
}

export const modelKey = (make: string, model: string) => `${make}|${model}`.toLowerCase()
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const avg = (xs: number[]) => (xs.length ? Math.round(sum(xs) / xs.length) : null)
const marginOf = (v: Vehicle) => (v.acquisitionCostIdr === null ? null : v.priceIdr - v.acquisitionCostIdr)

/** The q-quantile (nearest rank) of a list; null when empty. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
}

/** daily budget = clamp(allowed spend share × total margin ÷ 30, floor,
 * ceiling), in micros: the most the stock can justify, spread over a month.
 * No known margin (or none above zero) gets the floor. `bound` (3.4) says
 * which setting held it; a ceiling under the floor yields the floor. */
export function dailyBudget(
  totalMarginIdr: number,
  allowedSpendShare: number,
  floorIdr: number,
  ceilingIdr: number
): { dailyMicros: number; bound: 'floor' | 'ceiling' | null } {
  const raw = (Math.max(0, totalMarginIdr) * allowedSpendShare) / 30
  const [idr, bound] =
    raw < floorIdr ? [floorIdr, 'floor' as const]
    : raw > ceilingIdr ? (ceilingIdr < floorIdr ? [floorIdr, 'floor' as const] : [ceilingIdr, 'ceiling' as const])
    : [raw, null]
  return { dailyMicros: Math.round(idr) * 1_000_000, bound }
}

/** A name not in `taken` (compared like a synced campaign name): the base,
 * then "base 2", "base 3", … */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(normalizeCampaignName(base))) return base
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`
    if (!taken.has(normalizeCampaignName(name))) return name
  }
}

/** Candidate keywords for one model, best first: what the ad group would
 * hold if it had the campaign to itself. 3.6: the model's winner keywords
 * lead, as existing keywords. */
function keywordIdeas(m: ModelStock, locations: readonly string[], winners: readonly Winner[] = []): ProposalKeyword[] {
  const model = m.model.toLowerCase()
  const make = m.make.toLowerCase()
  const years = new Map<number, number>()
  for (const v of m.units) years.set(v.year, (years.get(v.year) ?? 0) + 1)
  const topYear = [...years.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]
  const ideas: { text: string; match_type: MatchType }[] = [
    { text: `${model} bekas`, match_type: 'phrase' },
    { text: `${make} ${model} bekas`, match_type: 'exact' },
    { text: `harga ${model} bekas`, match_type: 'phrase' },
    ...locations.slice(0, LOCATIONS_PER_MODEL).map((l) => ({ text: `${model} bekas ${l}`, match_type: 'phrase' as MatchType })),
    { text: `${model} second`, match_type: 'phrase' },
    ...(topYear === undefined ? [] : [{ text: `${model} ${topYear} bekas`, match_type: 'phrase' as MatchType }]),
  ]
  return [
    ...winners.map((w) => ({ text: w.text.toLowerCase(), match_type: w.matchType, source: 'existing_keyword' as const })),
    ...ideas.map((k) => ({ ...k, source: 'stock' as const })),
  ]
}

/** `spunOut`: make/model keys (modelKey) with a spin_out_campaign this run.
 * `winners` (3.6): the account's winner keywords (winners.ts). */
export function proposeCampaigns(
  input: EngineInput,
  t: EngineThresholds,
  spunOut: ReadonlySet<string> = new Set(),
  winners: readonly Winner[] = []
): Candidate[] {
  if (input.inventory.source === 'unavailable' || input.inventory.snapshotOn === null) return []
  const snapshotOn = input.inventory.snapshotOn
  const { settings } = input

  // --- stock by model --------------------------------------------------------
  const stock = new Map<string, ModelStock>()
  for (const v of input.inventory.vehicles) {
    if (v.status !== 'available') continue
    const key = modelKey(v.make, v.model)
    if (!stock.has(key)) stock.set(key, { make: v.make, model: v.model, units: [] })
    stock.get(key)!.units.push(v)
  }
  if (stock.size === 0) return []
  const daysListed = (v: Vehicle) => daysBetween(v.listedOn, snapshotOn)
  const knownMargins = [...stock.values()].flatMap((m) => m.units.map(marginOf)).filter((x): x is number => x !== null)
  // Top quartile: at or above the quantile and above the median, so equal
  // margins (or a one-model stock) don't make every unit "top".
  const topMarginFrom = quantile(knownMargins, t.topMarginQuantile)
  const median = quantile(knownMargins, 0.5)
  const isTopMargin = (v: Vehicle) => {
    const m = marginOf(v)
    return m !== null && topMarginFrom !== null && m >= topMarginFrom && m > median!
  }

  // --- coverage: enabled keywords and campaigns naming each model -----------
  const adGroupById = new Map(input.adGroups.map((a) => [a.id, a]))
  const keywordsByModel = new Map<string, EngineKeyword[]>()
  for (const k of input.keywords) {
    const p = input.vehicleParses.get(k.id)
    if (!p || p.make === null || p.model === null) continue
    const key = modelKey(p.make, p.model)
    if (!keywordsByModel.has(key)) keywordsByModel.set(key, [])
    keywordsByModel.get(key)!.push(k)
  }
  const dictionary = buildDictionary(input.inventory.vehicles)
  const campaignModels = new Map<number, string | null>()
  for (const c of input.campaigns) {
    const p = parseVehicle(c.name, dictionary)
    campaignModels.set(c.id, p.make !== null && p.model !== null ? modelKey(p.make, p.model) : null)
  }
  const campaignNamesModel = (key: string) => [...campaignModels.values()].includes(key)

  const verdicts = engineVerdicts(input)
  const isThin = (key: string) => {
    const kws = keywordsByModel.get(key) ?? []
    if (kws.length <= t.thinCoverageMaxKeywords) return true
    return kws.every((k) => THIN_VERDICTS.has(verdicts.get(k.id)!)) && sum(kws.map((k) => k.stats.conversions)) < t.promoteMinConversions
  }

  // --- drafts ------------------------------------------------------------------
  const drafts: Draft[] = []
  const proposedModels = new Set<string>()
  const models = [...stock.entries()].filter(([key]) => !spunOut.has(key)).sort(([a], [b]) => a.localeCompare(b))
  for (const [key, m] of models) {
    const keywords = keywordsByModel.get(key) ?? []
    const named = `${m.make} ${m.model}`
    if (keywords.length === 0 && !campaignNamesModel(key)) {
      if (m.units.length < t.uncoveredMinUnits) continue
      proposedModels.add(key)
      drafts.push({
        basis: 'uncovered_stock',
        fingerprint: fingerprintOf('new_campaign', `model:${key}`),
        baseName: `Search — ${named}`,
        theme: null,
        groups: [m],
        confidence: 'medium',
        extra: { rules: ['campaign.uncovered_stock'], existing_keywords: 0 },
      })
      continue
    }
    if (!isThin(key)) continue
    const aging = m.units.filter((v) => daysListed(v) >= t.agingDays)
    const topMargin = m.units.filter(isTopMargin)
    const qualifying = m.units.filter((v) => daysListed(v) >= t.agingDays || isTopMargin(v))
    if (qualifying.length < t.agingMinUnits) continue
    proposedModels.add(key)
    drafts.push({
      basis: 'aging_stock',
      fingerprint: fingerprintOf('new_campaign', `model:${key}`),
      baseName: `Search — ${named}`,
      theme: null,
      groups: [m],
      confidence: 'medium',
      extra: {
        rules: ['campaign.aging_stock'],
        existing_keywords: keywords.length,
        aging_units: aging.length,
        top_margin_units: topMargin.length,
        top_margin_from_idr: topMarginFrom,
      },
    })
  }

  for (const band of PRICE_BANDS) {
    const inBand = (v: Vehicle) => v.priceIdr >= band.minIdr && (band.maxIdr === null || v.priceIdr < band.maxIdr)
    const groups = models
      .filter(([key]) => !proposedModels.has(key) && isThin(key))
      .map(([, m]) => ({ ...m, units: m.units.filter(inBand) }))
      .filter((m) => m.units.length > 0)
      // The models the stock can justify most: units × average margin.
      .sort((a, b) => sum(b.units.map((v) => marginOf(v) ?? 0)) - sum(a.units.map((v) => marginOf(v) ?? 0)) || modelKey(a.make, a.model).localeCompare(modelKey(b.make, b.model)))
      .slice(0, t.campaignMaxAdGroups)
    const units = sum(groups.map((g) => g.units.length))
    if (units < t.themeMinUnits || groups.length < t.themeMinModels) continue
    drafts.push({
      basis: 'theme',
      fingerprint: fingerprintOf('new_campaign', `theme:price:${band.key}`),
      baseName: `Search — ${band.label}`,
      theme: band.label,
      groups,
      confidence: 'low',
      extra: { rules: ['campaign.theme_price_band'], price_band: band.key, price_min_idr: band.minIdr, price_max_idr: band.maxIdr },
    })
  }
  if (drafts.length === 0) return []

  // --- shared pieces -----------------------------------------------------------
  const starterNegatives: NegativeSpec[] = []
  const seenNeg = new Set<string>()
  for (const n of [...JUNK_NEGATIVES, ...input.negatives.filter((n) => n.scope === 'campaign')]) {
    const key = `${normalizeTerm(n.text)}|${n.matchType}`
    if (seenNeg.has(key)) continue
    seenNeg.add(key)
    starterNegatives.push({ text: n.text, matchType: n.matchType })
  }
  // What would stop a generated keyword from serving in the new campaign:
  // its starter negatives and the account's shared lists. Any negative with
  // the very same words is also out (it was put there on purpose).
  const blocking = [...starterNegatives, ...input.negatives.filter((n) => n.scope === 'shared_set')]
  const negativeTexts = new Set(input.negatives.map((n) => normalizeTerm(n.text)))
  const existingTexts = new Set(input.keywords.map((k) => normalizeTerm(k.text)))

  // The words the account's keywords already use for places, most used first.
  const locationUse = new Map<string, number>()
  for (const k of input.keywords) for (const w of normalizeTerm(k.text).split(' ')) if (LOCATION_WORDS.includes(w)) locationUse.set(w, (locationUse.get(w) ?? 0) + 1)
  const locations = [...locationUse.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w]) => w)

  // Names already in use: real campaigns, open or planned proposals (other
  // than this proposal's own earlier row), and this run's earlier drafts.
  const takenBase = new Set(input.campaigns.map((c) => normalizeCampaignName(c.name)))
  const proposalNames = input.history.filter((h) => (h.status === 'open' || h.status === 'planned') && h.campaignName)

  const out: Candidate[] = []
  const usedThisRun = new Set<string>()
  for (const d of drafts) {
    const taken = new Set(takenBase)
    for (const h of proposalNames) if (h.fingerprint !== d.fingerprint) taken.add(normalizeCampaignName(h.campaignName!))
    for (const n of usedThisRun) taken.add(n)
    const name = uniqueName(d.baseName, taken)
    usedThisRun.add(normalizeCampaignName(name))

    // Keywords: round-robin across ad groups, best idea first, up to the cap.
    const ideas = d.groups.map((g) => keywordIdeas(g, locations, winnersFor(winners, g.make, g.model)))
    const picked = d.groups.map(() => [] as ProposalKeyword[])
    const used = new Set<string>()
    let total = 0
    for (let i = 0; total < t.campaignMaxKeywords && ideas.some((list) => i < list.length); i++) {
      for (let g = 0; g < ideas.length && total < t.campaignMaxKeywords; g++) {
        const k = ideas[g][i]
        if (!k) continue
        const n = normalizeTerm(k.text)
        // A winner keeps its text although an enabled keyword has it (3.6).
        const taken = k.source !== 'existing_keyword' && existingTexts.has(n)
        if (used.has(n) || taken || negativeTexts.has(n) || blocking.some((neg) => negativeBlocks(neg, k.text))) continue
        used.add(n)
        picked[g].push(k)
        total += 1
      }
    }
    const adGroups = d.groups
      .map((g, i) => ({
        name: `${g.make} ${g.model}`,
        keywords: picked[i],
        vehicle_ids: g.units.map((v) => Number(v.id)).filter(Number.isFinite),
      }))
      .filter((g) => g.keywords.length > 0)
    if (adGroups.length === 0) continue

    const units = d.groups.flatMap((g) => g.units)
    const margins = units.map(marginOf).filter((x): x is number => x !== null)
    const avgMargin = avg(margins)
    const target = targetCpaMicros(avgMargin, settings.allowedSpendShare, settings.leadToSaleRate)
    const budget = dailyBudget(sum(margins), settings.allowedSpendShare, settings.budgetFloorIdr, settings.budgetCeilingIdr)

    // Existing campaigns already reaching these models.
    const keys = new Set(d.groups.map((g) => modelKey(g.make, g.model)))
    const shared = new Map<number, number>()
    for (const key of keys) {
      for (const k of keywordsByModel.get(key) ?? []) {
        const c = adGroupById.get(k.adGroupId)?.campaignId
        if (c !== undefined) shared.set(c, (shared.get(c) ?? 0) + 1)
      }
    }
    const overlaps = input.campaigns
      .filter((c) => shared.has(c.id) || keys.has(campaignModels.get(c.id) ?? ''))
      .map((c) => ({ campaign_id: c.id, name: c.name, shared_keywords: shared.get(c.id) ?? 0 }))
      .sort((a, b) => b.shared_keywords - a.shared_keywords || a.campaign_id - b.campaign_id)

    const payload: NewCampaignPayload = {
      kind: 'new_campaign',
      basis: d.basis,
      name,
      theme: d.theme,
      ad_groups: adGroups,
      starter_negatives: starterNegatives.map((n) => ({ text: n.text, match_type: n.matchType })),
      budget: {
        daily_micros: budget.dailyMicros,
        target_cpa_micros: target ? target.targetCpaMicros : null,
        assumptions: { allowed_spend_share: settings.allowedSpendShare, lead_to_sale_rate: settings.leadToSaleRate },
        bound: budget.bound,
      },
      stock: {
        units: units.length,
        avg_days_listed: avg(units.map(daysListed)),
        avg_margin_idr: avgMargin,
        total_value_idr: units.length ? sum(units.map((v) => v.priceIdr)) : null,
        snapshot_on: snapshotOn,
      },
      overlaps,
    }
    out.push({
      type: 'new_campaign',
      campaignId: null,
      adGroupId: null,
      keywordId: null,
      searchTermId: null,
      payload,
      evidence: {
        window_start: input.windowStart,
        window_end: input.windowEnd,
        clicks: null,
        impressions: null,
        cost_micros: null,
        conversions: null,
        conversions_value_micros: null,
        min_clicks_required: null,
        ...d.extra,
        models: d.groups.map((g) => ({ make: g.make, model: g.model, units: g.units.length })),
        // The ranking score: units × average margin.
        stock_margin_score_idr: units.length * (avgMargin ?? 0),
      },
      basis: 'prior',
      confidence: d.confidence,
      expectedImpact: null,
      inventorySnapshotOn: snapshotOn,
      fingerprint: d.fingerprint,
    })
  }

  // Best first: units × average margin, then the fingerprint for a stable order.
  return out.sort(
    (a, b) => (b.evidence.stock_margin_score_idr as number) - (a.evidence.stock_margin_score_idr as number) || a.fingerprint.localeCompare(b.fingerprint)
  )
}
