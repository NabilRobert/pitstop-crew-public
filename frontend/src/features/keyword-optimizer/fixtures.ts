// Fixtures for the keyword optimizer, shaped EXACTLY like overhaul-v3.md
// section 13 (API contract 3.0) so the page can be built and exercised before
// the backend endpoints exist. Typed against shared/api/types.ts, so any drift
// from the contract is a compile error. Money is micros of IDR (Rp 1,600 =
// 1_600_000_000); the demo's baseline CPC is about Rp 1,600.
//
// Only used when VITE_KEYWORD_OPTIMIZER_FIXTURES=true (see keywordOptimizerApi.ts).
// The set deliberately includes the awkward cases the UI must handle: a
// 'prior' (unverified) suggestion, null rank / explanation / inventory, a
// negative with collisions, a low-confidence item, and each suggestion type.

import type {
  KeywordPerformanceRow,
  KeywordSummary,
  KeywordVerdict,
  InventorySummary,
  KeywordSummaryResponse,
  Suggestion,
  SuggestionsResponse,
} from '../../shared/api/types'

const RP = 1_000_000 // 1 rupiah in micros
const WINDOW = { window_start: '2026-09-07', window_end: '2026-10-05' }
const SNAPSHOT = '2026-10-05'

function evidence(over: Partial<Suggestion['evidence']> = {}): Suggestion['evidence'] {
  return {
    ...WINDOW,
    clicks: null,
    impressions: null,
    cost_micros: null,
    conversions: null,
    conversions_value_micros: null,
    min_clicks_required: null,
    ...over,
  }
}

const CAMPAIGN = { id: 2, name: 'Search — Used Cars Generic' }
const AD_GROUP = { id: 3, name: 'Used SUV' }

