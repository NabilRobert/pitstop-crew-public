// Contract 3.6 — the new_ad suggestion (docs/overhaul-v3-backend.md
// section 11.9). Pure, like the rest of the engine: runEngine calls
// proposeAds after the campaign proposals have been through the guards, and
// applies the ad guards (dedupe by ad_target, cooldowns, the per-run cap)
// to what it returns.
//
// Three bases:
// - new_campaign:     one ad per ad group of every campaign proposal this
//                     run stores or keeps (new, open or planned);
// - weak_ad:          an ad group that parses to a make with stock, whose
//                     weakest enabled ad is 'poor' strength or has a CTR at
//                     most weakAdCtrRatio × the best other ad's (both with
//                     weakAdMinImpressions+ impressions);
// - uncovered_winner: winner keywords for a model in an ad group where no
//                     enabled ad's headline names that model.
// The copy is the template (adCopy.ts); one that fails a check isn't
// proposed. Facts come from the inventory snapshot and the dealer settings,
// never from the model.

import { createHash } from 'node:crypto'
import { normalizeTerm } from './intent.js'
import { canonicalJson } from './canonicalJson.js'
import { checkAd, passes, templateCopy } from './adCopy.js'
import { daysBetween } from './stock.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import { fingerprintOf } from './fingerprint.js'
import { winnersFor, type Winner } from './winners.js'
import type { EngineThresholds } from './thresholds.js'
import type { Candidate, EngineAd, EngineInput, WindowStats } from './engine.js'
import type { AdBasis, AdFacts, Confidence, NewAdPayload, Basis } from './types.js'
import type { Vehicle } from './inventory/types.js'

/** The dealer settings ad copy may use (contract 3.6). */
export interface AdSettings {
  dealerName: string
  dealerCity: string
  dealerArea: string | null
  dealerWhatsapp: string | null
  landingUrl: string | null
  claims: AdFacts['claims']
  inspectionWording: string
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null)
const ctr = (s: WindowStats) => (s.impressions > 0 ? s.clicks / s.impressions : 0)
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** AdFacts for a set of available units of one make (and model, unless
 * null). Null when there are none. */
export function buildFacts(units: readonly Vehicle[], make: string, model: string | null, s: AdSettings, snapshotOn: string): AdFacts | null {
  if (units.length === 0) return null
  const prices = units.map((v) => v.priceIdr)
  const yrs = units.map((v) => v.year)
  return {
    make,
    model,
    models: [...new Set(units.map((v) => v.model))].sort((a, b) => a.localeCompare(b)),
    units: units.length,
    year_min: Math.min(...yrs),
    year_max: Math.max(...yrs),
    price_min_idr: Math.min(...prices),
    price_max_idr: Math.max(...prices),
    vehicle_ids: units.map((v) => Number(v.id)).filter(Number.isFinite).sort((a, b) => a - b),
    dealer: { name: s.dealerName, city: s.dealerCity, area: s.dealerArea, whatsapp: s.dealerWhatsapp },
    claims: { ...s.claims },
    inspection_wording: s.claims.inspection ? s.inspectionWording : null,
    snapshot_on: snapshotOn,
  }
}

/** An ad's identity: its target plus the facts that reach the copy (and its
 * URL), so changed facts make a new suggestion and retire the old one. */
export function adFingerprint(adTarget: string, f: AdFacts, finalUrl: string | null): string {
  const { vehicle_ids: _ids, snapshot_on: _on, ...copyFacts } = f
  const hash = createHash('sha256').update(canonicalJson({ ...copyFacts, final_url: finalUrl })).digest('hex').slice(0, 16)
  return fingerprintOf('new_ad', `${adTarget}|${hash}`)
}

