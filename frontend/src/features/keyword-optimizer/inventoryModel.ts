// Pure model for the inventory table: filter, facet counts and sort over the per-model rows the backend
// sends (GET /inventory/summary, `by_model`). No Vue, no network. The filters mirror the board's: free
// text plus chip groups, one group per column, each showing how many rows it would give.

import type { InventorySummary } from '../../shared/api/types'
import { matchesAllWords } from './boardModel'

export type InvRow = InventorySummary['by_model'][number]

export type StockFilter = 'all' | 'in' | 'out' | 'out_advertised'
export type DaysFilter = 'all' | '0-30' | '31-60' | '61-90' | '90+' | 'unknown'
export type PriceFilter = 'all' | 'under150' | '150-250' | '250-400' | 'over400' | 'unknown'
export type MarginFilter = 'all' | 'under10' | '10-15' | 'over15' | 'unknown'
export type AdsFilter = 'all' | 'yes' | 'no'

export interface InvFilters {
  query: string
  /** One make, or null for all. */
  make: string | null
  stock: StockFilter
  days: DaysFilter
  price: PriceFilter
  margin: MarginFilter
  ads: AdsFilter
}

export const EMPTY_FILTERS: InvFilters = { query: '', make: null, stock: 'all', days: 'all', price: 'all', margin: 'all', ads: 'all' }

const MILLION = 1_000_000

/** The same price bands the engine uses for theme campaigns (under Rp 150 juta, 150-250, 250-400, over 400). */
export function priceBand(avgPriceIdr: number | null): Exclude<PriceFilter, 'all'> {
  if (avgPriceIdr === null) return 'unknown'
  if (avgPriceIdr < 150 * MILLION) return 'under150'
  if (avgPriceIdr < 250 * MILLION) return '150-250'
  if (avgPriceIdr < 400 * MILLION) return '250-400'
  return 'over400'
}

/** Margin groups are a UI grouping only (STARTING DEFAULT): under Rp 10 juta, 10 to 15, over 15. */
export function marginBand(avgMarginIdr: number | null): Exclude<MarginFilter, 'all'> {
  if (avgMarginIdr === null) return 'unknown'
  if (avgMarginIdr < 10 * MILLION) return 'under10'
  if (avgMarginIdr <= 15 * MILLION) return '10-15'
  return 'over15'
}

/** Same buckets as the aging bars: 0-30, 31-60, 61-90, 90+ days. */
export function daysBand(avgDaysListed: number | null): Exclude<DaysFilter, 'all'> {
  if (avgDaysListed === null) return 'unknown'
  const d = Math.round(avgDaysListed)
  if (d <= 30) return '0-30'
  if (d <= 60) return '31-60'
  if (d <= 90) return '61-90'
  return '90+'
}

function matchesStock(r: InvRow, f: StockFilter): boolean {
  if (f === 'all') return true
  if (f === 'in') return r.available > 0
  if (f === 'out') return r.available === 0
  return r.available === 0 && r.linked_keyword_count > 0 // out of stock but still advertised: money going nowhere
}

type Facet = keyof Omit<InvFilters, 'query'>

function matches(r: InvRow, f: InvFilters, skip?: Facet): boolean {
  if (!matchesAllWords(`${r.make} ${r.model}`, f.query)) return false
  if (skip !== 'make' && f.make !== null && r.make !== f.make) return false
  if (skip !== 'stock' && !matchesStock(r, f.stock)) return false
  if (skip !== 'days' && f.days !== 'all' && daysBand(r.avg_days_listed) !== f.days) return false
  if (skip !== 'price' && f.price !== 'all' && priceBand(r.avg_price_idr) !== f.price) return false
  if (skip !== 'margin' && f.margin !== 'all' && marginBand(r.avg_margin_idr) !== f.margin) return false
  if (skip !== 'ads' && f.ads !== 'all' && (f.ads === 'yes') !== r.linked_keyword_count > 0) return false
  return true
}

export function applyFilters(rows: InvRow[], f: InvFilters): InvRow[] {
  return rows.filter((r) => matches(r, f))
}

/** How many rows each option of one facet would give, with every OTHER filter applied (so a chip's number is
 * what you get by clicking it). `options` are the values to count. */
export function facetCounts<T extends string>(
  rows: InvRow[],
  f: InvFilters,
  facet: Facet,
  options: readonly T[],
  valueOf: (r: InvRow) => string
): Record<T, number> {
  const out = Object.fromEntries(options.map((o) => [o, 0])) as Record<T, number>
  for (const r of rows) {
    if (!matches(r, f, facet)) continue
    const v = valueOf(r) as T
    if (v in out) out[v]++
  }
  return out
}

export function makesOf(rows: InvRow[]): string[] {
  return [...new Set(rows.map((r) => r.make))].sort((a, b) => a.localeCompare(b))
}

export function isFiltered(f: InvFilters): boolean {
  return (
    f.query.trim() !== '' || f.make !== null || f.stock !== 'all' || f.days !== 'all' || f.price !== 'all' || f.margin !== 'all' || f.ads !== 'all'
  )
}

export type SortKey = 'model' | 'available' | 'days' | 'price' | 'margin' | 'keywords'
export type SortDir = 'asc' | 'desc'

const NUMERIC: Record<Exclude<SortKey, 'model'>, (r: InvRow) => number | null> = {
  available: (r) => r.available,
  days: (r) => r.avg_days_listed,
  price: (r) => r.avg_price_idr,
  margin: (r) => r.avg_margin_idr,
  keywords: (r) => r.linked_keyword_count,
}

/** Sorts a copy. Rows with no value for the column ("no data") always sort LAST, whichever direction. */
export function sortRows(rows: InvRow[], key: SortKey, dir: SortDir): InvRow[] {
  const sign = dir === 'asc' ? 1 : -1
  const name = (r: InvRow) => `${r.make} ${r.model}`
  return [...rows].sort((a, b) => {
    if (key === 'model') return sign * name(a).localeCompare(name(b))
    const va = NUMERIC[key](a)
    const vb = NUMERIC[key](b)
    if (va === null && vb === null) return name(a).localeCompare(name(b))
    if (va === null) return 1
    if (vb === null) return -1
    return va === vb ? name(a).localeCompare(name(b)) : sign * (va - vb)
  })
}