export const FIXTURE_SUGGESTIONS: Suggestion[] = [
  {
    id: 101,
    pipeline_run_id: 140,
    type: 'negative_keyword',
    status: 'open',
    basis: 'evidence',
    confidence: 'high',
    rank: 1,
    explanation: 'Job-seeker queries are spending without producing a single lead; adding the shared stem as a negative stops all of them at once.',
    campaign: CAMPAIGN,
    ad_group: AD_GROUP,
    keyword: { id: 31, text: 'mobil bekas', match_type: 'broad' },
    search_term: { id: 901, text: 'lowongan sales mobil bekas' },
    payload: { kind: 'negative_keyword', text: 'lowongan', match_type: 'phrase', scope: 'campaign', collisions: [] },
    evidence: evidence({
      clicks: 64,
      impressions: 2100,
      cost_micros: 64 * 1_600 * RP,
      conversions: 0,
      conversions_value_micros: 0,
      min_clicks_required: 37,
      distinct_terms: 5,
    }),
    expected_impact: { wasted_spend_micros_per_week: 25_600 * RP },
    inventory: null,
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 102,
    pipeline_run_id: 140,
    type: 'negative_keyword',
    status: 'open',
    basis: 'evidence',
    confidence: 'medium',
    rank: 4,
    explanation: 'Wasted spend on "gratis" queries, but one converting term contains the same word, so review before adding.',
    campaign: CAMPAIGN,
    ad_group: AD_GROUP,
    keyword: { id: 32, text: 'mobil murah', match_type: 'broad' },
    search_term: { id: 902, text: 'mobil bekas gratis ongkir' },
    payload: {
      kind: 'negative_keyword',
      text: 'gratis',
      match_type: 'broad',
      scope: 'ad_group',
      collisions: [{ search_term: 'gratis test drive mobil bekas', conversions: 2 }],
    },
    evidence: evidence({ clicks: 52, cost_micros: 52 * 1_700 * RP, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37 }),
    expected_impact: { wasted_spend_micros_per_week: 19_800 * RP },
    inventory: null,
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 103,
    pipeline_run_id: 140,
    type: 'negative_keyword',
    status: 'open',
    basis: 'prior',
    confidence: 'low',
    rank: 9,
    explanation: null,
    campaign: CAMPAIGN,
    ad_group: null,
    keyword: null,
    search_term: null,
    payload: { kind: 'negative_keyword', text: 'mobil baru', match_type: 'phrase', scope: 'campaign', collisions: [] },
    // Preventive negative from the standard junk list: no account data behind it yet.
    evidence: evidence({ min_clicks_required: 37, junk_list_entry: 'new_car' }),
    expected_impact: null,
    inventory: null,
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 104,
    pipeline_run_id: 140,
    type: 'promote_search_term',
    status: 'open',
    basis: 'evidence',
    confidence: 'high',
    rank: 2,
    explanation: 'A long-tail buyer query converts better than the keyword that currently catches it.',
    campaign: CAMPAIGN,
    ad_group: AD_GROUP,
    keyword: { id: 33, text: 'toyota fortuner bekas', match_type: 'phrase' },
    search_term: { id: 903, text: 'fortuner vrz 2019 bekas jakarta' },
    payload: { kind: 'promote_search_term', text: 'fortuner vrz 2019 bekas jakarta', to_match_type: 'exact', ad_group_id: 3 },
    evidence: evidence({
      clicks: 14,
      impressions: 190,
      cost_micros: 14 * 1_500 * RP,
      conversions: 3,
      conversions_value_micros: 3 * 60_000 * RP,
      min_clicks_required: null,
      parent_keyword_cpa_micros: 24_000 * RP,
    }),
    expected_impact: { extra_conversions_per_week: 0.8 },
    inventory: { snapshot_on: SNAPSHOT, stock_count: 2, avg_days_listed: 18, avg_margin_idr: 14_500_000 },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 105,
    pipeline_run_id: 140,
    type: 'pause_keyword',
    status: 'open',
    basis: 'evidence',
    confidence: 'high',
    rank: 3,
    explanation: 'Healthy click-through but no stock to sell: every click on this keyword is wasted until the model is back in stock.',
    campaign: { id: 3, name: 'Search — Model + Suburb' },
    ad_group: { id: 5, name: 'Honda Brio' },
    keyword: { id: 48, text: 'honda brio rs bekas', match_type: 'exact' },
    search_term: null,
    payload: { kind: 'pause_keyword' },
    evidence: evidence({ clicks: 71, impressions: 1500, cost_micros: 71 * 1_450 * RP, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37, quality_score: 4 }),
    expected_impact: { wasted_spend_micros_per_week: 25_700 * RP },
    inventory: { snapshot_on: SNAPSHOT, stock_count: 0, avg_days_listed: null, avg_margin_idr: null },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 106,
    pipeline_run_id: 140,
    type: 'change_match_type',
    status: 'open',
    basis: 'evidence',
    confidence: 'medium',
    rank: 5,
    explanation: 'Broad match is pulling in mostly researchers; exact match keeps the buyer intent.',
    campaign: CAMPAIGN,
    ad_group: { id: 4, name: 'Used Sedan' },
    keyword: { id: 40, text: 'sedan bekas', match_type: 'broad' },
    search_term: null,
    payload: { kind: 'change_match_type', from: 'broad', to: 'phrase' },
    evidence: evidence({ clicks: 120, cost_micros: 120 * 1_600 * RP, conversions: 4, conversions_value_micros: 4 * 55_000 * RP, min_clicks_required: null, non_buyer_spend_share: 0.58 }),
    expected_impact: { wasted_spend_micros_per_week: 31_000 * RP },
    inventory: null,
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 107,
    pipeline_run_id: 140,
    type: 'spin_out_campaign',
    status: 'open',
    basis: 'evidence',
    confidence: 'medium',
    rank: 6,
    explanation: 'Four Fortuner keywords convert at well below the account cost per lead but share a budget with weaker keywords.',
    campaign: CAMPAIGN,
    ad_group: AD_GROUP,
    keyword: null,
    search_term: null,
    payload: { kind: 'spin_out_campaign', keyword_ids: [33, 34, 35, 36], suggested_name: 'Search — Toyota Fortuner', make: 'Toyota', model: 'Fortuner' },
    evidence: evidence({ clicks: 210, cost_micros: 210 * 1_550 * RP, conversions: 17, conversions_value_micros: 17 * 58_000 * RP, min_clicks_required: null, cluster_cpa_micros: 19_100 * RP, parent_cpa_micros: 29_400 * RP }),
    expected_impact: { extra_conversions_per_week: 2.4 },
    inventory: { snapshot_on: SNAPSHOT, stock_count: 3, avg_days_listed: 41, avg_margin_idr: 16_000_000 },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 108,
    pipeline_run_id: 140,
    type: 'new_keyword',
    status: 'open',
    basis: 'prior',
    confidence: 'low',
    rank: 7,
    explanation: 'Three Innova units have been listed for over two months and no keyword targets them directly.',
    campaign: { id: 3, name: 'Search — Model + Suburb' },
    ad_group: null,
    keyword: null,
    search_term: null,
    payload: { kind: 'new_keyword', text: 'innova zenix bekas bandung', match_type: 'phrase', ad_group_id: null, source: 'stock', vehicle_ids: [211, 212, 219], is_test: true },
    evidence: evidence({ min_clicks_required: 37, stock_rows: 3 }),
    expected_impact: null,
    inventory: { snapshot_on: SNAPSHOT, stock_count: 3, avg_days_listed: 67, avg_margin_idr: 12_000_000 },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 109,
    pipeline_run_id: 140,
    type: 'raise_bid_candidate',
    status: 'open',
    basis: 'evidence',
    confidence: 'medium',
    rank: null, // not ranked by the model yet: the UI must still show it
    explanation: null,
    campaign: CAMPAIGN,
    ad_group: AD_GROUP,
    keyword: { id: 33, text: 'toyota fortuner bekas', match_type: 'phrase' },
    search_term: null,
    payload: { kind: 'raise_bid_candidate', current_bid_micros: 1_800 * RP, rank_lost_share: 0.34 },
    evidence: evidence({ clicks: 88, cost_micros: 88 * 1_800 * RP, conversions: 6, conversions_value_micros: 6 * 58_000 * RP, min_clicks_required: null }),
    expected_impact: { extra_conversions_per_week: 1.1 },
    inventory: { snapshot_on: SNAPSHOT, stock_count: 3, avg_days_listed: 41, avg_margin_idr: 16_000_000 },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 90,
    pipeline_run_id: 133,
    type: 'negative_keyword',
    status: 'applied',
    basis: 'evidence',
    confidence: 'high',
    rank: 1,
    explanation: 'Applied last week.',
    campaign: CAMPAIGN,
    ad_group: null,
    keyword: null,
    search_term: null,
    payload: { kind: 'negative_keyword', text: 'bengkel', match_type: 'phrase', scope: 'campaign', collisions: [] },
    evidence: evidence({ clicks: 48, cost_micros: 48 * 1_500 * RP, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37 }),
    expected_impact: null,
    inventory: null,
    created_at: '2026-09-28T23:10:00Z',
    status_changed_at: '2026-09-30T08:00:00Z',
  },
  // ---- Campaign proposals (contract 3.3) --------------------------------------------------------
  {
    id: 201,
    pipeline_run_id: 140,
    type: 'new_campaign',
    status: 'open',
    basis: 'prior',
    confidence: 'medium',
    rank: 3,
    explanation: 'Three Innova Zenix units have been listed for over two months and no campaign or keyword points at them.',
    campaign: null,
    ad_group: null,
    keyword: null,
    search_term: null,
    linked_campaign: null,
    payload: {
      kind: 'new_campaign',
      basis: 'uncovered_stock',
      name: 'Search — Toyota Innova Zenix',
      theme: null,
      ad_groups: [
        {
          name: 'Innova Zenix',
          keywords: [
            { text: 'innova zenix bekas', match_type: 'exact', source: 'stock' },
            { text: 'innova zenix second', match_type: 'phrase', source: 'stock' },
            { text: 'jual innova zenix bekas jakarta', match_type: 'phrase', source: 'stock' },
            { text: 'innova zenix hybrid bekas', match_type: 'phrase', source: 'stock' },
          ],
          vehicle_ids: [211, 212, 219],
        },
      ],
      starter_negatives: [
        { text: 'lowongan', match_type: 'phrase' },
        { text: 'gratis', match_type: 'broad' },
        { text: 'mobil baru', match_type: 'phrase' },
        { text: 'bengkel', match_type: 'phrase' },
      ],
      budget: {
        daily_micros: 120_000 * RP,
        target_cpa_micros: 48_000 * RP,
        assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 },
      },
      stock: { units: 3, avg_days_listed: 67, avg_margin_idr: 12_000_000, total_value_idr: 1_185_000_000, snapshot_on: SNAPSHOT },
      overlaps: [{ campaign_id: 3, name: 'Search — Model + Suburb', shared_keywords: 1 }],
    },
    evidence: evidence({ min_clicks_required: 37, stock_rows: 3 }),
    expected_impact: { extra_conversions_per_week: 1.4 },
    inventory: { snapshot_on: SNAPSHOT, stock_count: 3, avg_days_listed: 67, avg_margin_idr: 12_000_000 },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 202,
    pipeline_run_id: 140,
    type: 'new_campaign',
    status: 'open',
    basis: 'prior',
    confidence: 'low',
    rank: 6,
    explanation: null,
    campaign: null,
    ad_group: null,
    keyword: null,
    search_term: null,
    linked_campaign: null,
    payload: {
      kind: 'new_campaign',
      basis: 'theme',
      name: 'Search — Family cars under Rp 200 juta',
      theme: 'Family cars under Rp 200 juta',
      ad_groups: [
        { name: 'Toyota Avanza', keywords: [{ text: 'avanza bekas murah', match_type: 'phrase', source: 'stock' }, { text: 'avanza veloz bekas', match_type: 'phrase', source: 'stock' }], vehicle_ids: [301, 302] },
        { name: 'Suzuki Ertiga', keywords: [{ text: 'ertiga bekas', match_type: 'phrase', source: 'stock' }, { text: 'ertiga gl bekas', match_type: 'exact', source: 'stock' }], vehicle_ids: [303] },
        { name: 'Daihatsu Sigra', keywords: [{ text: 'sigra bekas', match_type: 'phrase', source: 'stock' }], vehicle_ids: [304, 305] },
      ],
      starter_negatives: [{ text: 'lowongan', match_type: 'phrase' }, { text: 'sparepart', match_type: 'phrase' }],
      budget: {
        daily_micros: 90_000 * RP,
        target_cpa_micros: null, // no margin data for these units: the UI must say so, not show 0
        assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 },
      },
      stock: { units: 5, avg_days_listed: 24, avg_margin_idr: null, total_value_idr: 880_000_000, snapshot_on: SNAPSHOT },
      overlaps: [],
    },
    evidence: evidence({ min_clicks_required: 37 }),
    expected_impact: null,
    inventory: { snapshot_on: SNAPSHOT, stock_count: 5, avg_days_listed: 24, avg_margin_idr: null },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 203,
    pipeline_run_id: 140,
    type: 'new_campaign',
    status: 'open',
    basis: 'evidence',
    confidence: 'high',
    rank: 5,
    explanation: 'Your four Fortuner keywords convert at a cost well under the account average, but they share a budget with weaker keywords.',
    campaign: null,
    ad_group: null,
    keyword: null,
    search_term: null,
    linked_campaign: null,
    payload: {
      kind: 'new_campaign',
      basis: 'proven_cluster',
      name: 'Search — Toyota Fortuner',
      theme: null,
      ad_groups: [
        {
          name: 'Fortuner',
          keywords: [
            { text: 'toyota fortuner bekas', match_type: 'phrase', source: 'existing_keyword' },
            { text: 'fortuner vrz bekas', match_type: 'phrase', source: 'existing_keyword' },
            { text: 'fortuner 2019 bekas', match_type: 'exact', source: 'existing_keyword' },
            { text: 'jual fortuner second', match_type: 'phrase', source: 'existing_keyword' },
          ],
          vehicle_ids: [101, 102, 103],
        },
      ],
      starter_negatives: [{ text: 'lowongan', match_type: 'phrase' }, { text: 'gratis', match_type: 'broad' }],
      budget: { daily_micros: 220_000 * RP, target_cpa_micros: 64_000 * RP, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 } },
      stock: { units: 3, avg_days_listed: 41, avg_margin_idr: 16_000_000, total_value_idr: 1_155_000_000, snapshot_on: SNAPSHOT },
      overlaps: [{ campaign_id: 2, name: 'Search — Used Cars Generic', shared_keywords: 4 }],
    },
    evidence: evidence({ clicks: 210, cost_micros: 210 * 1_550 * RP, conversions: 17, conversions_value_micros: 17 * 58_000 * RP, min_clicks_required: null }),
    expected_impact: { extra_conversions_per_week: 2.4 },
    inventory: { snapshot_on: SNAPSHOT, stock_count: 3, avg_days_listed: 41, avg_margin_idr: 16_000_000 },
    created_at: '2026-10-05T23:10:00Z',
    status_changed_at: null,
  },
  {
    id: 204,
    pipeline_run_id: 133,
    type: 'new_campaign',
    status: 'planned',
    basis: 'prior',
    confidence: 'medium',
    rank: 2,
    explanation: 'Approved last week.',
    campaign: null,
    ad_group: null,
    keyword: null,
    search_term: null,
    linked_campaign: null,
    payload: {
      kind: 'new_campaign',
      basis: 'aging_stock',
      name: 'Search — Honda HR-V',
      theme: null,
      ad_groups: [{ name: 'Honda HR-V', keywords: [{ text: 'honda hr-v bekas', match_type: 'phrase', source: 'existing_keyword' }, { text: 'hrv se bekas', match_type: 'exact', source: 'stock' }], vehicle_ids: [401, 402, 403, 404] }],
      starter_negatives: [{ text: 'lowongan', match_type: 'phrase' }],
      budget: { daily_micros: 110_000 * RP, target_cpa_micros: 44_000 * RP, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 } },
      stock: { units: 4, avg_days_listed: 62, avg_margin_idr: 11_000_000, total_value_idr: 1_240_000_000, snapshot_on: SNAPSHOT },
      overlaps: [],
    },
    evidence: evidence({ min_clicks_required: 37 }),
    expected_impact: null,
    inventory: { snapshot_on: SNAPSHOT, stock_count: 4, avg_days_listed: 62, avg_margin_idr: 11_000_000 },
    created_at: '2026-09-28T23:10:00Z',
    status_changed_at: '2026-09-30T08:00:00Z',
  },
]

