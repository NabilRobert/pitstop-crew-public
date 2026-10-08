# Contract 3.6 delta: ad suggestions and simulated launches

The COMPLETE text of what is new in contract 3.6 and backend section 11.9, to apply on top of your own copies of `overhaul-v3.md` and `overhaul-v3-backend.md`. Everything is additive; version 3.6 = 3.5 + this. Nothing here sends anything to Google Ads.

## A. Scope doc: new section 3.6 (contract)

### 3.6 Ads and simulated launches (added 2026-10-08)

The owner wants the AI to **suggest ads** the way it suggests keywords and campaigns ("I think this ad would work, here is why"), built from the **inventory** and from keywords the system has **proven to be winners**, and wants to try creating a campaign with its ads from inside Pitstop **as a simulation** first. Everything here is additive.

```ts
type SuggestionType = ... | 'new_ad'                          // 3.6; 'planned' (3.3) is now valid for new_campaign AND new_ad

type AdCheckFlags = {                                          // computed in code, shown by the UI; never the model's opinion
  limits_ok: boolean            // 3-15 headlines of at most 30 characters, 2-4 descriptions of at most 90, paths of at most 15
  numbers_from_facts: boolean   // every number in the copy comes from `facts`
  claims_allowed: boolean       // no claim the dealer profile does not allow (financing, trade-in, test drive, inspection)
}

interface NewAdPayload {
  kind: 'new_ad'
  target:
    | { kind: 'existing_ad_group'; ad_group_id: number }
    | { kind: 'proposed_campaign'; campaign_suggestion_id: number; ad_group_name: string }
  basis: 'new_campaign' | 'weak_ad' | 'uncovered_winner'      // why this ad: for a proposed campaign / replaces a poor-or-average ad / winners' wording appears in no headline
  headlines: { text: string }[]                                // 3-15, each at most 30 characters
  descriptions: { text: string }[]                             // 2-4, each at most 90 characters
  path1: string | null                                         // at most 15 characters
  path2: string | null
  final_url: string | null                                     // null until the dealer profile has a landing page (the demo has none)
  facts: {                                                     // everything the copy is allowed to say
    make: string | null; model: string | null
    units: number
    year_from: number | null; year_to: number | null
    price_from_idr: number | null; price_to_idr: number | null
    mileage_from_km: number | null
    dealer: string; city: string | null; area: string | null; whatsapp: string | null
    claims_used: ('installments' | 'trade_in' | 'test_drive' | 'inspection')[]
    snapshot_on: string
  }
  winner_keywords: { keyword_id: number | null; text: string }[]  // proven winners that shaped the wording
  replaces_ad: { id: number; label: string; ad_strength: 'poor' | 'average' | 'good' | 'excellent' | null } | null
  checks: AdCheckFlags
  polished: boolean                                            // true when the model reworded the template copy and it passed validation; false = template copy
}
// Add `| NewAdPayload` to the SuggestionPayload union.
```

**Lifecycle.** `new_ad` follows `new_campaign`: `open -> planned -> applied | dismissed`, with `planned -> open` as undo (`planned` is valid for these two types only).

**Settings (additive; flat strings in `/settings`, validated per key).** Dealer profile and what ads may claim:

| Key | Default | Valid |
|---|---|---|
| `dealer_name` | `'Pitstop Used Cars'` | non-empty, at most 40 characters |
| `dealer_city` | `'Tangerang'` | at most 40 characters, may be empty |
| `dealer_area` | `'Gading Serpong'` | at most 40 characters, may be empty |
| `dealer_whatsapp` | `'0812-5550-0123'` | a placeholder number for the demo; digits, spaces, `-`, `+`, at most 20 characters, may be empty |
| `dealer_landing_url` | `''` | empty, or an `http(s)://` URL; empty means ads carry `final_url: null` |
| `ads_claim_installments` | `'true'` | `'true'` or `'false'` |
| `ads_claim_trade_in` | `'true'` | same |
| `ads_claim_test_drive` | `'true'` | same |
| `ads_claim_inspection` | `'true'` | same |
| `ads_inspection_wording` | `'Unit sudah melalui pemeriksaan'` | at most 60 characters; the exact wording ads may use when inspection is allowed |
| `ads_write_enabled` | `'false'` | `'true'` or `'false'`: the **kill switch** for creating anything, simulated or not |
| `ads_write_mode` | `'simulated'` | only `'simulated'` is accepted for now; `'live'` is rejected with 400 until the write path exists |

