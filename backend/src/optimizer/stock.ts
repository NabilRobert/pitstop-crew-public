// Keyword ↔ stock matching and the margin-based target CPA
// (docs/overhaul-v3-backend.md section 10). Pure.

import type { Vehicle } from './inventory/types.js'
import type { VehicleParse } from './vehicleParse.js'

export interface StockMatch {
  stockCount: number // available units matching the keyword
  avgDaysListed: number | null
  avgMarginIdr: number | null // null when no matched unit has a known acquisition cost
  vehicleIds: string[]
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000)
}

/** Available units matching the keyword's make, model (when it names one)
 * and year range (when it has one). Null when the keyword names no
 * vehicle — contract 3.0's "null = no vehicle link", never 0. Reserved and
 * sold units don't count as stock to advertise. */
export function matchStock(parse: VehicleParse, vehicles: readonly Vehicle[], snapshotOn: string): StockMatch | null {
  if (parse.make === null) return null
  const matched = vehicles.filter(
    (v) =>
      v.status === 'available' &&
      eq(v.make, parse.make!) &&
      (parse.model === null || eq(v.model, parse.model)) &&
      (parse.yearFrom === null || v.year >= parse.yearFrom) &&
      (parse.yearTo === null || v.year <= parse.yearTo)
  )
  const withCost = matched.filter((v) => v.acquisitionCostIdr !== null)
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null)
  return {
    stockCount: matched.length,
    avgDaysListed: avg(matched.map((v) => daysBetween(v.listedOn, snapshotOn))),
    avgMarginIdr: avg(withCost.map((v) => v.priceIdr - v.acquisitionCostIdr!)),
    vehicleIds: matched.map((v) => v.id),
  }
}

/** target CPA per lead = avg margin per vehicle × allowed spend share ×
 * lead-to-sale rate, in micros. Always basis 'prior': the lead-to-sale
 * rate is a guess until real sales data exists. Null without a margin. */
export function targetCpaMicros(
  avgMarginIdr: number | null,
  allowedSpendShare: number,
  leadToSaleRate: number
): { targetCpaMicros: number; basis: 'prior' } | null {
  if (avgMarginIdr === null || avgMarginIdr <= 0) return null
  return { targetCpaMicros: Math.round(avgMarginIdr * allowedSpendShare * leadToSaleRate * 1_000_000), basis: 'prior' }
}

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+'

export function agingBucket(daysListed: number): AgingBucket {
  if (daysListed <= 30) return '0-30'
  if (daysListed <= 60) return '31-60'
  if (daysListed <= 90) return '61-90'
  return '90+'
}
