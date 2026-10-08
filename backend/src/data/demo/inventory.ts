// v3 step 5 — the demo dealer's stock (docs/overhaul-v3-backend.md section
// 7.4). ~70 vehicles across the makes/models the demo keywords target,
// deterministic, with listing dates spread so some units are aging (> 60
// days) and margins that vary. Dates are relative to an anchor (the newest
// synced demo day), so "aging" and "fresh" stay true as the demo moves
// forward — re-anchored on every demo sync (damon.ts syncDemoInventory).
//
// It must agree with groundTruth.ts: nothing at all in STOCKLESS_VEHICLES,
// AGING_VEHICLES listed > 60 days ago, FRESH_VEHICLES listed in the last
// two weeks (and no keyword targets them), 2+ available units of each
// UNCOVERED_VEHICLES model (and no keyword targets them). The tests check
// all four.

export interface DemoVehicle {
  externalId: string // stable id, 'demo-001'…; the upsert key
  make: string
  model: string
  year: number
  mileageKm: number
  priceIdr: number
  acquisitionCostIdr: number
  status: 'available' | 'reserved' | 'sold'
  listedDaysAgo: number // days before the anchor
  soldDaysAgo: number | null // set for status 'sold'
  priceCutDaysAgo: number | null // a price_change event, when set
}

interface ModelSpec {
  make: string
  model: string
  basePriceIdr: number // a typical 3-4 year old unit, Jakarta used market
  units: number
  // Days-listed range for this model's units. Aging models sit long,
  // fresh ones just arrived.
  listedDays: [number, number]
  marginRate: number // (price - acquisition) / price, before per-unit jitter
}

const MODELS: ModelSpec[] = [
  { make: 'Toyota', model: 'Avanza', basePriceIdr: 175_000_000, units: 6, listedDays: [3, 45], marginRate: 0.07 },
  { make: 'Toyota', model: 'Innova', basePriceIdr: 310_000_000, units: 4, listedDays: [5, 50], marginRate: 0.06 },
  { make: 'Toyota', model: 'Rush', basePriceIdr: 205_000_000, units: 3, listedDays: [72, 110], marginRate: 0.06 }, // aging
  { make: 'Toyota', model: 'Fortuner', basePriceIdr: 425_000_000, units: 2, listedDays: [10, 40], marginRate: 0.05 },
  { make: 'Toyota', model: 'Agya', basePriceIdr: 120_000_000, units: 2, listedDays: [4, 30], marginRate: 0.08 },
  { make: 'Toyota', model: 'Calya', basePriceIdr: 130_000_000, units: 2, listedDays: [6, 35], marginRate: 0.08 },
  { make: 'Toyota', model: 'Veloz', basePriceIdr: 230_000_000, units: 1, listedDays: [12, 12], marginRate: 0.06 },
  { make: 'Honda', model: 'Brio', basePriceIdr: 145_000_000, units: 4, listedDays: [2, 35], marginRate: 0.08 },
  { make: 'Honda', model: 'Jazz', basePriceIdr: 195_000_000, units: 2, listedDays: [8, 40], marginRate: 0.07 },
  { make: 'Honda', model: 'HR-V', basePriceIdr: 265_000_000, units: 3, listedDays: [68, 105], marginRate: 0.06 }, // aging
  { make: 'Honda', model: 'CR-V', basePriceIdr: 385_000_000, units: 2, listedDays: [15, 45], marginRate: 0.05 },
  { make: 'Honda', model: 'Mobilio', basePriceIdr: 150_000_000, units: 2, listedDays: [5, 30], marginRate: 0.08 },
  { make: 'Suzuki', model: 'Ertiga', basePriceIdr: 170_000_000, units: 4, listedDays: [3, 40], marginRate: 0.07 },
  { make: 'Suzuki', model: 'XL7', basePriceIdr: 225_000_000, units: 2, listedDays: [4, 20], marginRate: 0.06 },
  { make: 'Suzuki', model: 'Ignis', basePriceIdr: 135_000_000, units: 1, listedDays: [25, 25], marginRate: 0.07 },
  { make: 'Daihatsu', model: 'Xenia', basePriceIdr: 155_000_000, units: 4, listedDays: [2, 38], marginRate: 0.07 },
  { make: 'Daihatsu', model: 'Terios', basePriceIdr: 195_000_000, units: 2, listedDays: [9, 42], marginRate: 0.06 },
  { make: 'Daihatsu', model: 'Sigra', basePriceIdr: 125_000_000, units: 2, listedDays: [6, 28], marginRate: 0.08 },
  { make: 'Mitsubishi', model: 'Xpander', basePriceIdr: 215_000_000, units: 4, listedDays: [3, 35], marginRate: 0.07 },
  { make: 'Mitsubishi', model: 'Pajero Sport', basePriceIdr: 430_000_000, units: 2, listedDays: [10, 38], marginRate: 0.06 },
  { make: 'Wuling', model: 'Almaz', basePriceIdr: 245_000_000, units: 3, listedDays: [1, 9], marginRate: 0.08 }, // fresh, no keyword
  // One unit for each model that has a converting keyword but had no stock
  // (so its keyword no longer reads "no stock"). Appended, never inserted
  // above: external ids are numbered in list order, and vehicles already
  // stored (and the suggestions pointing at them) keep theirs.
  { make: 'Toyota', model: 'Yaris', basePriceIdr: 190_000_000, units: 1, listedDays: [14, 14], marginRate: 0.07 },
  { make: 'Toyota', model: 'Raize', basePriceIdr: 220_000_000, units: 1, listedDays: [9, 9], marginRate: 0.06 },
  { make: 'Toyota', model: 'Sienta', basePriceIdr: 200_000_000, units: 1, listedDays: [27, 27], marginRate: 0.07 },
  { make: 'Honda', model: 'Civic', basePriceIdr: 380_000_000, units: 1, listedDays: [21, 21], marginRate: 0.05 },
  { make: 'Honda', model: 'City', basePriceIdr: 230_000_000, units: 1, listedDays: [11, 11], marginRate: 0.06 },
  { make: 'Honda', model: 'BR-V', basePriceIdr: 210_000_000, units: 1, listedDays: [33, 33], marginRate: 0.07 },
  { make: 'Suzuki', model: 'Baleno', basePriceIdr: 170_000_000, units: 1, listedDays: [6, 6], marginRate: 0.07 },
  { make: 'Suzuki', model: 'Swift', basePriceIdr: 150_000_000, units: 1, listedDays: [18, 18], marginRate: 0.08 },
  { make: 'Suzuki', model: 'APV', basePriceIdr: 120_000_000, units: 1, listedDays: [38, 38], marginRate: 0.08 },
  { make: 'Suzuki', model: 'Karimun Wagon R', basePriceIdr: 95_000_000, units: 1, listedDays: [24, 24], marginRate: 0.09 },
  { make: 'Daihatsu', model: 'Ayla', basePriceIdr: 110_000_000, units: 1, listedDays: [8, 8], marginRate: 0.09 },
  { make: 'Daihatsu', model: 'Rocky', basePriceIdr: 215_000_000, units: 1, listedDays: [4, 4], marginRate: 0.06 },
  { make: 'Daihatsu', model: 'Gran Max', basePriceIdr: 140_000_000, units: 1, listedDays: [30, 30], marginRate: 0.08 },
  { make: 'Daihatsu', model: 'Luxio', basePriceIdr: 165_000_000, units: 1, listedDays: [16, 16], marginRate: 0.07 },
  // Contract 3.3 plants: models in stock that no keyword or campaign names
  // (with Wuling Almaz, groundTruth.ts UNCOVERED_VEHICLES), so the engine
  // proposes an uncovered_stock campaign for each.
  { make: 'Wuling', model: 'Cortez', basePriceIdr: 185_000_000, units: 3, listedDays: [18, 44], marginRate: 0.07 },
  { make: 'Hyundai', model: 'Stargazer', basePriceIdr: 240_000_000, units: 2, listedDays: [10, 30], marginRate: 0.07 },
]

