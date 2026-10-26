// Contract 3.3 — the paste-ready brief for a new_campaign proposal,
// GET /keyword-suggestions/:id/brief (docs/overhaul-v3-backend.md section
// 11.7). Pure: built from the stored payload only, so every figure in it is
// one the engine computed. Every text field (names, keywords, negatives)
// is untrusted and neutralized against spreadsheet formula injection.
//
// The CSV is Google Ads Editor-style but UNVERIFIED: the headers follow
// Editor's import guide (English, case and spacing ignored), and the
// criterion-type and status values have not been checked against a real
// Editor export. The route says so in the X-Editor-Columns header.

import { csvCell, neutralizeCell } from './csvSafe.js'
import type { MatchType, NewCampaignPayload } from '../optimizer/types.js'

export const BRIEF_CSV_HEADERS = ['Campaign', 'Campaign daily budget', 'Ad group', 'Keyword', 'Criterion type', 'Status'] as const
export const BRIEF_CSV_VERIFIED = false

const KEYWORD_TYPE: Record<MatchType, string> = { exact: 'Exact', phrase: 'Phrase', broad: 'Broad' }
const NEGATIVE_TYPE: Record<MatchType, string> = { exact: 'Campaign Negative Exact', phrase: 'Campaign Negative Phrase', broad: 'Campaign Negative Broad' }

const rupiah = (micros: number) => Math.round(micros / 1_000_000)
const idr = (n: number) => `Rp ${n.toLocaleString('en-US')}`
const pct = (share: number) => `${Math.round(share * 1000) / 10}%`

/** Google's keyword notation: [exact], "phrase", broad. */
function notation(text: string, matchType: MatchType): string {
  const t = neutralizeCell(text)
  return matchType === 'exact' ? `[${t}]` : matchType === 'phrase' ? `"${t}"` : t
}

/** One row for the campaign (created paused, so an import never starts
 * spending), one per ad group, one per keyword, and one per starter
 * negative at campaign level. The budget is whole rupiah. */
export function buildBriefCsv(p: NewCampaignPayload): string {
  const rows: string[][] = [[...BRIEF_CSV_HEADERS]]
  rows.push([p.name, String(rupiah(p.budget.daily_micros)), '', '', '', 'Paused'])
  for (const g of p.ad_groups) {
    rows.push([p.name, '', g.name, '', '', 'Enabled'])
    for (const k of g.keywords) rows.push([p.name, '', g.name, k.text, KEYWORD_TYPE[k.match_type], 'Enabled'])
  }
  for (const n of p.starter_negatives) rows.push([p.name, '', '', n.text, NEGATIVE_TYPE[n.match_type], 'Enabled'])
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const BASIS_TEXT: Record<NewCampaignPayload['basis'], string> = {
  uncovered_stock: 'stock that no keyword or campaign advertises',
  aging_stock: 'aging or high-margin stock with thin keyword coverage',
  proven_cluster: 'a keyword cluster that converts well',
  theme: 'a price band of thinly covered stock',
}

const BOUND_TEXT = { floor: ' (held at your daily floor)', ceiling: ' (held at your daily ceiling)' } as const

/** A readable outline for pasting into a chat or a document. */
export function buildBriefTxt(p: NewCampaignPayload): string {
  const s = p.stock
  const lines = [
    `Campaign: ${neutralizeCell(p.name)}`,
    `Why: ${BASIS_TEXT[p.basis]}${p.theme ? ` (${neutralizeCell(p.theme)})` : ''}`,
    `Daily budget: ${idr(rupiah(p.budget.daily_micros))}${p.budget.bound ? BOUND_TEXT[p.budget.bound] : ''}`,
    `Target cost per lead: ${p.budget.target_cpa_micros === null ? 'unknown (no margin data)' : idr(rupiah(p.budget.target_cpa_micros))}` +
      ` — unverified: assumes a ${pct(p.budget.assumptions.lead_to_sale_rate)} lead-to-sale rate and ${pct(p.budget.assumptions.allowed_spend_share)} of margin as ad spend`,
    `Stock (inventory of ${s.snapshot_on}): ${s.units} unit${s.units === 1 ? '' : 's'}` +
      (s.avg_days_listed === null ? '' : `, listed ${s.avg_days_listed} days on average`) +
      (s.avg_margin_idr === null ? '' : `, average margin ${idr(s.avg_margin_idr)}`) +
      (s.total_value_idr === null ? '' : `, total value ${idr(s.total_value_idr)}`),
    '',
  ]
  for (const g of p.ad_groups) {
    lines.push(`Ad group: ${neutralizeCell(g.name)}`)
    for (const k of g.keywords) lines.push(`  ${notation(k.text, k.match_type)}`)
    lines.push('')
  }
  lines.push('Negative keywords (campaign level):')
  for (const n of p.starter_negatives) lines.push(`  ${notation(n.text, n.match_type)}`)
  if (p.overlaps.length > 0) {
    lines.push('', 'Already targeted by:')
    for (const o of p.overlaps) lines.push(`  ${neutralizeCell(o.name)} (${o.shared_keywords} shared keyword${o.shared_keywords === 1 ? '' : 's'})`)
  }
  lines.push('', 'Create it paused in Google Ads, check it, then enable it. Nothing here was applied to your account.')
  return lines.join('\n') + '\n'
}
