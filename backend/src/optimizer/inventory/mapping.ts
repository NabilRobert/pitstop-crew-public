// The one place that knows the dealer's own inventory schema
// (docs/overhaul-v3-backend.md section 10): the fixed, allow-listed queries
// run against INVENTORY_DB_STRING, and how their rows become Vehicles.
//
// STUB — the real table and column names are still pending from the owner
// (open question Q1). Until they arrive, EXTERNAL_MAPPING is null and the
// external source reports itself unavailable; the demo inventory is used
// whenever INVENTORY_DB_STRING is empty. To wire the real database, fill
// in the two queries and mappers below — nothing else should need to change.

import type { Vehicle, VehicleEvent } from './types.js'

export interface ExternalMapping {
  // Fixed SQL only — never built from keyword text or model output.
  // $1 in eventsQuery is the "since" date.
  vehiclesQuery: string
  eventsQuery: string | null // null = the source has no event history
  toVehicle(row: Record<string, unknown>): Vehicle
  toEvent(row: Record<string, unknown>): VehicleEvent
}

export const EXTERNAL_MAPPING: ExternalMapping | null = null

export const MAPPING_PENDING_MESSAGE =
  "the inventory database's column mapping isn't configured yet (waiting on the real table and column names)"
