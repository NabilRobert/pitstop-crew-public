# Contract 3.3 delta: campaign proposals (`new_campaign`)

This file is the COMPLETE text of what is new in contract 3.3 and in backend section 11.7, copied verbatim from the master docs in the frontend repo, so it can be applied on top of your own copies of `overhaul-v3.md` and `overhaul-v3-backend.md` without overwriting your 3.2 contract text and your section 11.6 (which exist only on your side). Everything here is additive; version 3.3 = 3.2 + this.

**Context and a rule change.** On 2026-10-06 the owner decided the AI should propose whole new campaigns from the inventory, that approving one puts it in a Planned lane with a paste-ready brief, and that the END STATE is creating campaigns and ads in Google Ads from inside Pitstop. That write path is phase 4 and is NOT part of this work: do not build any write to Google Ads, and keep saying "suggestions only" everywhere user-facing until it ships. The safeguards phase 4 will need are recorded in the scope doc, section 3.1.

## A. Changes to section 13 (API contract)

### A1. Types

```ts
type SuggestionType =
  | 'negative_keyword' | 'promote_search_term' | 'change_match_type' | 'pause_keyword'
  | 'spin_out_campaign' | 'new_keyword' | 'raise_bid_candidate'
  | 'new_campaign'                    // 3.3: a whole new campaign proposal, see the payload below
type SuggestionStatus = 'open' | 'planned' | 'applied' | 'dismissed' | 'superseded'   // 3.3 adds 'planned'

type CampaignBasis = 'uncovered_stock' | 'aging_stock' | 'proven_cluster' | 'theme'

interface NewCampaignPayload {                   // 3.3
  kind: 'new_campaign'
  basis: CampaignBasis                           // why the engine proposes it
  name: string                                   // suggested campaign name; also what links it to the real campaign later
  theme: string | null                           // e.g. 'Family cars under Rp 200 juta' for a theme campaign
  ad_groups: {
    name: string
    keywords: { text: string; match_type: MatchType; source: 'stock' | 'existing_keyword' | 'keyword_ideas' }[]
    vehicle_ids: number[]                        // the stock this ad group is for
  }[]
  starter_negatives: { text: string; match_type: MatchType }[]   // so the new campaign does not start by leaking spend
  budget: {
    daily_micros: number                         // suggested daily budget
    target_cpa_micros: number | null             // derived from margin x allowed spend share x lead-to-sale rate
    assumptions: { allowed_spend_share: number; lead_to_sale_rate: number }   // shown, because lead_to_sale_rate is a guess
  }
  stock: { units: number; avg_days_listed: number | null; avg_margin_idr: number | null; total_value_idr: number | null; snapshot_on: string }
  overlaps: { campaign_id: number; name: string; shared_keywords: number }[]  // existing campaigns already targeting some of this
}

// on interface Suggestion, add:
  linked_campaign: { id: number; name: string } | null   // 3.3: set when a `planned` campaign shows up in the real data (same name), at which point status becomes 'applied'
```

Also add `NewCampaignPayload` to the `SuggestionPayload` union (`| NewCampaignPayload`).

### A2. PATCH /keyword-suggestions/:id (replaces the old text)

`PATCH /keyword-suggestions/:id`
- Body: `{ "status": "applied" | "dismissed" | "open" | "planned" }`. Owner only (demo gets 403). `planned` is valid only for `type: 'new_campaign'` (anything else is 400).
- Allowed transitions: `open → applied`, `open → dismissed`, `applied → open`, `dismissed → open` (undo); for `new_campaign` also `open → planned`, `planned → open` (undo), `planned → dismissed`, and `planned → applied` (the owner created it in Google Ads by hand). The server also moves `planned → applied` by itself, and sets `linked_campaign`, when a campaign with the same name appears in the synced data. `superseded` is set only by the server; trying to change it returns 409; setting it returns 400.
- 200: the updated `Suggestion`. 400 invalid body or `:id`; 404 unknown id; 409 on a `superseded` row.

### A3. New endpoint

`GET /keyword-suggestions/:id/brief` (3.3)
- Only for `type: 'new_campaign'` (else 400). Query `format` = `csv` | `txt` (default `csv`). 200 with `Content-Disposition: attachment`, 404 unknown id.
- The paste-ready campaign brief: campaign name, daily budget, each ad group, each keyword with its match type, and the starter negatives, in the shape Google Ads Editor imports (**VERIFY** the exact columns against a real Editor export, like the negatives export). Same formula-injection neutralization as the negatives export: every field is untrusted text. The `txt` form is a readable outline for pasting into a chat or a document.

## B. New backend section 11.7

### 11.7 Campaign proposals: the `new_campaign` suggestion (contract 3.3)