export const FIXTURE_SUGGESTIONS_RESPONSE: SuggestionsResponse = {
  items: FIXTURE_SUGGESTIONS.filter((s) => s.status === 'open'),
  total: FIXTURE_SUGGESTIONS.filter((s) => s.status === 'open').length,
  run: { id: 140, finished_at: '2026-10-05T23:12:00Z', status: 'success' },
  inventory: { source: 'demo', snapshot_on: SNAPSHOT },
}

/** A fresh install: no run yet. Must render as an empty state, not an error. */
export const FIXTURE_EMPTY_RESPONSE: SuggestionsResponse = {
  items: [],
  total: 0,
  run: null,
  inventory: { source: 'demo', snapshot_on: null },
}

export const FIXTURE_INVENTORY: InventorySummary = {
  source: 'demo',
  snapshot_on: SNAPSHOT,
  error: null,
  totals: { available: 46, reserved: 5, sold_last_30d: 9 },
  aging: [
    { bucket: '0-30', count: 17 },
    { bucket: '31-60', count: 14 },
    { bucket: '61-90', count: 9 },
    { bucket: '90+', count: 6 },
  ],
  by_model: [
    { make: 'Toyota', model: 'Fortuner', available: 3, avg_days_listed: 41, avg_price_idr: 385_000_000, avg_margin_idr: 16_000_000, linked_keyword_count: 4 },
    { make: 'Toyota', model: 'Innova Zenix', available: 3, avg_days_listed: 67, avg_price_idr: 395_000_000, avg_margin_idr: 12_000_000, linked_keyword_count: 0 },
    { make: 'Honda', model: 'Brio RS', available: 0, avg_days_listed: null, avg_price_idr: null, avg_margin_idr: null, linked_keyword_count: 2 },
    { make: 'Honda', model: 'HR-V', available: 4, avg_days_listed: 22, avg_price_idr: 310_000_000, avg_margin_idr: 11_000_000, linked_keyword_count: 3 },
    { make: 'Mitsubishi', model: 'Xpander', available: 5, avg_days_listed: 28, avg_price_idr: 245_000_000, avg_margin_idr: 9_500_000, linked_keyword_count: 3 },
  ],
}

