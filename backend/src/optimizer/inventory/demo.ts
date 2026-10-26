// The demo inventory source: the `vehicles` / `vehicle_events` tables in
// the Pitstop DB, seeded from src/data/demo/inventory.ts on every demo
// sync (damon.ts syncDemoInventory).

import { query } from '../../data/db.js'
import type { InventorySource, Vehicle, VehicleEvent } from './types.js'

export class DemoInventorySource implements InventorySource {
  readonly kind = 'demo' as const

  async listVehicles(): Promise<Vehicle[]> {
    const rows = await query<{
      id: number
      make: string
      model: string
      year: number
      mileage_km: number | null
      price_idr: number
      acquisition_cost_idr: number | null
      status: Vehicle['status']
      listed_on: string
      sold_on: string | null
    }>(
      `SELECT id, make, model, year, mileage_km, price_idr, acquisition_cost_idr, status, listed_on, sold_on
       FROM vehicles ORDER BY id`
    )
    return rows.map((r) => ({
      id: String(r.id),
      make: r.make,
      model: r.model,
      year: r.year,
      mileageKm: r.mileage_km,
      priceIdr: Number(r.price_idr),
      acquisitionCostIdr: r.acquisition_cost_idr === null ? null : Number(r.acquisition_cost_idr),
      status: r.status,
      listedOn: r.listed_on,
      soldOn: r.sold_on,
    }))
  }

  async listEvents(since: string): Promise<VehicleEvent[]> {
    const rows = await query<{
      vehicle_id: number
      event_type: VehicleEvent['eventType']
      event_date: string
      old_price_idr: number | null
      new_price_idr: number | null
    }>(
      `SELECT vehicle_id, event_type, event_date, old_price_idr, new_price_idr
       FROM vehicle_events WHERE event_date >= $1 ORDER BY event_date, id`,
      [since]
    )
    return rows.map((r) => ({
      vehicleId: String(r.vehicle_id),
      eventType: r.event_type,
      eventDate: r.event_date,
      oldPriceIdr: r.old_price_idr === null ? null : Number(r.old_price_idr),
      newPriceIdr: r.new_price_idr === null ? null : Number(r.new_price_idr),
    }))
  }

  /** The demo's "today": its newest synced day, not the wall clock. */
  async snapshotDate(): Promise<string> {
    const [{ last }] = await query<{ last: string | null }>(
      `SELECT to_char(MAX(cp.date), 'YYYY-MM-DD') AS last
       FROM campaign_performance cp JOIN campaigns c ON c.id = cp.campaign_id
       WHERE c.data_source = 'demo'`
    )
    if (!last) throw new Error('no demo data synced yet')
    return last
  }
}
