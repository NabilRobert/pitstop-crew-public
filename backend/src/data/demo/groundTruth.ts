// v3 — the planted problems in the demo account, and what a correct
// keyword optimizer should do about each one (docs/overhaul-v3-backend.md
// section 7.3). The scoring harness (scripts/scoreOptimizer.ts, step 6)
// runs the engine over the generated data and scores it against this list:
// found, missed, false positives, and how many weeks each took to find.
//
// The decoys and legitimate-intent rows matter as much as the plants: a
// row with `expected: null` must NOT be flagged, and it is what the
// false-positive score is measured on.
//
// foundByWeek counts weeks since START_DATE. The planted volumes in
// keywordCatalog.ts are sized so each plant clears its evidence threshold
// (10 clicks for a non-buyer intent with no conversions, n_min clicks for
// a zero-conversion keyword, 2+ conversions for a winner or an aging-stock
// keyword) inside the engine's 90-day window. Re-checked in step 6 against
// the harness over 10 seeds: every plant is first found by its marker in
// at least 9 of 10 seeds, with no decoy or legitimate term flagged.

import type { SuggestionType } from '../../optimizer/types.js'

export type PlantKind =
  | 'waste_non_buyer'
  | 'waste_wrong_product'
  | 'hidden_winner'
  | 'stockless_keyword'
  | 'aging_stock'
  | 'fresh_stock'
  | 'spin_out_cluster'
  | 'decoy'
  | 'legit_buyer_intent'
  // Contract 3.3 — new_campaign proposals (section 11.7).
  | 'campaign_uncovered'
  | 'campaign_aging'
  | 'campaign_theme'
  | 'campaign_decoy' // well-covered stock: must get no new_campaign

export interface Vehicle {
  make: string
  model: string
}

export type GroundTruthTarget =
  | { searchTermKey: string }
  | { keywordKey: string }
  | { keywordKeys: string[]; vehicle: Vehicle }
  | { vehicle: Vehicle; keywordKeys?: string[] }
  | { priceBand: string } // a theme campaign's band (campaigns.ts PRICE_BANDS key)

export interface GroundTruthRow {
  id: string
  kind: PlantKind
  target: GroundTruthTarget
  expected: SuggestionType | null // null = must not be flagged at all
  foundByWeek: number | null // null for rows that must never be flagged
}

// The inventory facts the plants depend on. The demo inventory seed
// (step 5) must agree with these: no stock at all for STOCKLESS, units
// listed > 60 days ago for AGING, freshly listed units and no keyword for
// FRESH.
export const STOCKLESS_VEHICLES: Vehicle[] = [
  { make: 'BMW', model: '320i' },
  { make: 'Mercedes-Benz', model: 'C200' },
  { make: 'Mazda', model: '2' },
  { make: 'Hyundai', model: 'Creta' },
  { make: 'Kia', model: 'Sonet' },
]
export const AGING_VEHICLES: Vehicle[] = [
  { make: 'Toyota', model: 'Rush' },
  { make: 'Honda', model: 'HR-V' },
]
export const FRESH_VEHICLES: Vehicle[] = [{ make: 'Wuling', model: 'Almaz' }]
// 3.3: 2+ available units each, and no keyword or campaign names them.
export const UNCOVERED_VEHICLES: Vehicle[] = [
  { make: 'Wuling', model: 'Almaz' },
  { make: 'Wuling', model: 'Cortez' },
  { make: 'Hyundai', model: 'Stargazer' },
]

const term = (id: string, kind: PlantKind, searchTermKey: string, expected: SuggestionType | null, foundByWeek: number | null): GroundTruthRow => ({
  id,
  kind,
  target: { searchTermKey },
  expected,
  foundByWeek,
})