/** The source is down: still HTTP 200, but with source 'unavailable' and an error. */
export const FIXTURE_INVENTORY_UNAVAILABLE: InventorySummary = {
  source: 'unavailable',
  snapshot_on: null,
  error: 'Inventory database unreachable (connection timed out)',
  totals: null,
  aging: [],
  by_model: [],
}

// ---------------------------------------------------------------------------
// Keywords for the cork board. One compact table drives both the per-day
// performance rows (here a single row per keyword, dated the window end) and
// the window summary, so the two can never disagree. Ids 31, 32, 33, 40 and 48
// are the ones the suggestion fixtures above point at.
// ---------------------------------------------------------------------------

interface FixtureKeyword {
  id: number
  text: string
  match: 'exact' | 'phrase' | 'broad'
  campaign: { id: number; name: string }
  adGroup: { id: number; name: string }
  /** Spend in thousand rupiah, clicks, conversions in the window. */
  spendK: number
  clicks: number
  conv: number
  verdict: KeywordVerdict
  stock: number | null
}

const C_GENERIC = { id: 2, name: 'Search — Used Cars Generic' }
const C_MODEL = { id: 3, name: 'Search — Model + Suburb' }
const C_BRAND = { id: 1, name: 'Brand' }
const AG_SUV = { id: 3, name: 'Used SUV' }
const AG_SEDAN = { id: 4, name: 'Used Sedan' }
const AG_BRIO = { id: 5, name: 'Honda Brio' }
const AG_MPV = { id: 6, name: 'Used MPV' }
const AG_BRAND = { id: 1, name: 'Brand terms' }