**`Campaign` (from `GET /campaigns`) gains `simulated: boolean`** (true for a campaign created by a simulated launch; false for everything else).

**Launches.** `POST /launches` (owner only; demo gets 403). Body:

```ts
{ suggestion_id: number            // a PLANNED new_campaign (its planned ads are created with it) or a PLANNED new_ad on an existing ad group
  validate_only: boolean           // true = check and return what WOULD be created; writes nothing
  confirm_name: string }           // must equal the campaign name (new_campaign) or the ad group name (new_ad) exactly, else 400
```

200 returns a `Launch`:

```ts
interface Launch {
  id: number | null                // null for validate_only (nothing stored)
  created_at: string
  mode: 'simulated'               // 'live' later
  status: 'validated' | 'created' | 'failed'
  suggestion_id: number
  campaign: { id: number; name: string } | null     // null for validate_only
  objects: { kind: 'budget' | 'campaign' | 'ad_group' | 'ad' | 'keyword' | 'negative'; name: string; detail: string | null }[]
  messages: string[]               // what the simulation checked, and anything that failed
}
```

Rules: a campaign is created **paused** with the proposal's daily budget; it is written as `data_source: 'demo'` rows (campaign, budget, ad groups, keywords, negatives, ads) and appears in the campaign list with `simulated: true`; the proposal moves to `applied` with `linked_campaign` set. Errors: 403 demo; 409 `{detail: "Creating campaigns is switched off in Settings"}` when `ads_write_enabled` is false; 409 when the suggestion is not `planned`; 400 bad body, wrong type, or `confirm_name` mismatch; 404 unknown suggestion. **Every call, including validate-only and failures, writes an audit row** (who, when, request, result).

