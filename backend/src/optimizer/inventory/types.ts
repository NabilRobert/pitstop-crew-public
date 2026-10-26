// Inventory shapes shared by the demo and external sources
// (docs/overhaul-v3-backend.md section 10). Money in whole rupiah (*_idr),
// matching contract 3.0's inventory fields; dates are 'YYYY-MM-DD'.

export interface Vehicle {
  id: string // the source's own id, as text (demo: vehicles.id)
  make: string
  model: string
  year: number
  mileageKm: number | null
  priceIdr: number
  acquisitionCostIdr: number | null // null = margin unknown
  status: 'available' | 'reserved' | 'sold'
  listedOn: string
  soldOn: string | null
}

export interface VehicleEvent {
  vehicleId: string
  eventType: 'listed' | 'price_change' | 'reserved' | 'sold'
  eventDate: string
  oldPriceIdr: number | null
  newPriceIdr: number | null
}

export interface InventorySource {
  readonly kind: 'demo' | 'connected'
  listVehicles(): Promise<Vehicle[]>
  listEvents(since: string): Promise<VehicleEvent[]>
  snapshotDate(): Promise<string>
}

/** One read per run (section 10: "read once, not per suggestion"). Never
 * thrown out of: when the source is down, `source` is 'unavailable', the
 * lists are empty and `error` says why, sanitized. */
export interface InventorySnapshot {
  source: 'demo' | 'connected' | 'unavailable'
  snapshotOn: string | null
  vehicles: Vehicle[]
  events: VehicleEvent[]
  error: string | null
}