The owner wants the AI to look at the inventory and propose **whole new campaigns**, which, when approved, appear as **Planned** campaigns with a paste-ready brief (and, much later, can be created in Google Ads, see scope doc 3.1; that write path is **not** part of this task). Code decides; the model only explains, exactly as for every other suggestion. All thresholds are **STARTING DEFAULTS**, settings-backed where it makes sense, and tuned with the scoring harness.

**Four bases** (`payload.basis`):
- `uncovered_stock`: a make/model group (from `keyword_vehicle_parse` plus `vehicles`) with at least 2 available units and **no enabled keyword or campaign targeting it**. This is the clearest case: cars you can sell that nothing advertises.
- `aging_stock`: units listed 60 or more days, or in the top quartile of margin, where coverage is thin (few keywords, or only needs_data / steady verdicts). Overlaps are reported, not hidden.
- `proven_cluster`: the existing spin-out logic (4+ keywords on one make/model, cost per conversion well under the ad group's). Keep emitting `spin_out_campaign` for it **or** fold it into `new_campaign`, but never emit both for the same cluster. Say in your report which you chose.
- `theme`: a price band or body type built from the stock mix, e.g. "family cars under Rp 200 juta": at least 4 units across at least 2 models in the band, with ad groups per model.

**Proposal contents** (all computed in code, from `NewCampaignPayload` in the contract):
- **Name:** deterministic from the make/model or theme ("Search — Toyota Innova Zenix"), made unique against existing campaign names and against open or planned proposals. The name matters: it is how a planned campaign is later recognised in the real data.
- **Ad groups:** one per model (theme campaigns: per model within the band), each with `vehicle_ids`. **Keywords** are generated from stock attributes (make, model, year, "bekas" / "second", plus the dealer's city or suburbs the existing campaigns already use), each with a match type and a `source`. Cap at about 12 keywords per campaign and 4 ad groups; never propose a keyword that already exists in an enabled state or is a negative.
- **Starter negatives:** the standard junk list plus the account's existing campaign-level negatives, so the new campaign does not begin by leaking spend.
- **Budget:** `target_cpa_micros` from the section 10 formula (margin x allowed spend share x lead-to-sale rate). `daily_micros = clamp((allowed_spend_share x total margin of the units) / 30, floor, ceiling)`: the most the stock can justify, spread over a month, bounded by a settings floor and ceiling so a big pile of expensive cars cannot propose an absurd budget. Always include `assumptions`: `lead_to_sale_rate` is a guess, so any proposal that leans on it is `basis: 'prior'` (shown as unverified) and `confidence` is capped at `medium`.
- **Overlaps:** existing campaigns that already target any of the proposal's keywords or models (`shared_keywords` counted), so the UI can warn about cannibalising.
- **`stock`:** units, average days listed, average margin, total value, and the inventory snapshot date.

**Guards:** at most 3 `new_campaign` proposals per run, ranked by (units x average margin); skip one whose fingerprint already has an open or planned proposal, or was dismissed recently; never propose from an inventory snapshot the source reported as unavailable (say so instead).

**Lifecycle:** `open -> planned` (the owner approved it), `planned -> open` (undo), `planned -> dismissed`, `planned -> applied` (the owner created it by hand). After each data sync, if a campaign whose name matches a `planned` proposal (case-insensitive, trimmed) now exists, set `linked_campaign`, move the suggestion to `applied`, and stop proposing it.

**Brief endpoint:** `GET /keyword-suggestions/:id/brief?format=csv|txt` for `new_campaign` only (scope doc section 13). The columns for Google Ads Editor must be **verified against a real Editor export**, like the negatives export. Neutralize every field against formula injection.

**LLM step:** Kai ranks and explains the proposals in plain language ("You have 3 Innova Zenix units, listed 67 days, nothing advertises them"); the validator rejects unknown ids and any number not present in the proposal's own fields. Ciri grades as usual.

**Demo data and harness:** plant ground truth for each basis (at least: 3 models in stock with no coverage, an aging group, a price-band theme, plus a **decoy**: stock that is already well covered and must NOT produce a proposal) and score them like every other plant.

**Tests:** each basis fires; the decoy does not; name uniqueness; budget clamp (floor, ceiling, zero margin); keyword cap and de-duplication against existing keywords and negatives; overlap counting; dedupe and per-run cap; `planned -> applied` auto-link on a matching campaign name (case and whitespace insensitive); brief CSV neutralization; `planned` rejected for any other suggestion type.

## C. Please also send me

Your section 11.6 (verdict thresholds) and any other text you changed or added in `overhaul-v3.md` / `overhaul-v3-backend.md` for 3.1 and 3.2, so I can merge it into the master copies in the frontend repo. The master copy of these docs must have one owner; I will keep it and you keep yours in sync with it.
