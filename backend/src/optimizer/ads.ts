// Contract 3.6 — the new_ad suggestion (docs/overhaul-v3-backend.md
// section 11.9). Pure, like the rest of the engine: runEngine calls
// proposeAds after the campaign proposals have been through the guards, and
// applies the ad guards (dedupe by target, cooldowns, the per-run cap) to
// what it returns.
//
// Three bases:
// - new_campaign:     one ad per ad group of every open or planned campaign
//                     proposal (and every one this run stores);
// - weak_ad:          an existing ad group with stock behind it or winner
//                     keywords whose live ad is 'poor' or 'average' strength;
//                     the weakest such ad is replaced (replaces_ad);
// - uncovered_winner: an existing ad group with winner keywords whose key
//                     words (the model, or the make for a make-level winner)
//                     appear in none of its headlines.
// The copy is the template (adCopy.ts); one that fails a check isn't
// proposed. Facts come from the inventory snapshot and the dealer settings,
// never from the model. No units, no ad.

import { createHash } from 'node:crypto'
import { normalizeTerm } from './intent.js'
import { canonicalJson } from './canonicalJson.js'
import { checkAd, passes, problemList, templateCopy, toTexts, type CopyContext } from './adCopy.js'
import { daysBetween } from './stock.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import { fingerprintOf } from './fingerprint.js'
import { winnersFor, type Winner } from './winners.js'
import type { Candidate, EngineAd, EngineInput, WindowStats } from './engine.js'
import type { AdBasis, AdClaim, AdFacts, AdTarget, Basis, Confidence, NewAdPayload } from './types.js'
import { AD_CLAIMS } from './types.js'
import type { Vehicle } from './inventory/types.js'

/** The dealer profile and claims ad copy may use (contract 3.6 settings). */
export interface AdSettings {
  dealerName: string
  dealerCity: string | null
  dealerArea: string | null
  dealerWhatsapp: string | null
  landingUrl: string | null
  claims: Record<AdClaim, boolean>
  inspectionWording: string | null
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null)
const ctr = (s: WindowStats) => (s.impressions > 0 ? s.clicks / s.impressions : 0)
const round4 = (n: number) => Math.round(n * 10000) / 10000
const STRENGTH_ORDER = { poor: 0, average: 1 } as const

/** The claims the settings allow, in contract order. */
export const claimsUsed = (s: AdSettings): AdClaim[] => AD_CLAIMS.filter((c) => s.claims[c])

/** What the copy may use besides the facts. */
export const copyContext = (s: AdSettings): CopyContext => ({ inspectionWording: s.claims.inspection ? s.inspectionWording : null })

/** AdFacts for the available units of one make (and model, unless null).
 * Null when there are none. */
export function buildFacts(units: readonly Vehicle[], make: string | null, model: string | null, s: AdSettings, snapshotOn: string): AdFacts | null {
  if (units.length === 0) return null
  const prices = units.map((v) => v.priceIdr)
  const yrs = units.map((v) => v.year)
  const mileages = units.flatMap((v) => (v.mileageKm === null ? [] : [v.mileageKm]))
  return {
    make,
    model,
    units: units.length,
    year_from: Math.min(...yrs),
    year_to: Math.max(...yrs),
    price_from_idr: Math.min(...prices),
    price_to_idr: Math.max(...prices),
    mileage_from_km: mileages.length ? Math.min(...mileages) : null,
    dealer: s.dealerName,
    city: s.dealerCity,
    area: s.dealerArea,
    whatsapp: s.dealerWhatsapp,
    claims_used: claimsUsed(s),
    snapshot_on: snapshotOn,
  }
}

/** An ad's identity: its target plus a hash of the facts that reach the copy
 * and of its winners (and its URL), so changed facts make a new suggestion
 * and retire the old one. `adTarget` is stable across runs: 'ad_group:<id>|
 * <make>|<model>' or 'proposal:<campaign fingerprint>|<ad group name>'. */