const KEYWORDS: FixtureKeyword[] = [
  { id: 33, text: 'toyota fortuner bekas', match: 'phrase', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 1400, clicks: 88, conv: 9, verdict: 'winner', stock: 3 },
  { id: 34, text: 'fortuner vrz bekas', match: 'phrase', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 760, clicks: 47, conv: 5, verdict: 'winner', stock: 3 },
  { id: 35, text: 'fortuner 2019 bekas', match: 'exact', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 520, clicks: 33, conv: 3, verdict: 'winner', stock: 2 },
  { id: 36, text: 'jual fortuner second', match: 'phrase', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 410, clicks: 26, conv: 3, verdict: 'winner', stock: 3 },
  { id: 31, text: 'mobil bekas', match: 'broad', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 2100, clicks: 133, conv: 2, verdict: 'wasting', stock: null },
  { id: 32, text: 'mobil murah', match: 'broad', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 880, clicks: 52, conv: 0, verdict: 'wasting', stock: null },
  { id: 48, text: 'honda brio rs bekas', match: 'exact', campaign: C_MODEL, adGroup: AG_BRIO, spendK: 1030, clicks: 71, conv: 0, verdict: 'no_stock', stock: 0 },
  { id: 49, text: 'honda brio satya bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_BRIO, spendK: 360, clicks: 24, conv: 1, verdict: 'no_stock', stock: 0 },
  { id: 40, text: 'sedan bekas', match: 'broad', campaign: C_GENERIC, adGroup: AG_SEDAN, spendK: 1250, clicks: 120, conv: 4, verdict: 'steady', stock: 5 },
  { id: 41, text: 'honda civic bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_SEDAN, spendK: 640, clicks: 41, conv: 3, verdict: 'steady', stock: 1 },
  { id: 42, text: 'toyota camry bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_SEDAN, spendK: 280, clicks: 17, conv: 1, verdict: 'needs_data', stock: 1 },
  { id: 50, text: 'mitsubishi xpander bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_MPV, spendK: 990, clicks: 66, conv: 7, verdict: 'winner', stock: 5 },
  { id: 51, text: 'xpander cross second', match: 'phrase', campaign: C_MODEL, adGroup: AG_MPV, spendK: 330, clicks: 21, conv: 2, verdict: 'steady', stock: 4 },
  { id: 52, text: 'toyota avanza bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_MPV, spendK: 540, clicks: 36, conv: 2, verdict: 'steady', stock: 2 },
  { id: 53, text: 'innova reborn bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_MPV, spendK: 470, clicks: 30, conv: 1, verdict: 'needs_data', stock: 2 },
  { id: 54, text: 'innova zenix bekas', match: 'exact', campaign: C_MODEL, adGroup: AG_MPV, spendK: 90, clicks: 6, conv: 0, verdict: 'testing', stock: 3 },
  { id: 55, text: 'daihatsu ayla bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_BRIO, spendK: 150, clicks: 12, conv: 0, verdict: 'needs_data', stock: 1 },
  { id: 56, text: 'honda hr-v bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_SUV, spendK: 720, clicks: 48, conv: 4, verdict: 'steady', stock: 4 },
  { id: 57, text: 'suzuki ertiga bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_MPV, spendK: 260, clicks: 19, conv: 0, verdict: 'needs_data', stock: 0 },
  { id: 58, text: 'cicilan mobil bekas', match: 'phrase', campaign: C_GENERIC, adGroup: AG_SEDAN, spendK: 610, clicks: 39, conv: 4, verdict: 'steady', stock: null },
  { id: 59, text: 'tukar tambah mobil', match: 'phrase', campaign: C_GENERIC, adGroup: AG_SEDAN, spendK: 340, clicks: 22, conv: 2, verdict: 'steady', stock: null },
  { id: 60, text: 'showroom mobil bekas jakarta', match: 'phrase', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 580, clicks: 35, conv: 3, verdict: 'steady', stock: null },
  { id: 61, text: 'pitstop auto', match: 'exact', campaign: C_BRAND, adGroup: AG_BRAND, spendK: 300, clicks: 58, conv: 6, verdict: 'winner', stock: null },
  { id: 62, text: 'pitstop mobil bekas', match: 'phrase', campaign: C_BRAND, adGroup: AG_BRAND, spendK: 210, clicks: 41, conv: 4, verdict: 'winner', stock: null },
  { id: 63, text: 'harga mobil baru', match: 'broad', campaign: C_GENERIC, adGroup: AG_SEDAN, spendK: 470, clicks: 44, conv: 0, verdict: 'wasting', stock: null },
  { id: 64, text: 'servis mobil terdekat', match: 'broad', campaign: C_GENERIC, adGroup: AG_SEDAN, spendK: 390, clicks: 38, conv: 0, verdict: 'wasting', stock: null },
  { id: 65, text: 'sparepart mobil bekas', match: 'broad', campaign: C_GENERIC, adGroup: AG_SUV, spendK: 120, clicks: 9, conv: 0, verdict: 'needs_data', stock: null },
  { id: 66, text: 'toyota yaris bekas', match: 'phrase', campaign: C_MODEL, adGroup: AG_SEDAN, spendK: 60, clicks: 5, conv: 0, verdict: 'needs_data', stock: 1 },
]

const MIX: Record<KeywordVerdict, KeywordSummary['intent_mix']> = {
  winner: { buyer: 0.88, researcher: 0.12 },
  wasting: { buyer: 0.4, researcher: 0.2, job_seeker: 0.25, consumer: 0.15 },
  no_stock: { buyer: 0.8, researcher: 0.2 },
  testing: null, // brand new: nothing classified yet, must show "no data yet" rather than 0%
  needs_data: { buyer: 0.6, researcher: 0.4 },
  steady: { buyer: 0.7, researcher: 0.3 },
}

/** The window's keyword rows (one per keyword, dated the window end). */
export const FIXTURE_KEYWORD_ROWS: KeywordPerformanceRow[] = KEYWORDS.map((k) => ({
  date: '2026-10-05',
  keyword_id: k.id,
  text: k.text,
  match_type: k.match,
  ad_group_id: k.adGroup.id,
  ad_group: k.adGroup.name,
  campaign_id: k.campaign.id,
  campaign: k.campaign.name,
  impressions: k.clicks * 22,
  clicks: k.clicks,
  cost_micros: k.spendK * 1_000 * RP,
  conversions: k.conv,
  quality_score: 6,
  expected_ctr: 'average',
  ad_relevance: 'average',
  landing_page_experience: 'average',
  conversions_value_micros: k.conv * 25_000 * RP,
}))

export const FIXTURE_KEYWORD_SUMMARY: KeywordSummaryResponse = {
  coverage: 0.81,
  items: KEYWORDS.map<KeywordSummary>((k) => ({
    keyword_id: k.id,
    verdict: k.verdict,
    intent_mix: MIX[k.verdict],
    intent_coverage: MIX[k.verdict] ? 0.8 : null,
    conversions_by_action:
      k.conv > 0
        ? [{ conversion_action_id: 1, name: 'WhatsApp Click', tier: 'lead', conversions: k.conv, value_micros: k.conv * 25_000 * RP }]
        : [],
    stock_count: k.stock,
    avg_days_listed: k.stock ? 30 : null,
    waste_exposure: k.verdict === 'wasting' ? 0.4 : k.verdict === 'winner' ? 0.02 : null,
  })),
}