/** The URL most used by a list of ads (ties: the first in id order). */
function mostUsedUrl(ads: readonly EngineAd[]): string | null {
  const counts = new Map<string, number>()
  for (const a of [...ads].sort((x, y) => x.id - y.id)) if (a.finalUrl) counts.set(a.finalUrl, (counts.get(a.finalUrl) ?? 0) + 1)
  let best: string | null = null
  for (const [url, n] of counts) if (best === null || n > counts.get(best)!) best = url
  return best
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

export function proposeAds(input: EngineInput, t: EngineThresholds, winners: readonly Winner[], proposals: readonly ProposalForAds[]): AdProposals {
  const out: AdProposals = { candidates: [], failedChecks: [] }
  const s = input.adSettings
  if (!s || input.inventory.source === 'unavailable' || input.inventory.snapshotOn === null) return out
  const snapshotOn = input.inventory.snapshotOn
  const available = input.inventory.vehicles.filter((v) => v.status === 'available')
  const unitsOf = (make: string, model: string | null) => available.filter((v) => same(v.make, make) && (model === null || same(v.model, model)))
  const ads = input.ads ?? []
  const adGroupById = new Map(input.adGroups.map((a) => [a.id, a]))
  const campaignById = new Map(input.campaigns.map((c) => [c.id, c]))
  const accountUrl = mostUsedUrl(ads)

  const urlFor = (adGroupAds: readonly EngineAd[]): Pick<NewAdPayload, 'final_url' | 'final_url_source'> => {
    if (s.landingUrl) return { final_url: s.landingUrl, final_url_source: 'setting' }
    const own = mostUsedUrl(adGroupAds)
    if (own) return { final_url: own, final_url_source: 'ad_group' }
    if (accountUrl) return { final_url: accountUrl, final_url_source: 'account' }
    return { final_url: null, final_url_source: null }
  }

  const build = (a: {
    basis: AdBasis
    adTarget: string
    facts: AdFacts
    winners: readonly Winner[]
    campaignSuggestionId: number | null
    campaignName: string
    adGroupName: string
    replacesAdId: number | null
    url: Pick<NewAdPayload, 'final_url' | 'final_url_source'>
    campaignId: number | null
    adGroupId: number | null
    stats: WindowStats | null
    extra: Record<string, unknown>
    basisOf: Basis
    confidence: Confidence
  }) => {
    const copy = templateCopy(a.facts, a.winners.map((w) => w.text))
    const checks = checkAd(copy, a.facts)
    const fingerprint = adFingerprint(a.adTarget, a.facts, a.url.final_url)
    if (!passes(checks)) {
      out.failedChecks.push({ fingerprint, problems: [...checks.limits.problems, ...checks.facts.problems, ...checks.style.problems] })
      return
    }
    const payload: NewAdPayload = {
      kind: 'new_ad',
      basis: a.basis,
      ad_target: a.adTarget,
      campaign_suggestion_id: a.campaignSuggestionId,
      campaign_name: a.campaignName,
      ad_group_name: a.adGroupName,
      replaces_ad_id: a.replacesAdId,
      ...a.url,
      path1: copy.path1,
      path2: copy.path2,
      headlines: copy.headlines,
      descriptions: copy.descriptions,
      copy_source: 'template',
      template: { headlines: copy.headlines, descriptions: copy.descriptions },
      facts: a.facts,
      winner_keywords: a.winners.map((w) => ({ text: w.text, source: w.source, keyword_id: w.keywordId, search_term_id: w.searchTermId })),
      checks,
    }
    const units = unitsOf(a.facts.make, a.facts.model)
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
        stock_count: a.facts.units,
        avg_days_listed: avg(units.map((v) => daysBetween(v.listedOn, snapshotOn))),
        avg_margin_idr: avg(margins),
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
        adTarget: `proposal:${p.candidate.fingerprint}|${g.name}`,
        facts,
        winners: winnersFor(winners, make, model),
        campaignSuggestionId: p.suggestionId,
        campaignName: proposal.name,
        adGroupName: g.name,
        replacesAdId: null,
        url: urlFor([]),
        campaignId: null,
        adGroupId: null,
        stats: null,
        extra: { rules: ['ad.new_campaign'], campaign_fingerprint: p.candidate.fingerprint },
        basisOf: 'prior',
        confidence: 'low',
      })
    }
  }

  // --- weak_ad: the weakest ad of an ad group that names a make with stock ----
  const dictionary = buildDictionary(input.inventory.vehicles)
  const adsByGroup = new Map<number, EngineAd[]>()
  for (const a of ads) adsByGroup.set(a.adGroupId, [...(adsByGroup.get(a.adGroupId) ?? []), a])
  const weakGroups = new Set<number>()
  const weak: { score: number; run: () => void }[] = []
  for (const [adGroupId, groupAds] of [...adsByGroup.entries()].sort(([a], [b]) => a - b)) {
    const ag = adGroupById.get(adGroupId)
    if (!ag) continue
    const parse = parseVehicle(ag.name, dictionary)
    if (parse.make === null) continue
    const units = unitsOf(parse.make, parse.model)
    if (units.length === 0) continue
    // The weakest ad: poor strength first, then the lowest CTR against the
    // best other ad that has enough impressions.
    let pick: { ad: EngineAd; rule: string; bestOtherCtr: number | null } | null = null
    for (const ad of [...groupAds].sort((x, y) => x.id - y.id)) {
      const others = groupAds.filter((o) => o.id !== ad.id && o.stats.impressions >= t.weakAdMinImpressions)
      const bestOther = others.length ? Math.max(...others.map((o) => ctr(o.stats))) : null
      const lowCtr = ad.stats.impressions >= t.weakAdMinImpressions && bestOther !== null && bestOther > 0 && ctr(ad.stats) <= t.weakAdCtrRatio * bestOther
      const rule = ad.adStrength === 'poor' ? 'ad.weak_ad.poor_strength' : lowCtr ? 'ad.weak_ad.low_ctr' : null
      if (!rule) continue
      const better =
        pick === null ||
        (rule === 'ad.weak_ad.poor_strength' && pick.rule !== 'ad.weak_ad.poor_strength') ||
        (rule === pick.rule && ctr(ad.stats) < ctr(pick.ad.stats))
      if (better) pick = { ad, rule, bestOtherCtr: bestOther }
    }
    if (!pick) continue
    const chosen = pick
    weakGroups.add(adGroupId)
    const model = parse.model
    const facts = buildFacts(units, parse.make, model, s, snapshotOn)!
    const campaign = campaignById.get(ag.campaignId)
    weak.push({
      score: chosen.ad.stats.impressions,
      run: () =>
        build({
          basis: 'weak_ad',
          adTarget: `ad_group:${adGroupId}|${parse.make}|${model ?? ''}`.toLowerCase(),
          facts,
          winners: winnersFor(winners, parse.make!, model),
          campaignSuggestionId: null,
          campaignName: campaign?.name ?? '',
          adGroupName: ag.name,
          replacesAdId: chosen.ad.id,
          url: urlFor(groupAds),
          campaignId: ag.campaignId,
          adGroupId,
          stats: chosen.ad.stats,
          extra: {
            rules: [chosen.rule],
            ad_strength: chosen.ad.adStrength,
            ctr: round4(ctr(chosen.ad.stats)),
            best_other_ctr: chosen.bestOtherCtr === null ? null : round4(chosen.bestOtherCtr),
          },
          basisOf: 'evidence',
          confidence: 'medium',
        }),
    })
  }

  // --- uncovered_winner: winners for a model no ad in their ad group names ----
  const uncovered: { score: number; run: () => void }[] = []
  const groups = new Map<string, { adGroupId: number; make: string; model: string; winners: Winner[] }>()
  for (const w of winners) {
    if (w.adGroupId === null || w.model === null || weakGroups.has(w.adGroupId)) continue
    const k = `${w.adGroupId}|${w.make}|${w.model}`.toLowerCase()
    if (!groups.has(k)) groups.set(k, { adGroupId: w.adGroupId, make: w.make, model: w.model, winners: [] })
    groups.get(k)!.winners.push(w)
  }
  for (const [k, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ag = adGroupById.get(g.adGroupId)
    if (!ag) continue
    const groupAds = adsByGroup.get(g.adGroupId) ?? []
    const modelWord = ` ${normalizeTerm(g.model)} `
    if (groupAds.some((a) => a.headlines.some((h) => ` ${normalizeTerm(h)} `.includes(modelWord)))) continue
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
          adTarget: `ad_group:${k}`,
          facts,
          winners: g.winners,
          campaignSuggestionId: null,
          campaignName: campaignById.get(ag.campaignId)?.name ?? '',
          adGroupName: ag.name,
          replacesAdId: null,
          url: urlFor(groupAds),
          campaignId: ag.campaignId,
          adGroupId: g.adGroupId,
          stats: total.clicks > 0 || total.impressions > 0 ? total : null,
          extra: { rules: ['ad.uncovered_winner'], winner_count: g.winners.length, winner_conversions: Math.round(conversions * 100) / 100 },
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
