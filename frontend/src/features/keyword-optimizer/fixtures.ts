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

export const FIXTURE_KEYWORD_SUMMARY: KeywordSummaryResponse = {
  coverage: 0.81,
  items: [
    {
      keyword_id: 31,
      intent_mix: { buyer: 0.42, researcher: 0.18, job_seeker: 0.27, consumer: 0.13 },
      intent_coverage: 0.78,
      conversions_by_action: [
        { conversion_action_id: 1, name: 'WhatsApp Click', tier: 'lead', conversions: 6, value_micros: 6 * 25_000 * RP },
        { conversion_action_id: 2, name: 'Test Drive Booked', tier: 'visit', conversions: 1, value_micros: 1 * 120_000 * RP },
      ],
      stock_count: null,
      avg_days_listed: null,
      waste_exposure: 0.31,
    },
    {
      keyword_id: 33,
      intent_mix: { buyer: 0.88, researcher: 0.12 },
      intent_coverage: 0.92,
      conversions_by_action: [
        { conversion_action_id: 1, name: 'WhatsApp Click', tier: 'lead', conversions: 9, value_micros: 9 * 25_000 * RP },
        { conversion_action_id: 2, name: 'Test Drive Booked', tier: 'visit', conversions: 3, value_micros: 3 * 120_000 * RP },
        { conversion_action_id: 5, name: 'Financing Page Visit', tier: 'micro', conversions: 4, value_micros: 4 * 5_000 * RP },
      ],
      stock_count: 3,
      avg_days_listed: 41,
      waste_exposure: 0.02,
    },
    {
      keyword_id: 48,
      intent_mix: null, // no classified terms yet: "no data yet", not 0%
      intent_coverage: null,
      conversions_by_action: [],
      stock_count: 0,
      avg_days_listed: null,
      waste_exposure: null,
    },
  ],
}
