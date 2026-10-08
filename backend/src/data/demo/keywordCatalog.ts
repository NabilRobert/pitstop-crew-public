// v3 — the demo account's keyword and search-term catalog (see
// docs/overhaul-v3-backend.md section 7). Re-exported by profile.ts as
// KEYWORDS / SEARCH_TERMS, the names the generator and damon.ts already use.
//
// The 24 v2 keywords and 48 v2 search terms keep their keys and texts (the
// DB identifies them by text, so renaming one would orphan its history).
// v3 adds ~70 keywords inside the same 8 ad groups — never new ad groups,
// so campaign and ad-group rows are unchanged — plus the planted problems
// in groundTruth.ts and a generated long tail of search terms.
//
// Weights are relative to the ad-group (or keyword) average: 1 = average,
// 2 = twice the average CTR/CVR/CPC. Shares are relative weights within
// the parent, normalized by the generator — they need not sum to 1.

import type { Intent, MatchType } from '../../optimizer/types.js'

export type { Intent, MatchType }

export interface KeywordProfile {
  key: string
  adGroupKey: string
  text: string
  matchType: MatchType
  share: number // relative weight within the ad group
  baseQualityScore: number // 1-10; search_model's keywords erode from this as the decline progresses
  ctrWeight: number
  cvrWeight: number
  cpcWeight: number
  // Manual max CPC; null = automated bidding. Brand runs on target
  // impression share, and the two generic ad groups' campaign moved to
  // Maximize Conversions on day 50 (profile.ts CHANGE_EVENTS).
  bidMicros: number | null
  startDay?: number // days since START_DATE the keyword went live; absent = live from START_DATE
  // Days since START_DATE the keyword was paused: no traffic from that day,
  // and keywords.status = 'paused' once the demo has reached it (damon.ts
  // syncDemoKeywordStatus). Absent = never paused.
  pausedFromDay?: number
  hiddenTermShare?: number // share of its search-term volume Google withholds; absent = HIDDEN_TERM_SHARE
  // v3 step 4 — how this keyword's conversions lean across conversion
  // actions, as multipliers on each action's account-wide share (1 =
  // average). Set by conversionActionMix() below, not per row.
  conversionActionMix: Record<string, number>
}

export interface SearchTermProfile {
  key: string
  keywordKey: string
  adGroupKey: string
  text: string
  matchFlavor: 'close_variant' | 'broader'
  share: number // relative weight among the keyword's search terms
  ctrWeight: number
  cvrWeight: number
  // Ground truth for the intent classifier and the scoring harness. Never
  // written to the DB — the classifier has to work it out from the text.
  intent: Intent
  appearanceProbability: number // chance the term shows up on a given day; < 1 = long tail
}

// Share of each keyword's search-term volume Google never reports.
export const HIDDEN_TERM_SHARE = 0.15

const rp = (rupiah: number) => rupiah * 1_000_000

function kw(
  key: string,
  adGroupKey: string,
  text: string,
  matchType: MatchType,
  share: number,
  baseQualityScore: number,
  [ctrWeight, cvrWeight, cpcWeight]: [number, number, number],
  bidRupiah: number | null,
  extra: Partial<Pick<KeywordProfile, 'startDay' | 'hiddenTermShare' | 'pausedFromDay'>> = {}
): KeywordProfile {
  return {
    key,
    adGroupKey,
    text,
    matchType,
    share,
    baseQualityScore,
    ctrWeight,
    cvrWeight,
    cpcWeight,
    bidMicros: bidRupiah === null ? null : rp(bidRupiah),
    conversionActionMix: {},
    ...extra,
  }
}

/** Which conversion actions a keyword's leads lean to, by what kind of
 * keyword it is — so value per conversion genuinely differs per keyword
 * (a brand search phones, a credit search applies for credit, a broad
 * head term mostly browses the financing page). Multipliers on each
 * action's account-wide share; the generator fits them to the campaign's
 * per-action totals, so the account-level split doesn't move. */
