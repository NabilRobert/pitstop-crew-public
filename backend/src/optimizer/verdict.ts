// Contract 3.1 — one plain-language verdict per keyword for
// /keywords/summary (docs/overhaul-v3-backend.md section 11.6). Decided in
// code from the engine's own window, baseline and thresholds, so a label
// and a suggestion can't disagree. Pure.
//
// First match wins:
// 1. no_stock    spent money in the window, and stock_count is 0;
// 2. testing     an applied test keyword (from a new_keyword suggestion)
//                still under n_min clicks;
// 3. wasting     n_min+ clicks and zero conversions (the engine's
//                significance rule), or an open pause_keyword suggestion;
// 4. winner      n_min+ clicks, promoteMinConversions+ conversions, and a
//                CPA at or below its ad group's (the comparison the raise-bid
//                rule uses) — never with an open pause suggestion;
// 5. needs_data  under n_min clicks: no call can be made yet;
// 6. steady      everything else.
//
// A paused keyword (contract 3.2) is judged on the same window against its
// ad group's enabled keywords, but never reads winner or wasting — both
// imply an action on something already switched off; it reads steady
// instead. no_stock still applies.

import { nMin } from './significance.js'
import { normalizeTerm } from './intent.js'
import { adGroupTotals } from './rollup.js'
import { ENGINE_DEFAULTS, type EngineThresholds } from './thresholds.js'
import type { EngineInput, EngineKeyword, WindowStats } from './engine.js'
import type { KeywordVerdict } from './types.js'

export interface VerdictContext {
  stockCount: (keywordId: number) => number | null // the same stock_count the summary item shows
  openPauseKeywordIds: ReadonlySet<number>
  // Keywords added from an applied is_test new_keyword suggestion.
  appliedTestKeywords: readonly { text: string; adGroupId: number | null }[]
  // Paused keywords with their totals over the same window (the engine's
  // input holds enabled keywords only).
  pausedKeywords?: readonly EngineKeyword[]
}

const ZERO = 1e-9
const cpa = (s: WindowStats) => (s.conversions > ZERO ? s.costMicros / s.conversions : null)

export function keywordVerdicts(input: EngineInput, ctx: VerdictContext): Map<number, KeywordVerdict> {
  const t: EngineThresholds = { ...ENGINE_DEFAULTS, ...input.thresholds }
  const adGroups = adGroupTotals(input.keywords)
  const tests = ctx.appliedTestKeywords.map((k) => ({ text: normalizeTerm(k.text), adGroupId: k.adGroupId }))
  const out = new Map<number, KeywordVerdict>()

  const judge = (k: EngineKeyword): KeywordVerdict => {
    const ag = adGroups.get(k.adGroupId) ?? { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValueMicros: 0 }
    const minClicks = nMin(ag.clicks > 0 ? ag.conversions / ag.clicks : 0, input.settings.pValue)
    const enoughClicks = k.stats.clicks >= minClicks
    const openPause = ctx.openPauseKeywordIds.has(k.id)
    const isTest = tests.some((x) => x.text === normalizeTerm(k.text) && (x.adGroupId === null || x.adGroupId === k.adGroupId))
    const kwCpa = cpa(k.stats)
    const agCpa = cpa(ag)

    if (k.stats.costMicros > 0 && ctx.stockCount(k.id) === 0) return 'no_stock'
    if (isTest && !enoughClicks) return 'testing'
    if ((enoughClicks && k.stats.conversions < ZERO) || openPause) return 'wasting'
    if (enoughClicks && k.stats.conversions >= t.promoteMinConversions && kwCpa !== null && agCpa !== null && kwCpa <= agCpa) return 'winner'
    if (!enoughClicks) return 'needs_data'
    return 'steady'
  }

  for (const k of input.keywords) out.set(k.id, judge(k))
  for (const k of ctx.pausedKeywords ?? []) {
    const v = judge(k)
    out.set(k.id, v === 'winner' || v === 'wasting' ? 'steady' : v)
  }
  return out
}
