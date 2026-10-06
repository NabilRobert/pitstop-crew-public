// Pure presentation helpers for a keyword-optimizer Suggestion (contract 3.0).
// Everything shown as a number is read from the structured `evidence` /
// `payload` / `inventory` fields, never parsed out of the LLM's `explanation`.

import type { Suggestion, SuggestionType } from '../../shared/api/types'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Display order of the type groups. */
export const SUGGESTION_TYPES: SuggestionType[] = [
  'negative_keyword',
  'promote_search_term',
  'pause_keyword',
  'change_match_type',
  'new_keyword',
  'spin_out_campaign',
  'raise_bid_candidate',
  'new_campaign',
]

/** One-line headline for a suggestion, built from its structured payload. */
export function suggestionTitle(s: Suggestion, t: Translate): string {
  const p = s.payload
  const match = (m: string) => t(`keywordOptimizer.match.${m}`)
  switch (p.kind) {
    case 'negative_keyword':
      return t('keywordOptimizer.title.negative_keyword', {
        text: p.text,
        match: match(p.match_type),
        scope: t(`keywordOptimizer.scope.${p.scope}`),
      })
    case 'promote_search_term':
      return t('keywordOptimizer.title.promote_search_term', { text: p.text })
    case 'change_match_type':
      return t('keywordOptimizer.title.change_match_type', {
        keyword: s.keyword?.text ?? '—',
        from: match(p.from),
        to: match(p.to),
      })
    case 'pause_keyword':
      return t('keywordOptimizer.title.pause_keyword', { keyword: s.keyword?.text ?? '—' })
    case 'spin_out_campaign':
      return t('keywordOptimizer.title.spin_out_campaign', { name: p.suggested_name, count: p.keyword_ids.length })
    case 'new_keyword':
      return t('keywordOptimizer.title.new_keyword', { text: p.text, match: match(p.match_type) })
    case 'raise_bid_candidate':
      return t('keywordOptimizer.title.raise_bid_candidate', { keyword: s.keyword?.text ?? '—' })
    case 'new_campaign':
      return t('keywordOptimizer.title.new_campaign', { name: p.name })
  }
}

export interface EvidenceRow {
  label: string
  value: string
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The evidence grid. A null field is omitted rather than shown as 0; only
 * extras this UI knows how to label are shown (never a raw unknown key). */
export function evidenceRows(s: Suggestion, t: Translate): EvidenceRow[] {
  const e = s.evidence
  const rows: EvidenceRow[] = []
  const label = (k: string) => t(`keywordOptimizer.evidence.${k}`)
  if (isNum(e.clicks)) rows.push({ label: label('clicks'), value: formatNumber(e.clicks) })
  if (isNum(e.impressions)) rows.push({ label: label('impressions'), value: formatNumber(e.impressions) })
  if (isNum(e.cost_micros)) rows.push({ label: label('cost'), value: formatMicrosAsIDR(e.cost_micros) })
  if (isNum(e.conversions)) rows.push({ label: label('conversions'), value: e.conversions.toFixed(1) })
  if (isNum(e.conversions_value_micros) && e.conversions_value_micros > 0) {
    rows.push({ label: label('value'), value: formatMicrosAsIDR(e.conversions_value_micros) })
  }
  if (isNum(e.cost_micros) && isNum(e.conversions) && e.conversions > 0) {
    rows.push({ label: label('costPerConversion'), value: formatMicrosAsIDR(e.cost_micros / e.conversions) })
  }
  if (isNum(e.min_clicks_required)) rows.push({ label: label('minClicks'), value: formatNumber(e.min_clicks_required) })
  if (isNum(e.parent_keyword_cpa_micros)) rows.push({ label: label('parentKeywordCpa'), value: formatMicrosAsIDR(e.parent_keyword_cpa_micros) })
  if (isNum(e.cluster_cpa_micros)) rows.push({ label: label('clusterCpa'), value: formatMicrosAsIDR(e.cluster_cpa_micros) })
  if (isNum(e.parent_cpa_micros)) rows.push({ label: label('parentCpa'), value: formatMicrosAsIDR(e.parent_cpa_micros) })
  if (isNum(e.non_buyer_spend_share)) rows.push({ label: label('nonBuyerShare'), value: formatPercent(e.non_buyer_spend_share * 100, 0) })
  if (isNum(e.quality_score)) rows.push({ label: label('qualityScore'), value: `${e.quality_score}/10` })
  return rows
}

/** True when the suggestion has no account data behind it at all. */
export function hasNoAccountData(s: Suggestion): boolean {
  return s.basis === 'prior' && s.evidence.clicks === null
}

/** Clicks below the significance threshold the engine itself reported. */
export function belowThreshold(s: Suggestion): boolean {
  const { clicks, min_clicks_required: min } = s.evidence
  return isNum(clicks) && isNum(min) && clicks < min
}

export function impactRows(s: Suggestion, t: Translate): EvidenceRow[] {
  const i = s.expected_impact
  if (!i) return []
  const rows: EvidenceRow[] = []
  if (isNum(i.wasted_spend_micros_per_week)) {
    rows.push({ label: t('keywordOptimizer.impact.wastedSpend'), value: formatMicrosAsIDR(i.wasted_spend_micros_per_week) })
  }
  if (isNum(i.extra_conversions_per_week)) {
    rows.push({ label: t('keywordOptimizer.impact.extraConversions'), value: `+${i.extra_conversions_per_week.toFixed(1)}` })
  }
  return rows
}

/** Whole rupiah (contract `*_idr` fields), as opposed to micros. */
export function formatIdr(idr: number | null | undefined): string {
  if (idr === null || idr === undefined) return '—'
  return formatMicrosAsIDR(idr * 1_000_000)
}

/** The one plain sentence printed on a note's tape strip ("what to do"). Short on purpose:
 * the full evidence is one click away in the detail panel. */
export function tapeText(s: Suggestion, t: Translate): string {
  const p = s.payload
  switch (p.kind) {
    case 'negative_keyword':
      return t('keywordOptimizer.board.tape.negative_keyword', { text: p.text })
    case 'promote_search_term':
      return t('keywordOptimizer.board.tape.promote_search_term', { text: p.text })
    case 'change_match_type':
      return t('keywordOptimizer.board.tape.change_match_type', { to: t(`keywordOptimizer.match.${p.to}`) })
    case 'pause_keyword':
      return t('keywordOptimizer.board.tape.pause_keyword')
    case 'spin_out_campaign':
      return t('keywordOptimizer.board.tape.spin_out_campaign', { name: p.suggested_name })
    case 'new_keyword':
      return t('keywordOptimizer.board.tape.new_keyword', { text: p.text })
    case 'raise_bid_candidate':
      return t('keywordOptimizer.board.tape.raise_bid_candidate')
    case 'new_campaign':
      return t('keywordOptimizer.board.tape.new_campaign', { name: p.name })
  }
}