`GET /launches?limit=` (1-100, default 20): the audit log, newest first, `Launch[]` (validate-only attempts included, with `id: null` replaced by the audit row's own id so they can be listed; add `validate_only: boolean` to the item).

**Nothing in 3.6 sends anything to Google Ads.** The simulated writer implements an interface (`AdsWriter`) whose real implementation, for the API's mutate calls with validate-only first, comes with phase 4 and Basic Access; the UI and the safeguards do not change when it does.

## B. Backend doc: new section 11.9

### 11.9 Ad suggestions and simulated launches (contract 3.6, added 2026-10-08)

Read scope doc section 3.6 first (the types, settings and endpoints are binding). Code decides, the model only polishes, Ciri grades, exactly as for keywords and campaigns.

**Dealer profile and claims** come from the new settings (3.6). Seed them with the defaults in the contract (`Pitstop Used Cars`, Tangerang, Gading Serpong, a placeholder WhatsApp number, an empty landing URL, all four claims allowed, the kill switch **off**, mode `simulated`). Validators as in the table; `ads_write_mode = 'live'` is a 400.

**When ads are suggested.** Inside the same Kai run (so the schedule, the run lock, the spend cap and the skip-when-nothing-new rule from 11.8 all apply), after the campaign proposals:
- `basis: 'new_campaign'`: for each open or planned `new_campaign` proposal, one ad per ad group (`target.kind = 'proposed_campaign'`).
- `basis: 'weak_ad'`: for an existing ad group that has stock behind it or winner keywords and whose live ad is `ad_strength` poor or average, propose a replacement (`replaces_ad` set).
- `basis: 'uncovered_winner'`: for an existing ad group with winner keywords whose key words appear in none of its headlines.
- At most 3 `new_ad` suggestions per run beyond the ones tied to campaign proposals; dedupe by fingerprint (target + hash of facts + winners), so an unchanged ad is not proposed again and a changed fact set supersedes the old suggestion.

**Facts (deterministic).** Per target make/model, from the vehicles the inventory source reports as available: `units`, `year_from` / `year_to`, `price_from_idr` / `price_to_idr`, `mileage_from_km`, plus the dealer profile fields and `claims_used` (only claims whose setting is `'true'`). **Winner keywords** are the model's keywords whose verdict (11.6) is `winner`, plus recently promoted winning search terms; they shape the wording and, where a proposal's keywords come from existing winners, `source: 'existing_keyword'` (the keywords in a new_campaign proposal should prefer proven winners of the same make/model over generated ones).

**Template copy (always produced first).** Headlines (at most 30 characters each, at least 3, up to about 10 are fine): `<Make> <Model> Bekas`, `<Model> <year_from>-<year_to>` (when the years differ), `Mulai Rp <n> Juta` (from `price_from_idr`, rounded down to whole juta), `Tersedia <units> Unit`, `Dijual di <area>` / `<Dealer>`, and, only when allowed, `Cicilan & DP Ringan` (installments), `Terima Tukar Tambah` (trade-in), `Bisa Test Drive` (test drive), the `ads_inspection_wording` text if it fits (inspection). The top winner keyword, title-cased, is used as a headline when it fits. Descriptions (at most 90 characters, at least 2, up to 4): a sentence naming the model, the year range and where, a sentence with the price and units, a sentence with the allowed claims and the WhatsApp number. `path1` / `path2` from make and model. Anything that would exceed a limit is shortened by dropping optional parts, never by cutting a word in half.

**Model polish (optional per ad group).** A single call rewrites the template copy into natural Indonesian within the same limits and the same facts. The validator then checks, in code, `AdCheckFlags`: lengths and counts; every number in the copy (digits and spelled-out years, prices, unit counts, phone) must appear in `facts` (after the rounding above); every claim word must be allowed (financing words such as cicilan / DP / kredit / leasing need installments; tukar tambah / trade-in needs trade_in; test drive needs test_drive; garansi / diperiksa / inspeksi needs inspection and the exact wording from settings); superlatives and unverifiable claims ("terbaik", "termurah", "no. 1", "dijamin") are banned; no all-caps words over 3 letters, no `!` in headlines, no repeated punctuation. If the polished copy fails any check, **fall back to the template copy for the whole ad** and set `polished: false`. Never store copy that fails `checks`. The prompt treats keyword and inventory text as untrusted data, like every other prompt.

**Ciri** grades the ad set against `facts` + winners, as for the other agents (graded against what the writer was given). A `new_ad` explanation, like `new_campaign`'s, is dropped if it quotes a number not in the payload or facts.

**Launches (`POST /launches`, `GET /launches`).** An `AdsWriter` interface with one implementation now, `SimulatedAdsWriter`, which writes demo-source rows into `campaigns`, `ad_groups`, `keywords`, `negative_keywords` and `ads` (the existing ad tables; add whatever columns the budget and `simulated` flag need, via the idempotent schema), always **paused**. Order: check kill switch, then demo-role refusal (the existing `demoReadOnly` already 403s every non-GET), then validate (planned status, type, `confirm_name`, every object passes the checks, the budget is within the floor/ceiling settings, no duplicate campaign name), then write in **one transaction**, then link the proposal (`linked_campaign`, status `applied`), then write the audit row. A failed write rolls back and still writes an audit row with `status: 'failed'`. New table `launches` (id, created_at, mode, status, validate_only, suggestion_id, campaign_id nullable, request JSONB, result JSONB). `GET /campaigns` adds `simulated`. A simulated campaign has **no performance rows** until the demo generator is told about it: say what you did (nothing is acceptable for now, but the UI must show "no data yet", not zeros).

**Not in this step:** any call to Google Ads, any "enable" action, the real writer. Safeguards from scope doc 3.1 that apply to a simulation are all implemented now: paused by default, validate-only, exact-name confirmation, audit log, kill switch, no demo access, budget bounds.

**Tests:** template copy limits for long make/model names (shortening, never a cut word); each claim gated by its setting; the number validator (a price not in the facts is rejected, rounding is allowed); the claim and superlative lexicon; polish-failure fallback; `basis` selection for the three cases; dedupe/supersede on changed facts; settings validators including `ads_write_mode = 'live'` rejected; `POST /launches` for every error code, the transaction rollback, the audit rows, validate-only writing nothing, `simulated: true` in `/campaigns`; the demo account 403; the winners preference in proposal keywords.