export const GROUND_TRUTH: GroundTruthRow[] = [
  // Wasted spend, non-buyer intent (job seekers, students, DIY / free).
  term('gt_waste_lowongan_sales', 'waste_non_buyer', 'st_waste_lowongan_sales', 'negative_keyword', 14),
  term('gt_waste_loker_showroom', 'waste_non_buyer', 'st_waste_loker_showroom', 'negative_keyword', 14),
  term('gt_waste_gaji_sales', 'waste_non_buyer', 'st_waste_gaji_sales', 'negative_keyword', 14),
  term('gt_waste_skripsi', 'waste_non_buyer', 'st_waste_skripsi', 'negative_keyword', 14),
  term('gt_waste_makalah_pdf', 'waste_non_buyer', 'st_waste_makalah_pdf', 'negative_keyword', 16),
  term('gt_waste_cara_cek_mesin', 'waste_non_buyer', 'st_waste_cara_cek_mesin', 'negative_keyword', 12),
  term('gt_waste_cek_rangka_gratis', 'waste_non_buyer', 'st_waste_cek_rangka_gratis', 'negative_keyword', 8),
  term('gt_waste_poles_diy', 'waste_non_buyer', 'st_waste_poles_diy', 'negative_keyword', 12),
  // Wasted spend, wrong product (new cars, repair, parts).
  term('gt_waste_mobil_baru', 'waste_wrong_product', 'st_waste_mobil_baru', 'negative_keyword', 10),
  term('gt_waste_dealer_baru', 'waste_wrong_product', 'st_waste_dealer_baru', 'negative_keyword', 16),
  term('gt_waste_bengkel_toyota', 'waste_wrong_product', 'st_waste_bengkel_toyota', 'negative_keyword', 12),
  term('gt_waste_servis_jazz', 'waste_wrong_product', 'st_waste_servis_jazz', 'negative_keyword', 10),
  term('gt_waste_sparepart_xenia', 'waste_wrong_product', 'st_waste_sparepart_xenia', 'negative_keyword', 10),
  term('gt_waste_aki_suzuki', 'waste_wrong_product', 'st_waste_aki_suzuki', 'negative_keyword', 10),

  // Hidden winners: promote to exact.
  term('gt_winner_avanza_2019', 'hidden_winner', 'st_winner_avanza_2019', 'promote_search_term', 16),
  term('gt_winner_brio_rs', 'hidden_winner', 'st_winner_brio_rs', 'promote_search_term', 16),
  term('gt_winner_xenia_r', 'hidden_winner', 'st_winner_xenia_r', 'promote_search_term', 18),
  term('gt_winner_ertiga_gx', 'hidden_winner', 'st_winner_ertiga_gx', 'promote_search_term', 16),
  term('gt_winner_innova_diesel', 'hidden_winner', 'st_winner_innova_diesel', 'promote_search_term', 18),
  term('gt_winner_jazz_rs', 'hidden_winner', 'st_winner_jazz_rs', 'promote_search_term', 18),

  // Stock-less keywords: spend on cars the dealer doesn't have.
  { id: 'gt_stockless_bmw_320i', kind: 'stockless_keyword', target: { keywordKey: 'kw_stockless_bmw_320i' }, expected: 'pause_keyword', foundByWeek: 14 },
  { id: 'gt_stockless_mercedes_c200', kind: 'stockless_keyword', target: { keywordKey: 'kw_stockless_mercedes_c200' }, expected: 'pause_keyword', foundByWeek: 18 },
  { id: 'gt_stockless_mazda_2', kind: 'stockless_keyword', target: { keywordKey: 'kw_stockless_mazda_2' }, expected: 'pause_keyword', foundByWeek: 18 },
  { id: 'gt_stockless_hyundai_creta', kind: 'stockless_keyword', target: { keywordKey: 'kw_stockless_hyundai_creta' }, expected: 'pause_keyword', foundByWeek: 12 },
  { id: 'gt_stockless_kia_sonet', kind: 'stockless_keyword', target: { keywordKey: 'kw_stockless_kia_sonet' }, expected: 'pause_keyword', foundByWeek: 14 },

  // Aging stock that converts well but is under-bid: push it.
  { id: 'gt_aging_toyota_rush', kind: 'aging_stock', target: { vehicle: AGING_VEHICLES[0], keywordKeys: ['kw_toyota_rush_phrase'] }, expected: 'raise_bid_candidate', foundByWeek: 12 },
  { id: 'gt_aging_honda_hrv', kind: 'aging_stock', target: { vehicle: AGING_VEHICLES[1], keywordKeys: ['kw_honda_hrv_phrase'] }, expected: 'raise_bid_candidate', foundByWeek: 12 },
  // Fresh stock with no keyword at all: create one from the stock row.
  { id: 'gt_fresh_wuling_almaz', kind: 'fresh_stock', target: { vehicle: FRESH_VEHICLES[0] }, expected: 'new_keyword', foundByWeek: 2 },

  // Clusters converting at ~3x the ad group's rate, buried in a generic
  // ad group: spin them out into their own campaign.
  {
    id: 'gt_cluster_xpander',
    kind: 'spin_out_cluster',
    target: {
      vehicle: { make: 'Mitsubishi', model: 'Xpander' },
      keywordKeys: ['kw_xpander_phrase', 'kw_xpander_exact', 'kw_xpander_harga_phrase', 'kw_xpander_broad'],
    },
    expected: 'spin_out_campaign',
    foundByWeek: 12,
  },
  {
    id: 'gt_cluster_pajero',
    kind: 'spin_out_cluster',
    target: {
      vehicle: { make: 'Mitsubishi', model: 'Pajero Sport' },
      keywordKeys: ['kw_pajero_phrase', 'kw_pajero_exact', 'kw_pajero_harga_phrase', 'kw_pajero_broad'],
    },
    expected: 'spin_out_campaign',
    foundByWeek: 12,
  },

  // Decoys: zero conversions, too few clicks to call. Must stay unflagged.
  term('gt_decoy_murah_bekasi_utara', 'decoy', 'st_decoy_murah_bekasi_utara', null, null),
  term('gt_decoy_suv_pajak_hidup', 'decoy', 'st_decoy_suv_pajak_hidup', null, null),
  term('gt_decoy_avanza_hitam', 'decoy', 'st_decoy_avanza_hitam', null, null),
  term('gt_decoy_brio_plat_b', 'decoy', 'st_decoy_brio_plat_b', null, null),
  term('gt_decoy_ertiga_cash', 'decoy', 'st_decoy_ertiga_cash', null, null),
  term('gt_decoy_xenia_2015_manual', 'decoy', 'st_decoy_xenia_2015_manual', null, null),
  term('gt_decoy_fortuner_vrz', 'decoy', 'st_decoy_fortuner_vrz', null, null),
  term('gt_decoy_crv_turbo', 'decoy', 'st_decoy_crv_turbo', null, null),

  // Credit / instalment / down-payment / trade-in: buyer intent for a
  // dealer. Must classify as buyer and never become a negative (the harness
  // counts only a negative as a false positive here: promoting one that
  // converts well is a correct suggestion).
  term('gt_legit_kredit_dp_murah', 'legit_buyer_intent', 'st_legit_kredit_dp_murah', null, null),
  term('gt_legit_cicilan_avanza', 'legit_buyer_intent', 'st_legit_cicilan_avanza', null, null),
  term('gt_legit_dp_10_juta', 'legit_buyer_intent', 'st_legit_dp_10_juta', null, null),
  term('gt_legit_tukar_tambah', 'legit_buyer_intent', 'st_legit_tukar_tambah', null, null),
  term('gt_legit_kredit_xpander', 'legit_buyer_intent', 'st_legit_kredit_xpander', null, null),
  term('gt_legit_cicilan_2_juta', 'legit_buyer_intent', 'st_legit_cicilan_2_juta', null, null),

  // 3.3 — whole new campaigns from the stock. A proposal over the per-run
  // cap still counts as found: the rule fired, and the next run offers it.
  ...UNCOVERED_VEHICLES.map((vehicle): GroundTruthRow => ({
    id: `gt_campaign_uncovered_${vehicle.model.toLowerCase()}`,
    kind: 'campaign_uncovered',
    target: { vehicle },
    expected: 'new_campaign',
    foundByWeek: 1,
  })),
  // The aging models: one keyword each, so coverage is thin.
  ...AGING_VEHICLES.map((vehicle): GroundTruthRow => ({
    id: `gt_campaign_aging_${vehicle.model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    kind: 'campaign_aging',
    target: { vehicle },
    expected: 'new_campaign',
    foundByWeek: 1,
  })),
  // Agya, Calya, Sigra, Mobilio…: small cars with one keyword each.
  { id: 'gt_campaign_theme_under_150', kind: 'campaign_theme', target: { priceBand: 'under_150' }, expected: 'new_campaign', foundByWeek: 1 },
  // Avanza: 3 units and two converting keywords. Xpander: a proven cluster,
  // which stays a spin_out_campaign and must not also become a campaign.
  { id: 'gt_campaign_decoy_avanza', kind: 'campaign_decoy', target: { vehicle: { make: 'Toyota', model: 'Avanza' } }, expected: null, foundByWeek: null },
  { id: 'gt_campaign_decoy_xpander', kind: 'campaign_decoy', target: { vehicle: { make: 'Mitsubishi', model: 'Xpander' } }, expected: null, foundByWeek: null },
]