export function adFingerprint(adTarget: string, f: AdFacts, winners: readonly string[], finalUrl: string | null): string {
  const { snapshot_on: _on, ...copyFacts } = f
  const hash = createHash('sha256').update(canonicalJson({ ...copyFacts, winners, final_url: finalUrl })).digest('hex').slice(0, 16)
  return fingerprintOf('new_ad', `${adTarget}|${hash}`)
}

export interface ProposalForAds {
  candidate: Candidate // a new_campaign candidate
  suggestionId: number | null // its stored id, when it already has a row
}

export interface AdProposals {
  candidates: Candidate[]
  // Templates that failed a check: not proposed, reported in the trace.
  failedChecks: { fingerprint: string; problems: string[] }[]
}

export function proposeAds(input: EngineInput, winners: readonly Winner[], proposals: readonly ProposalForAds[]): AdProposals {
  const out: AdProposals = { candidates: [], failedChecks: [] }
  const s = input.adSettings
  if (!s || input.inventory.source === 'unavailable' || input.inventory.snapshotOn === null) return out
  const snapshotOn = input.inventory.snapshotOn
  const ctx = copyContext(s)
  const available = input.inventory.vehicles.filter((v) => v.status === 'available')
  const unitsOf = (make: string, model: string | null) => available.filter((v) => same(v.make, make) && (model === null || same(v.model, model)))
  const ads = input.ads ?? []
  const adGroupById = new Map(input.adGroups.map((a) => [a.id, a]))
  const campaignById = new Map(input.campaigns.map((c) => [c.id, c]))
  const finalUrl = s.landingUrl

  const build = (a: {
    basis: AdBasis
    target: AdTarget
    adTarget: string
    facts: AdFacts
    winners: readonly Winner[]
    replacesAd: NewAdPayload['replaces_ad']
    campaignId: number | null
    adGroupId: number | null
    stats: WindowStats | null
    extra: Record<string, unknown>
    basisOf: Basis
    confidence: Confidence
  }) => {
    const winnerTexts = a.winners.map((w) => w.text)
    const copy = templateCopy(a.facts, ctx, winnerTexts)
    const result = checkAd(copy, a.facts, ctx)
    const fingerprint = adFingerprint(a.adTarget, a.facts, winnerTexts, finalUrl)
    if (!passes(result)) {
      out.failedChecks.push({ fingerprint, problems: problemList(result) })
      return
    }
    const payload: NewAdPayload = {
      kind: 'new_ad',
      target: a.target,
      basis: a.basis,
      headlines: toTexts(copy.headlines),
      descriptions: toTexts(copy.descriptions),
      path1: copy.path1,
      path2: copy.path2,
      final_url: finalUrl,
      facts: a.facts,
      winner_keywords: a.winners.map((w) => ({ keyword_id: w.keywordId, text: w.text })),
      replaces_ad: a.replacesAd,
      checks: result.flags,
      polished: false,
    }
    const units = a.facts.make === null ? [] : unitsOf(a.facts.make, a.facts.model)
    const margins = units.flatMap((v) => (v.acquisitionCostIdr === null ? [] : [v.priceIdr - v.acquisitionCostIdr]))
    out.candidates.push({
      type: 'new_ad',
      campaignId: a.campaignId,
      adGroupId: a.adGroupId,
      keywordId: null,
      searchTermId: null,
      payload,
      evidence: {
        window_start: input.windowStart,
        window_end: input.windowEnd,
        clicks: a.stats ? a.stats.clicks : null,
        impressions: a.stats ? a.stats.impressions : null,
        cost_micros: a.stats ? a.stats.costMicros : null,
        conversions: a.stats ? Math.round(a.stats.conversions * 100) / 100 : null,
        conversions_value_micros: a.stats ? a.stats.conversionsValueMicros : null,
        min_clicks_required: null,
        ...a.extra,
        // Where the ad goes, stable across runs: the dedupe key for planned,
        // applied and dismissed ads whatever their facts.
        ad_target: a.adTarget,
        stock_count: a.facts.units,
        avg_days_listed: avg(units.map((v) => daysBetween(v.listedOn, snapshotOn))),
        avg_margin_idr: avg(margins),
        vehicle_ids: units.map((v) => Number(v.id)).filter(Number.isFinite).sort((x, y) => x - y),
      },
      basis: a.basisOf,
      confidence: a.confidence,
      expectedImpact: null,
      inventorySnapshotOn: snapshotOn,
      fingerprint,
    })
  }

  // --- new_campaign: one ad per proposal ad group -----------------------------
  const byId = new Map(available.map((v) => [Number(v.id), v]))
  for (const p of proposals) {
    if (p.candidate.payload.kind !== 'new_campaign') continue
    const proposal = p.candidate.payload
    for (const g of proposal.ad_groups) {
      const units = g.vehicle_ids.flatMap((id) => byId.get(id) ?? [])
      if (units.length === 0) continue
      const { make, model } = units[0]
      const facts = buildFacts(units, make, model, s, snapshotOn)
      if (!facts) continue
      build({
        basis: 'new_campaign',
        // A proposal stored this run gets its id when both rows are stored
        // (suggestions.ts persistSuggestions); 0 until then.
        target: { kind: 'proposed_campaign', campaign_suggestion_id: p.suggestionId ?? 0, ad_group_name: g.name },
        adTarget: `proposal:${p.candidate.fingerprint}|${g.name}`,
        facts,
        winners: winnersFor(winners, make, model),
        replacesAd: null,
        campaignId: null,
        adGroupId: null,
        stats: null,
        extra: { rules: ['ad.new_campaign'], campaign_fingerprint: p.candidate.fingerprint, campaign_name: proposal.name },
        basisOf: 'prior',
        confidence: 'low',
      })
    }
  }

  // The make/model an existing ad group is about: its name, else its best
  // winner keyword.
  const dictionary = buildDictionary(input.inventory.vehicles)
  const winnersByGroup = new Map<number, Winner[]>()
  for (const w of winners) if (w.adGroupId !== null) winnersByGroup.set(w.adGroupId, [...(winnersByGroup.get(w.adGroupId) ?? []), w])
  const subjectOf = (adGroupId: number, name: string): { make: string; model: string | null } | null => {
    const parse = parseVehicle(name, dictionary)
    if (parse.make !== null) return { make: parse.make, model: parse.model }
    const top = winnersByGroup.get(adGroupId)?.[0]
    return top ? { make: top.make, model: top.model } : null
  }
  const adsByGroup = new Map<number, EngineAd[]>()
  for (const a of ads) adsByGroup.set(a.adGroupId, [...(adsByGroup.get(a.adGroupId) ?? []), a])
  const groupTarget = (adGroupId: number, make: string, model: string | null) => `ad_group:${adGroupId}|${make}|${model ?? ''}`.toLowerCase()

  // --- weak_ad: the weakest poor or average ad of an ad group with stock ------
  const weakGroups = new Set<number>()
  const weak: { score: number; run: () => void }[] = []
  for (const [adGroupId, groupAds] of [...adsByGroup.entries()].sort(([a], [b]) => a - b)) {
    const ag = adGroupById.get(adGroupId)
    if (!ag) continue
    const subject = subjectOf(adGroupId, ag.name)
    if (!subject) continue
    const facts = buildFacts(unitsOf(subject.make, subject.model), subject.make, subject.model, s, snapshotOn)
    if (!facts) continue
    // Poor before average, then the lowest CTR, then the oldest.
    const pick = groupAds
      .filter((a) => a.adStrength === 'poor' || a.adStrength === 'average')
      .sort((x, y) => STRENGTH_ORDER[x.adStrength as 'poor' | 'average'] - STRENGTH_ORDER[y.adStrength as 'poor' | 'average'] || ctr(x.stats) - ctr(y.stats) || x.id - y.id)[0]
    if (!pick) continue
    weakGroups.add(adGroupId)
    weak.push({
      score: pick.stats.impressions,
      run: () =>
        build({
          basis: 'weak_ad',
          target: { kind: 'existing_ad_group', ad_group_id: adGroupId },
          adTarget: groupTarget(adGroupId, subject.make, subject.model),
          facts,
          winners: winnersFor(winners, subject.make, subject.model),
          replacesAd: { id: pick.id, label: pick.label, ad_strength: pick.adStrength },
          campaignId: ag.campaignId,
          adGroupId,
          stats: pick.stats,
          extra: {
            rules: [pick.adStrength === 'poor' ? 'ad.weak_ad.poor_strength' : 'ad.weak_ad.average_strength'],
            ad_strength: pick.adStrength,
            ctr: round4(ctr(pick.stats)),
            campaign_name: campaignById.get(ag.campaignId)?.name ?? null,
            ad_group_name: ag.name,
          },
          basisOf: 'evidence',
          confidence: 'medium',
        }),
    })
  }

  // --- uncovered_winner: winners whose key words no headline carries ----------
  const uncovered: { score: number; run: () => void }[] = []
  const groups = new Map<string, { adGroupId: number; make: string; model: string | null; winners: Winner[] }>()
  for (const w of winners) {
    if (w.adGroupId === null || weakGroups.has(w.adGroupId)) continue
    const k = groupTarget(w.adGroupId, w.make, w.model)
    if (!groups.has(k)) groups.set(k, { adGroupId: w.adGroupId, make: w.make, model: w.model, winners: [] })
    groups.get(k)!.winners.push(w)
  }
  for (const [k, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ag = adGroupById.get(g.adGroupId)
    if (!ag) continue
    const groupAds = adsByGroup.get(g.adGroupId) ?? []
    const keyWords = ` ${normalizeTerm(g.model ?? g.make)} `
    if (groupAds.some((a) => a.headlines.some((h) => ` ${normalizeTerm(h)} `.includes(keyWords)))) continue
    const facts = buildFacts(unitsOf(g.make, g.model), g.make, g.model, s, snapshotOn)
    if (!facts) continue
    const total = g.winners.reduce(
      (acc, w) => {
        const kw = w.keywordId === null ? undefined : input.keywords.find((x) => x.id === w.keywordId)
        if (kw) {
          acc.impressions += kw.stats.impressions
          acc.clicks += kw.stats.clicks
          acc.costMicros += kw.stats.costMicros
          acc.conversions += kw.stats.conversions
          acc.conversionsValueMicros += kw.stats.conversionsValueMicros
        }
        return acc
      },
      { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValueMicros: 0 } as WindowStats
    )
    const conversions = g.winners.reduce((sum, w) => sum + w.conversions, 0)
    uncovered.push({
      score: conversions,
      run: () =>
        build({
          basis: 'uncovered_winner',
          target: { kind: 'existing_ad_group', ad_group_id: g.adGroupId },
          adTarget: k,
          facts,
          winners: g.winners,
          replacesAd: null,
          campaignId: ag.campaignId,
          adGroupId: g.adGroupId,
          stats: total.clicks > 0 || total.impressions > 0 ? total : null,
          extra: {
            rules: ['ad.uncovered_winner'],
            winner_count: g.winners.length,
            winner_conversions: Math.round(conversions * 100) / 100,
            campaign_name: campaignById.get(ag.campaignId)?.name ?? null,
            ad_group_name: ag.name,
          },
          basisOf: 'evidence',
          confidence: 'medium',
        }),
    })
  }

  // The capped bases in cap order: weak ads by impressions, then uncovered
  // winners by their conversions (runEngine applies adCap in this order).
  for (const w of weak.sort((a, b) => b.score - a.score)) w.run()
  for (const u of uncovered.sort((a, b) => b.score - a.score)) u.run()
  return out
}
