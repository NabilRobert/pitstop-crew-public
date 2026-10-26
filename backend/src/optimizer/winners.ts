// Contract 3.6 — winner keywords (docs/overhaul-v3-backend.md section
// 11.9): the keywords and promoted search terms the account has proven,
// per make/model. Ad copy leads with them, and a new_campaign proposal's
// ad group starts with them. Pure.
//
// A winner is an enabled keyword whose verdict (section 11.6) is 'winner',
// or the search term of a promote_search_term suggestion applied in the
// last adPromotedDays. Only ones that name a vehicle count.

import { daysBetween } from './stock.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import { keywordVerdicts } from './verdict.js'
import type { EngineInput } from './engine.js'
import type { EngineThresholds } from './thresholds.js'
import type { KeywordVerdict, MatchType } from './types.js'

export interface Winner {
  text: string
  source: 'keyword' | 'search_term'
  keywordId: number | null
  searchTermId: number | null
  adGroupId: number | null
  matchType: MatchType
  make: string
  model: string | null
  conversions: number
}

const key = (make: string, model: string) => `${make}|${model}`.toLowerCase()

/** A keyword's words without Google's match-type marks: [exact], "phrase",
 * +modifier. */
export function plainKeywordText(text: string): string {
  return text.replace(/[[\]"]/g, '').replace(/(^|\s)\+/g, '$1').trim().replace(/\s+/g, ' ')
}

/** The engine's keyword verdicts, with stock_count from the snapshot's
 * available units: the same call the summary makes, without the open-pause
 * and test-keyword context (neither can turn a keyword into a winner). */
export function engineVerdicts(input: EngineInput): Map<number, KeywordVerdict> {
  const available = new Map<string, number>()
  for (const v of input.inventory.vehicles) if (v.status === 'available') available.set(key(v.make, v.model), (available.get(key(v.make, v.model)) ?? 0) + 1)
  const inventoryUp = input.inventory.source !== 'unavailable' && input.inventory.snapshotOn !== null
  return keywordVerdicts(input, {
    stockCount: (id) => {
      const p = input.vehicleParses.get(id)
      if (!inventoryUp || !p || p.make === null || p.model === null) return null
      return available.get(key(p.make, p.model)) ?? 0
    },
    openPauseKeywordIds: new Set(),
    appliedTestKeywords: [],
  })
}

/** Every winner that names a vehicle, most conversions first. */
export function findWinners(input: EngineInput, t: EngineThresholds, verdicts: ReadonlyMap<number, KeywordVerdict> = engineVerdicts(input)): Winner[] {
  const out: Winner[] = []
  for (const k of input.keywords) {
    const p = input.vehicleParses.get(k.id)
    if (verdicts.get(k.id) !== 'winner' || !p || p.make === null) continue
    out.push({
      text: plainKeywordText(k.text),
      source: 'keyword',
      keywordId: k.id,
      searchTermId: null,
      adGroupId: k.adGroupId,
      matchType: k.matchType,
      make: p.make,
      model: p.model,
      conversions: k.stats.conversions,
    })
  }
  const dictionary = buildDictionary(input.inventory.vehicles)
  const seen = new Set(out.map((w) => w.text.toLowerCase()))
  for (const s of input.promotedTerms ?? []) {
    const age = daysBetween(s.appliedOn, input.asOf)
    if (age < 0 || age > t.adPromotedDays || seen.has(s.text.toLowerCase())) continue
    const p = parseVehicle(s.text, dictionary)
    if (p.make === null) continue
    seen.add(s.text.toLowerCase())
    out.push({
      text: plainKeywordText(s.text),
      source: 'search_term',
      keywordId: null,
      searchTermId: s.searchTermId,
      adGroupId: s.adGroupId,
      matchType: 'exact', // promoted to exact (promote_search_term)
      make: p.make,
      model: p.model,
      conversions: s.conversions,
    })
  }
  return out.sort((a, b) => b.conversions - a.conversions || a.text.localeCompare(b.text))
}

/** The winners for one make (model null: every model of it) or make/model. */
export function winnersFor(winners: readonly Winner[], make: string, model: string | null): Winner[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  return winners.filter((w) => same(w.make, make) && (model === null || (w.model !== null && same(w.model, model))))
}
