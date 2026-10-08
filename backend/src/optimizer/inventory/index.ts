// Inventory entry point: picks the source and reads one snapshot per run
// (docs/overhaul-v3-backend.md section 10). An empty INVENTORY_DB_STRING
// means the demo inventory; a set one means the dealer's own database,
// read-only. A source that fails never fails the caller — the snapshot
// comes back 'unavailable' and the engine runs without the
// inventory-dependent suggestion types.

import { DemoInventorySource } from './demo.js'
import { externalSourceFromConfig, sanitizeInventoryError } from './external.js'
import type { InventorySnapshot, InventorySource } from './types.js'

export type { InventorySnapshot, InventorySource, Vehicle, VehicleEvent } from './types.js'

// How far back events are read for a snapshot.
const EVENT_LOOKBACK_DAYS = 180

export function getInventorySource(): InventorySource {
  return externalSourceFromConfig() ?? new DemoInventorySource()
}

function daysBefore(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export async function loadInventorySnapshot(source: InventorySource = getInventorySource()): Promise<InventorySnapshot> {
  try {
    const snapshotOn = await source.snapshotDate()
    const [vehicles, events] = await Promise.all([
      source.listVehicles(),
      source.listEvents(daysBefore(snapshotOn, EVENT_LOOKBACK_DAYS)),
    ])
    // No vehicles at all is an unseeded or broken source, not a dealer with
    // nothing to sell; read as "no stock" it would make every model keyword
    // look stock-less.
    if (vehicles.length === 0) {
      return { source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: 'the inventory source returned no vehicles' }
    }
    return { source: source.kind, snapshotOn, vehicles, events, error: null }
  } catch (err) {
    return { source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: sanitizeInventoryError(err) }
  }
}
