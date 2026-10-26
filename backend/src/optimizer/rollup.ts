// Window-total arithmetic shared by the engine, the keyword verdicts and
// the campaign proposals.

import type { EngineKeyword, WindowStats } from './engine.js'

export function emptyStats(): WindowStats {
  return { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValueMicros: 0 }
}

export function addStats(into: WindowStats, s: WindowStats): WindowStats {
  into.impressions += s.impressions
  into.clicks += s.clicks
  into.costMicros += s.costMicros
  into.conversions += s.conversions
  into.conversionsValueMicros += s.conversionsValueMicros
  return into
}

/** Window totals per ad group, summed from its keywords: the baseline the
 * significance rule (n_min) and the CPA comparisons use. */
export function adGroupTotals(keywords: readonly EngineKeyword[]): Map<number, WindowStats> {
  const out = new Map<number, WindowStats>()
  for (const k of keywords) addStats(out.get(k.adGroupId) ?? out.set(k.adGroupId, emptyStats()).get(k.adGroupId)!, k.stats)
  return out
}