// Units already sold in the last 30 days, per model (taken from `units`).
const SOLD_RECENTLY: Record<string, number> = { Avanza: 2, Brio: 1, Ertiga: 1, Xpander: 1, Xenia: 1, Innova: 1 }
// Units on hold for a buyer.
const RESERVED: Record<string, number> = { Avanza: 1, Xpander: 1, 'Pajero Sport': 1 }

/** FNV-1a, so the stock is identical on every machine and every run. */
function unit(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step

function buildStock(): DemoVehicle[] {
  const out: DemoVehicle[] = []
  let n = 0
  for (const m of MODELS) {
    const sold = SOLD_RECENTLY[m.model] ?? 0
    const reserved = RESERVED[m.model] ?? 0
    for (let i = 0; i < m.units; i++) {
      n += 1
      const id = `demo-${String(n).padStart(3, '0')}`
      const r = (salt: string) => unit(`${id}|${salt}`)
      const age = 2 + Math.floor(r('age') * 4) // 2-5 years old
      const price = roundTo(m.basePriceIdr * (1 - 0.06 * (age - 3)) * (0.95 + 0.1 * r('price')), 500_000)
      const margin = m.marginRate * (0.75 + 0.5 * r('margin'))
      const span = m.listedDays[1] - m.listedDays[0]
      const listedDaysAgo = m.listedDays[0] + (m.units > 1 ? Math.round((span * i) / (m.units - 1)) : 0)
      const status: DemoVehicle['status'] = i < sold ? 'sold' : i < sold + reserved ? 'reserved' : 'available'
      out.push({
        externalId: id,
        make: m.make,
        model: m.model,
        year: 2026 - age,
        mileageKm: roundTo(age * (11_000 + 8_000 * r('km')), 500),
        priceIdr: price,
        acquisitionCostIdr: roundTo(price * (1 - margin), 500_000),
        status,
        listedDaysAgo,
        soldDaysAgo: status === 'sold' ? Math.max(0, Math.min(listedDaysAgo - 1, Math.floor(r('sold') * 28))) : null,
        // Aging units have been marked down once; a few others too.
        priceCutDaysAgo: listedDaysAgo > 60 ? Math.floor(listedDaysAgo / 2) : r('cut') < 0.15 ? Math.floor(listedDaysAgo / 2) : null,
      })
    }
  }
  return out
}

export const DEMO_STOCK: DemoVehicle[] = buildStock()

// Size of a markdown, as a share of the price at the time.
export const PRICE_CUT_SHARE = 0.03