function conversionActionMix(k: KeywordProfile): Record<string, number> {
  if (k.adGroupKey.startsWith('brand_')) return { phone_call: 1.6, whatsapp_click: 1.5, financing_page_visit: 0.6 }
  if (/kredit|dp_murah/.test(k.key)) return { credit_app_started: 2.5, financing_page_visit: 1.5, test_drive_booked: 0.6 }
  if (/xpander|pajero/.test(k.key)) return { test_drive_booked: 1.4, showroom_visit: 1.4, sold: 1.6, financing_page_visit: 0.6 }
  if (/rush|hrv/.test(k.key)) return { test_drive_booked: 1.3, showroom_visit: 1.3, sold: 1.3 }
  if (k.matchType === 'broad') return { financing_page_visit: 1.8, test_drive_booked: 0.6, showroom_visit: 0.6, sold: 0.5 }
  if (k.matchType === 'exact') return { test_drive_booked: 1.4, showroom_visit: 1.4, sold: 1.4, financing_page_visit: 0.7 }
  return {}
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

const V2_KEYWORDS: KeywordProfile[] = [
  // Brand — Dealer Name (automated bidding: no bid)
  kw('kw_brand_name_exact', 'brand_dealer_name', '[pitstop used cars]', 'exact', 0.5, 8, [1.3, 1.3, 0.8], null),
  kw('kw_brand_name_phrase', 'brand_dealer_name', '"pitstop used cars"', 'phrase', 0.3, 8, [1.1, 1.1, 0.9], null),
  kw('kw_brand_name_broad', 'brand_dealer_name', 'pitstop car dealer', 'broad', 0.2, 7, [0.8, 0.7, 1.1], null),
  // Brand — Location Variants
  kw('kw_brand_loc_exact', 'brand_location', '[pitstop used cars serpong]', 'exact', 0.45, 8, [1.25, 1.2, 0.85], null),
  kw('kw_brand_loc_phrase', 'brand_location', '"pitstop used cars near me"', 'phrase', 0.35, 7, [1.0, 1.0, 1.0], null),
  kw('kw_brand_loc_broad', 'brand_location', 'pitstop used cars gading serpong', 'broad', 0.2, 7, [0.8, 0.75, 1.1], null),
  // Used Cars Generic
  kw('kw_generic_cars_broad', 'generic_used_cars', 'used cars for sale', 'broad', 0.7, 6, [0.8, 0.6, 1.1], null),
  kw('kw_generic_cars_phrase', 'generic_used_cars', '"used cars jakarta"', 'phrase', 0.35, 7, [1.0, 1.0, 1.0], null),
  kw('kw_generic_cars_exact', 'generic_used_cars', '[used cars near me]', 'exact', 0.25, 7, [1.2, 1.2, 0.95], null),
  // Used SUVs Generic
  kw('kw_generic_suvs_broad', 'generic_used_suvs', 'used suvs for sale', 'broad', 0.45, 6, [0.8, 0.6, 1.1], null),
  kw('kw_generic_suvs_phrase', 'generic_used_suvs', '"used suv near me"', 'phrase', 0.3, 6, [1.0, 0.95, 1.0], null),
  // Paused on 2026-10-01 while still converting well: a paused keyword with
  // a winner's numbers, which must read 'steady', never 'winner' (contract 3.2).
  kw('kw_generic_suvs_exact', 'generic_used_suvs', '[used suv jakarta]', 'exact', 0.25, 7, [1.2, 1.15, 0.95], null, { pausedFromDay: 122 }),
  // Model — Toyota
  kw('kw_toyota_exact', 'model_toyota', '[used toyota jakarta]', 'exact', 0.4, 7, [1.2, 1.15, 0.95], 2_600),
  kw('kw_toyota_phrase', 'model_toyota', '"used toyota for sale"', 'phrase', 0.35, 7, [1.0, 1.0, 1.0], 2_300),
  kw('kw_toyota_broad', 'model_toyota', 'used toyota near me', 'broad', 0.4, 6, [0.85, 0.7, 1.1], 2_000),
  // Model — Honda
  kw('kw_honda_exact', 'model_honda', '[used honda jakarta]', 'exact', 0.4, 7, [1.2, 1.15, 0.95], 2_600),
  kw('kw_honda_phrase', 'model_honda', '"used honda for sale"', 'phrase', 0.35, 6, [1.0, 0.95, 1.0], 2_300),
  kw('kw_honda_broad', 'model_honda', 'used honda near me', 'broad', 0.25, 6, [0.85, 0.7, 1.1], 2_000),
  // Model — Suzuki
  kw('kw_suzuki_exact', 'model_suzuki', '[used suzuki jakarta]', 'exact', 0.4, 7, [1.2, 1.15, 0.95], 2_500),
  kw('kw_suzuki_phrase', 'model_suzuki', '"used suzuki for sale"', 'phrase', 0.35, 6, [1.0, 0.95, 1.0], 2_200),
  kw('kw_suzuki_broad', 'model_suzuki', 'used suzuki near me', 'broad', 0.25, 6, [0.85, 0.7, 1.1], 1_900),
  // Model — Daihatsu
  kw('kw_daihatsu_exact', 'model_daihatsu', '[used daihatsu jakarta]', 'exact', 0.4, 7, [1.2, 1.15, 0.95], 2_500),
  kw('kw_daihatsu_phrase', 'model_daihatsu', '"used daihatsu for sale"', 'phrase', 0.35, 6, [1.0, 0.95, 1.0], 2_200),
  kw('kw_daihatsu_broad', 'model_daihatsu', 'used daihatsu near me', 'broad', 0.25, 6, [0.85, 0.7, 1.1], 1_900),
]

const V3_KEYWORDS: KeywordProfile[] = [
  // Brand — Indonesian-language and suburb variants (Tangerang, Serpong, BSD)
  kw('kw_brand_name_id_phrase', 'brand_dealer_name', '"pitstop mobil bekas"', 'phrase', 0.25, 8, [1.1, 1.15, 0.9], null),
  kw('kw_brand_name_showroom', 'brand_dealer_name', 'pitstop showroom', 'broad', 0.15, 7, [0.9, 0.9, 1.0], null),
  kw('kw_brand_loc_bekasi', 'brand_location', '[pitstop used cars bsd]', 'exact', 0.2, 8, [1.2, 1.2, 0.85], null),
  kw('kw_brand_loc_tangerang', 'brand_location', '"pitstop mobil bekas tangerang"', 'phrase', 0.15, 7, [1.0, 1.05, 0.95], null),

  // Used Cars Generic — the head terms. "mobil bekas" (broad) is the
  // account's biggest junk magnet: most of the planted waste matches it.
  kw('kw_gen_mobil_bekas_broad', 'generic_used_cars', 'mobil bekas', 'broad', 1.0, 5, [0.9, 0.55, 1.05], null),
  kw('kw_gen_jual_phrase', 'generic_used_cars', '"jual mobil bekas"', 'phrase', 0.3, 7, [1.05, 1.1, 1.0], null),
  kw('kw_gen_murah_phrase', 'generic_used_cars', '"mobil bekas murah"', 'phrase', 0.25, 6, [1.0, 0.9, 0.95], null),
  kw('kw_gen_showroom_exact', 'generic_used_cars', '[showroom mobil bekas jakarta]', 'exact', 0.15, 8, [1.25, 1.4, 0.95], null),
  kw('kw_gen_kredit_phrase', 'generic_used_cars', '"kredit mobil bekas"', 'phrase', 0.25, 7, [1.05, 1.3, 1.05], null),
  kw('kw_gen_dp_murah_phrase', 'generic_used_cars', '"mobil bekas dp murah"', 'phrase', 0.12, 7, [1.05, 1.25, 1.0], null),
  kw('kw_gen_jakarta_phrase', 'generic_used_cars', '"mobil bekas jakarta"', 'phrase', 0.2, 7, [1.0, 1.05, 1.0], null),
  kw('kw_gen_bekasi_phrase', 'generic_used_cars', '"mobil bekas bekasi"', 'phrase', 0.1, 7, [1.0, 1.0, 0.95], null),
  kw('kw_gen_tangerang_phrase', 'generic_used_cars', '"mobil bekas tangerang"', 'phrase', 0.1, 7, [1.0, 1.0, 0.95], null),
  kw('kw_gen_depok_phrase', 'generic_used_cars', '"mobil bekas depok"', 'phrase', 0.08, 7, [1.0, 0.95, 0.95], null),
  // Planted cluster: Mitsubishi Xpander, buried in the generic ad group,
  // converting at about twice the ad group's rate (spin_out_campaign).
  kw('kw_xpander_phrase', 'generic_used_cars', '"xpander bekas"', 'phrase', 0.14, 8, [1.3, 2.2, 0.9], null),
  kw('kw_xpander_exact', 'generic_used_cars', '[mitsubishi xpander bekas]', 'exact', 0.1, 8, [1.35, 2.3, 0.9], null),
  kw('kw_xpander_harga_phrase', 'generic_used_cars', '"harga xpander bekas"', 'phrase', 0.08, 8, [1.25, 2.1, 0.9], null),
  kw('kw_xpander_broad', 'generic_used_cars', 'xpander second jakarta', 'broad', 0.07, 7, [1.2, 2.0, 0.95], null),
  // Planted stock-less keywords: healthy CTR, but the dealer stocks no
  // BMW 320i / Mercedes C200 / Mazda 2, so nobody converts.
  kw('kw_stockless_bmw_320i', 'generic_used_cars', '"bmw 320i bekas"', 'phrase', 0.4, 6, [1.2, 0, 1.4], null),
  kw('kw_stockless_mercedes_c200', 'generic_used_cars', '"mercedes c200 bekas"', 'phrase', 0.34, 6, [1.2, 0, 1.4], null),
  kw('kw_stockless_mazda_2', 'generic_used_cars', '[mazda 2 bekas]', 'exact', 0.38, 7, [1.25, 0, 1.2], null),

  // Used SUVs Generic
  kw('kw_suv_mobil_suv_bekas_broad', 'generic_used_suvs', 'mobil suv bekas', 'broad', 0.8, 5, [0.9, 0.55, 1.05], null),
  kw('kw_suv_murah_phrase', 'generic_used_suvs', '"suv bekas murah"', 'phrase', 0.2, 6, [1.0, 0.9, 0.95], null),
  kw('kw_suv_7_seater_phrase', 'generic_used_suvs', '"mobil 7 seater bekas"', 'phrase', 0.15, 7, [1.05, 1.1, 1.0], null),
  kw('kw_suv_keluarga_phrase', 'generic_used_suvs', '"mobil keluarga bekas"', 'phrase', 0.12, 7, [1.0, 1.05, 1.0], null),
  // Planted cluster: Mitsubishi Pajero Sport, buried in the SUV ad group.
  kw('kw_pajero_phrase', 'generic_used_suvs', '"pajero sport bekas"', 'phrase', 0.14, 8, [1.3, 2.3, 0.9], null),
  kw('kw_pajero_exact', 'generic_used_suvs', '[pajero sport dakar bekas]', 'exact', 0.09, 8, [1.35, 2.4, 0.9], null),
  kw('kw_pajero_harga_phrase', 'generic_used_suvs', '"harga pajero sport bekas"', 'phrase', 0.08, 8, [1.25, 2.2, 0.9], null),
  kw('kw_pajero_broad', 'generic_used_suvs', 'pajero bekas jakarta', 'broad', 0.07, 7, [1.2, 2.0, 0.95], null),
  // Planted stock-less keywords: no Hyundai Creta / Kia Sonet in stock.
  kw('kw_stockless_hyundai_creta', 'generic_used_suvs', '"hyundai creta bekas"', 'phrase', 0.252, 6, [1.2, 0, 1.35], null),
  kw('kw_stockless_kia_sonet', 'generic_used_suvs', '"kia sonet bekas"', 'phrase', 0.216, 6, [1.2, 0, 1.35], null),

  // Model — Toyota
  kw('kw_toyota_murah_broad', 'model_toyota', 'toyota bekas murah', 'broad', 0.6, 5, [0.9, 0.6, 1.05], 1_900),
  kw('kw_toyota_avanza_phrase', 'model_toyota', '"avanza bekas"', 'phrase', 0.5, 8, [1.1, 1.2, 1.0], 2_400),
  kw('kw_toyota_avanza_exact', 'model_toyota', '[toyota avanza bekas]', 'exact', 0.15, 8, [1.25, 1.3, 0.95], 2_600),
  kw('kw_toyota_innova_phrase', 'model_toyota', '"innova bekas"', 'phrase', 0.35, 7, [1.05, 1.0, 1.1], 2_500),
  kw('kw_toyota_innova_exact', 'model_toyota', '[innova reborn bekas]', 'exact', 0.1, 8, [1.2, 1.2, 1.05], 2_700),
  // Planted aging stock: the dealer's Rush units are sitting, and this
  // keyword converts well but under-bids (high rank-lost share).
  kw('kw_toyota_rush_phrase', 'model_toyota', '"toyota rush bekas"', 'phrase', 0.32, 7, [1.0, 1.5, 0.75], 1_000),
  kw('kw_toyota_fortuner_phrase', 'model_toyota', '"fortuner bekas"', 'phrase', 0.15, 7, [1.0, 0.9, 1.3], 2_800),
  kw('kw_toyota_yaris_phrase', 'model_toyota', '"yaris bekas"', 'phrase', 0.1, 6, [0.95, 0.9, 1.0], 2_200),
  kw('kw_toyota_agya_phrase', 'model_toyota', '"agya bekas"', 'phrase', 0.08, 6, [0.95, 0.95, 0.9], 2_100),
  kw('kw_toyota_calya_phrase', 'model_toyota', '"calya bekas"', 'phrase', 0.08, 6, [0.95, 1.0, 0.9], 2_100),
  kw('kw_toyota_raize_exact', 'model_toyota', '[toyota raize bekas]', 'exact', 0.06, 7, [1.15, 1.1, 1.0], 2_400),
  kw('kw_toyota_veloz_phrase', 'model_toyota', '"veloz bekas"', 'phrase', 0.07, 7, [1.0, 1.05, 1.0], 2_300),
  kw('kw_toyota_sienta_phrase', 'model_toyota', '"sienta bekas"', 'phrase', 0.05, 6, [0.95, 0.9, 0.95], 2_100),

  // Model — Honda
  kw('kw_honda_murah_broad', 'model_honda', 'honda bekas murah', 'broad', 0.55, 5, [0.9, 0.6, 1.05], 1_900),
  kw('kw_honda_brio_phrase', 'model_honda', '"brio bekas"', 'phrase', 0.4, 8, [1.1, 1.15, 0.95], 2_300),
  kw('kw_honda_brio_exact', 'model_honda', '[honda brio bekas]', 'exact', 0.1, 8, [1.25, 1.25, 0.95], 2_500),
  kw('kw_honda_jazz_phrase', 'model_honda', '"jazz bekas"', 'phrase', 0.45, 7, [1.05, 1.0, 1.0], 2_300),
  // Planted aging stock: HR-V, same shape as the Rush.
  kw('kw_honda_hrv_phrase', 'model_honda', '"honda hr-v bekas"', 'phrase', 0.3, 7, [1.0, 1.5, 0.75], 1_000),
  kw('kw_honda_crv_phrase', 'model_honda', '"cr-v bekas"', 'phrase', 0.12, 7, [1.0, 0.9, 1.3], 2_800),
  kw('kw_honda_mobilio_phrase', 'model_honda', '"mobilio bekas"', 'phrase', 0.08, 6, [0.95, 1.0, 0.9], 2_100),
  kw('kw_honda_brv_phrase', 'model_honda', '"br-v bekas"', 'phrase', 0.08, 6, [0.95, 1.0, 0.95], 2_200),
  kw('kw_honda_civic_phrase', 'model_honda', '"civic bekas"', 'phrase', 0.07, 6, [0.95, 0.8, 1.2], 2_500),
  kw('kw_honda_city_phrase', 'model_honda', '"honda city bekas"', 'phrase', 0.05, 6, [0.95, 0.95, 1.0], 2_200),

  // Model — Suzuki. XL7 and Baleno went live recently (cold start).
  kw('kw_suzuki_murah_broad', 'model_suzuki', 'suzuki bekas murah', 'broad', 0.5, 5, [0.9, 0.6, 1.05], 1_800),
  kw('kw_suzuki_ertiga_phrase', 'model_suzuki', '"ertiga bekas"', 'phrase', 0.45, 8, [1.1, 1.15, 0.95], 2_300),
  kw('kw_suzuki_ertiga_exact', 'model_suzuki', '[suzuki ertiga bekas]', 'exact', 0.1, 8, [1.25, 1.25, 0.95], 2_500),
  kw('kw_suzuki_xl7_phrase', 'model_suzuki', '"suzuki xl7 bekas"', 'phrase', 0.12, 7, [1.05, 1.1, 1.0], 2_300, { startDay: 118 }),
  kw('kw_suzuki_ignis_phrase', 'model_suzuki', '"ignis bekas"', 'phrase', 0.1, 6, [0.95, 0.95, 0.9], 2_000),
  kw('kw_suzuki_baleno_phrase', 'model_suzuki', '"baleno bekas"', 'phrase', 0.08, 6, [0.95, 0.95, 0.95], 2_100, { startDay: 118 }),
  kw('kw_suzuki_swift_phrase', 'model_suzuki', '"swift bekas"', 'phrase', 0.08, 6, [0.95, 0.9, 0.95], 2_100),
  kw('kw_suzuki_apv_phrase', 'model_suzuki', '"apv bekas"', 'phrase', 0.06, 6, [0.9, 1.0, 0.9], 2_000),
  kw('kw_suzuki_wagon_r_phrase', 'model_suzuki', '"karimun wagon r bekas"', 'phrase', 0.05, 6, [0.9, 0.95, 0.85], 1_900),

  // Model — Daihatsu. Rocky went live recently (cold start).
  kw('kw_daihatsu_murah_broad', 'model_daihatsu', 'daihatsu bekas murah', 'broad', 0.5, 5, [0.9, 0.6, 1.05], 1_800),
  kw('kw_daihatsu_xenia_phrase', 'model_daihatsu', '"xenia bekas"', 'phrase', 0.65, 8, [1.1, 1.15, 0.95], 2_300),
  kw('kw_daihatsu_xenia_exact', 'model_daihatsu', '[daihatsu xenia bekas]', 'exact', 0.1, 8, [1.25, 1.25, 0.95], 2_500),
  kw('kw_daihatsu_terios_phrase', 'model_daihatsu', '"terios bekas"', 'phrase', 0.15, 7, [1.0, 1.0, 1.0], 2_200),
  kw('kw_daihatsu_sigra_phrase', 'model_daihatsu', '"sigra bekas"', 'phrase', 0.1, 6, [0.95, 1.0, 0.9], 2_000),
  kw('kw_daihatsu_ayla_phrase', 'model_daihatsu', '"ayla bekas"', 'phrase', 0.08, 6, [0.95, 0.95, 0.9], 2_000),
  kw('kw_daihatsu_rocky_phrase', 'model_daihatsu', '"daihatsu rocky bekas"', 'phrase', 0.06, 7, [1.0, 1.05, 1.0], 2_200, { startDay: 118 }),
  kw('kw_daihatsu_granmax_phrase', 'model_daihatsu', '"gran max bekas"', 'phrase', 0.06, 6, [0.9, 1.0, 0.9], 2_000),
  kw('kw_daihatsu_luxio_phrase', 'model_daihatsu', '"luxio bekas"', 'phrase', 0.05, 6, [0.9, 0.95, 0.9], 1_900),

  // Contract 3.2 — keyword states the UI must show. Not ground-truth plants.
  // Two zero-conversion keywords paused on 2026-09-27: a generic one (would
  // read 'wasting' if it were enabled, reads 'steady' paused) and one for a
  // car the dealer doesn't stock ('no_stock' still applies when paused).
  kw('kw_gen_murah_meriah_phrase', 'generic_used_cars', '"mobil bekas murah meriah"', 'phrase', 0.5, 5, [1.1, 0, 1.0], null, { pausedFromDay: 118 }),
  kw('kw_suv_livina_phrase', 'generic_used_suvs', '"nissan livina bekas"', 'phrase', 0.08, 6, [1.1, 0, 1.1], null, { pausedFromDay: 118 }),
  // Added but not serving yet (starts 2026-10-07): an enabled keyword with no
  // activity at all, listed with empty fields and 'needs_data'.
  kw('kw_gen_wuling_confero_phrase', 'generic_used_cars', '"wuling confero bekas"', 'phrase', 0.06, 6, [1.0, 1.0, 1.0], null, { startDay: 128 }),
]

export const KEYWORDS: KeywordProfile[] = [...V2_KEYWORDS, ...V3_KEYWORDS].map((k) => ({
  ...k,
  conversionActionMix: conversionActionMix(k),
}))

// ---------------------------------------------------------------------------
// Search terms
// ---------------------------------------------------------------------------

type TermSpec = Omit<SearchTermProfile, 'adGroupKey'>

function st(
  key: string,
  keywordKey: string,
  text: string,
  intent: Intent,
  share: number,
  [ctrWeight, cvrWeight]: [number, number],
  appearanceProbability = 1,
  matchFlavor: SearchTermProfile['matchFlavor'] = 'broader'
): TermSpec {
  return { key, keywordKey, text, intent, share, ctrWeight, cvrWeight, appearanceProbability, matchFlavor }
}

const close = (key: string, keywordKey: string, text: string, intent: Intent = 'buyer') =>
  st(key, keywordKey, text, intent, 0.6, [1, 1], 1, 'close_variant')
const broader = (key: string, keywordKey: string, text: string, intent: Intent = 'buyer') =>
  st(key, keywordKey, text, intent, 0.4, [1, 1], 1, 'broader')

const V2_SEARCH_TERMS: TermSpec[] = [
  close('st_brand_name_exact_close', 'kw_brand_name_exact', 'pitstop used cars reviews', 'researcher'),
  broader('st_brand_name_exact_broad', 'kw_brand_name_exact', 'car dealer tangerang'),
  close('st_brand_name_phrase_close', 'kw_brand_name_phrase', 'pitstop used car lot'),
  broader('st_brand_name_phrase_broad', 'kw_brand_name_phrase', 'used car dealership tangerang'),
  close('st_brand_name_broad_close', 'kw_brand_name_broad', 'pitstop car dealership'),
  broader('st_brand_name_broad_broad', 'kw_brand_name_broad', 'car dealership near me'),
  close('st_brand_loc_exact_close', 'kw_brand_loc_exact', 'pitstop used car serpong'),
  broader('st_brand_loc_exact_broad', 'kw_brand_loc_exact', 'car dealer serpong'),
  close('st_brand_loc_phrase_close', 'kw_brand_loc_phrase', 'pitstop used cars close by'),
  broader('st_brand_loc_phrase_broad', 'kw_brand_loc_phrase', 'nearest used car dealer'),
  close('st_brand_loc_broad_close', 'kw_brand_loc_broad', 'pitstop used cars gading serpong address'),
  broader('st_brand_loc_broad_broad', 'kw_brand_loc_broad', 'car dealership location bsd'),
  close('st_generic_cars_broad_close', 'kw_generic_cars_broad', 'used cars for sale near me'),
  broader('st_generic_cars_broad_broad', 'kw_generic_cars_broad', 'buy used car indonesia'),
  close('st_generic_cars_phrase_close', 'kw_generic_cars_phrase', 'used cars jakarta selatan'),
  broader('st_generic_cars_phrase_broad', 'kw_generic_cars_phrase', 'mobil bekas jakarta'),
  close('st_generic_cars_exact_close', 'kw_generic_cars_exact', 'used cars near me now'),
  broader('st_generic_cars_exact_broad', 'kw_generic_cars_exact', 'cheap used cars jakarta'),
  close('st_generic_suvs_broad_close', 'kw_generic_suvs_broad', 'used suvs for sale near me'),
  broader('st_generic_suvs_broad_broad', 'kw_generic_suvs_broad', 'buy used suv indonesia'),
  close('st_generic_suvs_phrase_close', 'kw_generic_suvs_phrase', 'used suv near me now'),
  broader('st_generic_suvs_phrase_broad', 'kw_generic_suvs_phrase', 'mobil suv bekas jakarta'),
  close('st_generic_suvs_exact_close', 'kw_generic_suvs_exact', 'used suv jakarta selatan'),
  broader('st_generic_suvs_exact_broad', 'kw_generic_suvs_exact', 'cheap used suv jakarta'),
  close('st_toyota_exact_close', 'kw_toyota_exact', 'used toyota jakarta selatan'),
  broader('st_toyota_exact_broad', 'kw_toyota_exact', 'toyota bekas jakarta'),
  close('st_toyota_phrase_close', 'kw_toyota_phrase', 'used toyota for sale near me'),
  broader('st_toyota_phrase_broad', 'kw_toyota_phrase', 'toyota dealer used cars'),
  close('st_toyota_broad_close', 'kw_toyota_broad', 'used toyota nearby'),
  broader('st_toyota_broad_broad', 'kw_toyota_broad', 'toyota second jakarta'),
  close('st_honda_exact_close', 'kw_honda_exact', 'used honda jakarta selatan'),
  broader('st_honda_exact_broad', 'kw_honda_exact', 'honda bekas jakarta'),
  close('st_honda_phrase_close', 'kw_honda_phrase', 'used honda for sale near me'),
  broader('st_honda_phrase_broad', 'kw_honda_phrase', 'honda dealer used cars'),
  close('st_honda_broad_close', 'kw_honda_broad', 'used honda nearby'),
  broader('st_honda_broad_broad', 'kw_honda_broad', 'honda second jakarta'),
  close('st_suzuki_exact_close', 'kw_suzuki_exact', 'used suzuki jakarta selatan'),
  broader('st_suzuki_exact_broad', 'kw_suzuki_exact', 'suzuki bekas jakarta'),
  close('st_suzuki_phrase_close', 'kw_suzuki_phrase', 'used suzuki for sale near me'),
  broader('st_suzuki_phrase_broad', 'kw_suzuki_phrase', 'suzuki dealer used cars'),
  close('st_suzuki_broad_close', 'kw_suzuki_broad', 'used suzuki nearby'),
  broader('st_suzuki_broad_broad', 'kw_suzuki_broad', 'suzuki second jakarta'),
  close('st_daihatsu_exact_close', 'kw_daihatsu_exact', 'used daihatsu jakarta selatan'),
  broader('st_daihatsu_exact_broad', 'kw_daihatsu_exact', 'daihatsu bekas jakarta'),
  close('st_daihatsu_phrase_close', 'kw_daihatsu_phrase', 'used daihatsu for sale near me'),
  broader('st_daihatsu_phrase_broad', 'kw_daihatsu_phrase', 'daihatsu dealer used cars'),
  close('st_daihatsu_broad_close', 'kw_daihatsu_broad', 'used daihatsu nearby'),
  broader('st_daihatsu_broad_broad', 'kw_daihatsu_broad', 'daihatsu second jakarta'),
]

// The planted terms. Every one of these is a GROUND_TRUTH row
// (groundTruth.ts) except the competitor/researcher extras at the end.
const PLANTED_SEARCH_TERMS: TermSpec[] = [
  // Wasted spend, non-buyer intent: clicks, never a conversion.
  st('st_waste_lowongan_sales', 'kw_gen_mobil_bekas_broad', 'lowongan sales mobil bekas', 'job_seeker', 1.4, [1.4, 0], 0.85),
  st('st_waste_loker_showroom', 'kw_gen_mobil_bekas_broad', 'loker showroom mobil jakarta', 'job_seeker', 1.6, [1.4, 0], 0.8),
  st('st_waste_gaji_sales', 'kw_generic_cars_broad', 'gaji sales mobil bekas', 'job_seeker', 2.3, [1.4, 0], 0.85),
  st('st_waste_skripsi', 'kw_gen_mobil_bekas_broad', 'skripsi pemasaran mobil bekas', 'student', 1.6, [1.3, 0], 0.8),
  st('st_waste_makalah_pdf', 'kw_generic_cars_broad', 'makalah jual beli mobil bekas pdf', 'student', 1.6, [1.3, 0], 0.8),
  st('st_waste_cara_cek_mesin', 'kw_generic_suvs_broad', 'cara cek mesin mobil bekas sendiri', 'consumer', 0.91, [1.3, 0], 0.85),
  st('st_waste_cek_rangka_gratis', 'kw_suv_mobil_suv_bekas_broad', 'cek nomor rangka mobil gratis', 'consumer', 1.404, [1.3, 0], 0.85),
  st('st_waste_poles_diy', 'kw_toyota_murah_broad', 'cara poles body avanza sendiri', 'consumer', 1.9, [1.3, 0], 0.8),
  // Wasted spend, wrong product: new cars, repair, parts.
  st('st_waste_mobil_baru', 'kw_gen_mobil_bekas_broad', 'harga mobil baru 2026', 'consumer', 1.6, [1.4, 0], 0.9),
  st('st_waste_dealer_baru', 'kw_toyota_broad', 'dealer toyota mobil baru', 'consumer', 1.6, [1.3, 0], 0.85),
  st('st_waste_bengkel_toyota', 'kw_toyota_murah_broad', 'bengkel toyota terdekat', 'consumer', 1.4, [1.4, 0], 0.9),
  st('st_waste_servis_jazz', 'kw_honda_murah_broad', 'servis honda jazz', 'consumer', 1.872, [1.4, 0], 0.9),
  st('st_waste_sparepart_xenia', 'kw_daihatsu_murah_broad', 'sparepart daihatsu xenia', 'consumer', 2.6, [1.4, 0], 0.9),
  st('st_waste_aki_suzuki', 'kw_suzuki_murah_broad', 'harga aki mobil suzuki', 'consumer', 2.0, [1.4, 0], 0.9),

  // Hidden winners: long-tail buyer terms converting far above their
  // parent keyword, matched only through phrase — promote to exact.
  st('st_winner_avanza_2019', 'kw_toyota_avanza_phrase', 'avanza g 2019 bekas jakarta timur', 'buyer', 1.382, [1.3, 4.2], 0.9),
  st('st_winner_brio_rs', 'kw_honda_brio_phrase', 'honda brio rs 2020 bekas', 'buyer', 1.382, [1.3, 4.2], 0.9),
  st('st_winner_xenia_r', 'kw_daihatsu_xenia_phrase', 'xenia r deluxe 2018 bekas', 'buyer', 2.6, [1.3, 4.2], 0.9),
  st('st_winner_ertiga_gx', 'kw_suzuki_ertiga_phrase', 'ertiga gx matic bekas', 'buyer', 1.844, [1.3, 4.2], 0.9),
  st('st_winner_innova_diesel', 'kw_toyota_innova_phrase', 'innova reborn diesel bekas', 'buyer', 1.382, [1.3, 4.2], 0.9),
  st('st_winner_jazz_rs', 'kw_honda_jazz_phrase', 'jazz rs bekas jakarta selatan', 'buyer', 2.2, [1.3, 4.2], 0.9),

  // Decoys: buyer-intent, zero conversions, but so little traffic that no
  // honest test can call them waste. The right answer is "not enough data".
  st('st_decoy_murah_bekasi_utara', 'kw_gen_murah_phrase', 'mobil bekas murah bekasi utara', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_suv_pajak_hidup', 'kw_suv_murah_phrase', 'suv bekas pajak hidup', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_avanza_hitam', 'kw_toyota_avanza_phrase', 'avanza bekas warna hitam', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_brio_plat_b', 'kw_honda_brio_phrase', 'brio bekas plat b', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_ertiga_cash', 'kw_suzuki_ertiga_phrase', 'ertiga bekas cash', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_xenia_2015_manual', 'kw_daihatsu_xenia_phrase', 'xenia bekas 2015 manual', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_fortuner_vrz', 'kw_toyota_fortuner_phrase', 'fortuner vrz bekas', 'buyer', 0.4, [1, 0], 0.5),
  st('st_decoy_crv_turbo', 'kw_honda_crv_phrase', 'cr-v turbo bekas', 'buyer', 0.4, [1, 0], 0.5),

  // Legitimate dealer intents (credit, instalments, down payment,
  // trade-in): must classify as buyer and never be flagged as waste.
  st('st_legit_kredit_dp_murah', 'kw_gen_kredit_phrase', 'kredit mobil bekas dp murah', 'buyer', 0.48, [1.1, 1.6], 0.9),
  st('st_legit_cicilan_avanza', 'kw_toyota_avanza_phrase', 'cicilan avanza bekas', 'buyer', 0.32, [1.1, 1.6], 0.85),
  st('st_legit_dp_10_juta', 'kw_gen_dp_murah_phrase', 'mobil bekas dp 10 juta', 'buyer', 0.48, [1.1, 1.6], 0.85),
  st('st_legit_tukar_tambah', 'kw_gen_mobil_bekas_broad', 'tukar tambah mobil bekas', 'buyer', 0.4, [1.1, 1.6], 0.9),
  st('st_legit_kredit_xpander', 'kw_xpander_phrase', 'kredit xpander bekas', 'buyer', 0.4, [1.1, 1.6], 0.85),
  st('st_legit_cicilan_2_juta', 'kw_gen_kredit_phrase', 'mobil bekas cicilan 2 juta', 'buyer', 0.4, [1.1, 1.6], 0.85),

  // Not planted problems — realistic other intents that convert a little.
  st('st_competitor_mobil123', 'kw_gen_jual_phrase', 'mobil123 mobil bekas', 'competitor', 0.15, [0.9, 0.4], 0.7),
  st('st_competitor_olx', 'kw_gen_mobil_bekas_broad', 'olx mobil bekas jakarta', 'competitor', 0.2, [0.9, 0.3], 0.8),
  st('st_research_avanza_vs_xenia', 'kw_toyota_murah_broad', 'perbandingan avanza vs xenia', 'researcher', 0.2, [1.0, 0.3], 0.7),
  st('st_research_review_hrv', 'kw_honda_hrv_phrase', 'review honda hr-v bekas', 'researcher', 0.2, [1.0, 0.5], 0.7),
]

/** FNV-1a — a tiny deterministic string hash, so the generated long tail
 * is identical on every machine and every run. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic value in [0, 1) for (key, salt). */
function unit(key: string, salt: string): number {
  return hash(`${key}|${salt}`) / 4294967296
}

const coreText = (keywordText: string) => keywordText.replace(/[[\]"]/g, '').trim()

const CLOSE_SUFFIXES = ['jakarta', 'terdekat', 'jabodetabek']
const LONG_TAIL_SUFFIXES = [
  'murah', 'jakarta timur', 'bekasi', 'tangerang selatan', 'depok', 'bogor',
  'matic', 'manual', '2018', '2019', '2020', 'km rendah', 'tangan pertama', 'pajak panjang',
]
// The dealer is in Gading Serpong, Tangerang: a brand search names its own
// area. Same positions as above, so each term keeps its key and weights.
const BRAND_LOCATIONS: Record<string, string> = {
  jakarta: 'tangerang',
  jabodetabek: 'serpong',
  'jakarta timur': 'gading serpong',
  bekasi: 'bsd',
  depok: 'bsd serpong',
  bogor: 'alam sutera',
}
const localSuffix = (adGroupKey: string, suffix: string) =>
  adGroupKey.startsWith('brand_') ? (BRAND_LOCATIONS[suffix] ?? suffix) : suffix

/** Generated terms: a close variant for every v3 keyword (the v2 ones
 * already have theirs), and a 3-term buyer-intent long tail for every
 * phrase/broad keyword — the queries that show up only on some days.
 * Shares, weights and appearance odds are jittered per term from a hash of
 * its key, so the long tail varies without being hand-tuned. Skips any
 * text already used in the ad group (search_terms is UNIQUE per ad group
 * on text). */
function generatedTerms(existing: TermSpec[]): TermSpec[] {
  const out: TermSpec[] = []
  const used = new Map<string, Set<string>>() // adGroupKey -> texts
  const adGroupOf = new Map(KEYWORDS.map((k) => [k.key, k.adGroupKey]))
  const claim = (keywordKey: string, text: string): boolean => {
    const ag = adGroupOf.get(keywordKey)!
    if (!used.has(ag)) used.set(ag, new Set())
    const texts = used.get(ag)!
    if (texts.has(text)) return false
    texts.add(text)
    return true
  }
  for (const t of existing) claim(t.keywordKey, t.text)

  const v3Keys = new Set(V3_KEYWORDS.map((k) => k.key))
  for (const k of KEYWORDS) {
    const core = coreText(k.text)
    if (v3Keys.has(k.key)) {
      for (let i = 0; i < CLOSE_SUFFIXES.length; i++) {
        const suffix = localSuffix(k.adGroupKey, CLOSE_SUFFIXES[(hash(k.key) + i) % CLOSE_SUFFIXES.length])
        const text = `${core} ${suffix}`
        if (core.includes(suffix) || !claim(k.key, text)) continue
        out.push(st(`st_${k.key}_close`, k.key, text, 'buyer', 0.6, [1, 1], 1, 'close_variant'))
        break
      }
    }
    if (k.matchType === 'exact') continue
    let made = 0
    for (let i = 0; i < LONG_TAIL_SUFFIXES.length && made < 3; i++) {
      const suffix = localSuffix(k.adGroupKey, LONG_TAIL_SUFFIXES[(hash(k.key) + i * 5) % LONG_TAIL_SUFFIXES.length])
      const text = `${core} ${suffix}`
      if (core.includes(suffix) || !claim(k.key, text)) continue
      const tailKey = `st_${k.key}_tail_${made + 1}`
      out.push(
        st(
          tailKey,
          k.key,
          text,
          'buyer',
          0.06 + 0.08 * unit(tailKey, 'share'),
          [0.7 + 0.6 * unit(tailKey, 'ctr'), 0.6 + 0.8 * unit(tailKey, 'cvr')],
          0.25 + 0.45 * unit(tailKey, 'appears')
        )
      )
      made += 1
    }
  }
  return out
}

const HAND_WRITTEN_TERMS = [...V2_SEARCH_TERMS, ...PLANTED_SEARCH_TERMS]
const adGroupByKeyword = new Map(KEYWORDS.map((k) => [k.key, k.adGroupKey]))

export const SEARCH_TERMS: SearchTermProfile[] = [...HAND_WRITTEN_TERMS, ...generatedTerms(HAND_WRITTEN_TERMS)].map(
  (t) => ({ ...t, adGroupKey: adGroupByKeyword.get(t.keywordKey)! })
)
