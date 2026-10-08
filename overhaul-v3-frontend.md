# Overhaul v3: Keyword optimizer. FRONTEND

**Status:** planned, not started. Written 2026-10-06. Companion to `overhaul-v3.md` (scope and API contract).

---

## 0. How to use this file (read first)

You are implementing **only the frontend** of Overhaul v3. You need **two files**: this one and `overhaul-v3.md` (the scope doc). Read the scope doc first. Its sections 1-3 (goal, decisions, phasing) and 13 (the API contract) are binding and live only there. Section numbers are global across the files.

- **Do not touch `backend/`.** Another file covers it. The backend is built in parallel; you work against the **API contract (scope doc section 13, version 3.6)**. Use fixtures that match it exactly until the real endpoints exist. If the contract seems wrong or incomplete, **stop and report it**; do not invent fields.
- **Work one build step at a time** (section 17 below). After each step, report what changed and how you verified it, then wait.
- **Ferrari and Blueprint must look exactly as before.** Compare screenshots before and after.
- Run `npm run typecheck` and `npm run build` in `frontend/` before reporting a step done. There is no frontend test runner in this repo, so verify in the browser, in both languages (EN and ID), as the demo (read-only) account and as the owner.
- `null` in the contract means "no data", rendered as "no data yet", never as `0`. Empty lists, `run: null` and `inventory.source: 'unavailable'` are normal states with their own empty views.
- The demo account can only `GET`. Hide or disable every write action (`isDemo` from `shared/composables/auth`).
- Search-term text is untrusted: render it as text, never as HTML.
- Do not show, ask for or echo the inventory connection string anywhere.
- The open questions are in scope doc section 19. Do not guess them.

---
## Context for the frontend

Pitstop is a Google Ads AI performance dashboard (Vue 3 + Vite + Tailwind v4 + vue-i18n + Chart.js, deployed on Vercel). Overhaul v3 adds a **keyword optimizer**: a weekly backend job produces ranked, evidence-backed **suggestions** (negative keywords, promote a search term, pause, match-type change, new keywords, campaign ideas), each tied to the used-car dealer's inventory. **Everything is a suggestion; nothing changes the Ads account.** The frontend shows them, lets the owner mark each applied or dismissed, and exports negatives as a paste-ready list.

Principles that affect the UI:
- Numbers shown come from the structured fields (`evidence`, `payload`), never from the model's `explanation` text.
- "Not enough data" and "no data yet" are first-class states, not errors.
- Intent labels are a proxy and the demo data is generated; say so in the UI where it matters (`basis: 'prior'` is shown as "unverified").
- The advertiser is a used-car dealer in Indonesia; currency is IDR; the app is bilingual (EN / ID).

Frontend facts (verified 2026-10-06): feature folders under `frontend/src/features/`; routes in `frontend/src/app/router/index.ts`; nav in `frontend/src/app/navLinks.ts`; API client `frontend/src/shared/api/api.ts` and types `types.ts`; `KeywordTable.vue` and `SearchTermTable.vue` are in `features/dashboard/` and take their row types from `useCampaignDetail.ts` (`aggregateKeywords` sums per-day rows and takes the latest day for current-state fields). Demo users are blocked from `/settings`, `/aska`, `/time-machine` by `DEMO_HIDDEN` in the router. Themes are CSS variables in `style.css`; theme state is in `shared/composables/theme.ts`.

## 14. Pages and components

Follow the existing pattern: a `features/<name>/` folder with a `*Page.vue` and a `use*.ts` composable per data source; types in `shared/api/types.ts`; calls through `shared/api/api.ts`.

- **`features/keyword-optimizer/KeywordOptimizerPage.vue`** (route `/keyword-optimizer`, nav link in `app/navLinks.ts`). **Redesigned 2026-10-06 as a cork board** after the owner found the first version (a list of cards) hard to understand: "no visual language, no explanation". Decisions, all from the owner:
  - **Keywords are the notes.** Each keyword is a pinned sticky note on a cork board. Note size = how much money it spent (three sizes by spend tier). A sticker on the corner is its verdict (`winner`, `wasting`, `no_stock`, `testing`, `needs_data`; `steady` gets no sticker), from `GET /keywords/summary` (contract 3.1). The advice is a strip of tape on the note with one plain sentence ("Block 'lowongan'", "Pause", "Bid a bit higher"). Suggestions with no keyword (campaign ideas, campaign-wide negatives, brand-new keyword ideas) go on a loose "ideas" tray next to the board.
  - **Headline first, then three numbers.** A sentence answering "what do I do this week" ("9 things to do: 3 stop wasting money, 2 do more of what works, 4 need a look. Nothing changes in Google Ads until you do it."), then three big numbers: spend on keywords that are wasting money, spend on winners, and the to-do count. Wasted and winner money are sums over the verdicts; when the backend predates verdicts those two show "no data yet".
  - **A legend strip** above the board: what size, the sticker colors and the tape mean. This is the page's explanation; the plain sentence on each tape is the second one.
  - **Board size.** The biggest spenders plus anything with advice, about 24 notes, and a "Show all keywords" button for the rest. **One board** with filter chips (by campaign and by verdict), not a board per campaign.
  - **Acting on a note.** Click a note to open a detail panel: the keyword's numbers, then each suggestion with its evidence, basis, confidence, impact, inventory context and the **Applied / Dismiss / Reopen** buttons (owner only). Dragging a tape strip into the **Done** or **Not now** bin is a shortcut for the same thing; buttons always work and are the only way on touch and keyboard.
  - **A List view toggle** keeps the previous card list, for people who prefer rows and for screen readers.
  - Notes are physical objects, so their paper colors (white, yellow, cyan, light pink) and black ink are fixed, not theme tokens: a note must stay legible in Ferrari, Blueprint and Atom-Eve alike. The cork itself is one tan in every theme.
  - First-class states, unchanged: no run yet, empty list, below-threshold, no account data, backend without the optimizer, inventory unavailable.
- **Campaign proposals (contract 3.3, added 2026-10-06).** The AI also proposes whole new campaigns from the inventory (`new_campaign`). They need three pieces of UI:
  - **A proposal card/panel** (in the detail panel, opened from the ideas tray): the campaign name, why (the basis, in plain words: "3 cars in stock that nothing advertises", "aging stock", "your best keywords deserve their own budget", "a price-band theme"), the stock behind it (units, days listed, margin, snapshot date), a readable outline of the **ad groups and their keywords**, the **starter negatives**, the **suggested daily budget** and the target cost per enquiry with its assumptions shown (the lead-to-sale rate is a guess, so unverified proposals say so), and an **overlap warning** listing campaigns that already target some of it. Buttons: **Plan it** (open to planned), **Dismiss**, and **Download brief** (CSV / text). All numbers come from the payload.
  - **A "Planned" lane on the Campaigns page:** campaigns the owner approved but that do not exist in Google Ads yet, as cards visibly marked "Planned, not yet in Google Ads", with the brief one click away and an **I created it** action (planned to applied). When the server links it to a real campaign (`linked_campaign`), the planned card disappears and the real campaign's card is used.
  - **Honest wording.** Until the write path exists, nothing says "create in Google Ads" as if Pitstop did it: the primary action is **Plan it**, and the brief is something you take to Google Ads. The future "Create in Google Ads" button is specified in scope doc section 3.1 and is not built.
- **Proposal lanes and search (2026-10-07, after the owner could not tell which card was the proposed campaign).** Whole-campaign proposals are no longer small cards in the ideas tray. They have their own lanes, shared by the Keyword Optimizer page and the Campaigns page: **"New campaigns the AI proposes"** (open; yellow poster cards with a black PROPOSED stamp, the ad groups and keywords written out in a details element, Plan it / Dismiss / Details) and **"Planned campaigns"** (approved; white dashed cards with a PLANNED stamp). Posters use fixed paper and ink, like the board notes. The ideas tray now holds only the other keyword-less suggestions. **Search:** the keyword board (account-wide and on a campaign's page) and the inventory table each have a search box (every word must match, case-insensitive, plain text; a search shows all matches, ignoring the 24-note limit; a result count and a no-match message). **Campaign cards** now list their keywords by name (first six, the rest behind "Show all N keywords"; paused ones tagged).
- **Inventory page and filters (2026-10-07).** Inventory now has its own page, `/inventory` (nav link "Inventory", visible to the demo account too), and on the Keyword Optimizer page the same block can be **hidden** ("Hide inventory" / "Show inventory", remembered per browser, with a link to the full page). Both show totals, the aging bars, a **filter bar built like the board's** (a search box plus one chip group per column, each chip showing how many models it would leave: make, in stock / no stock / no stock but advertised, days listed, price band, margin band, advertised or not; "Clear filters"; "Showing N of M models") and a table where **every column sorts** (click again to flip; "no data" always sorts last; `aria-sort` on each header). The price bands are the engine's (under Rp 150 juta, 150-250, 250-400, over 400); the margin bands (under 10, 10-15, over 15 juta) are a UI-only grouping. **Limit:** the API sends one row per MODEL, so the page lists models, not individual cars; a per-car list needs a new backend endpoint and a contract change.
- **Schedule (contract 3.5).** Kai runs automatically at a time the owner sets (`keyword_optimizer_run_time`, default 06:00 WIB, every day) and the switch is `keyword_optimizer_enabled`, independent of the report switch. Settings gets a time field next to the toggle (same `HH:MM` check as the report times, hidden until the server sends the key); the Keyword Optimizer page says in one line when it runs ("Runs automatically every day at 06:00 WIB") or that automatic runs are off; the demo account sees that line but never the controls.
- **Ad suggestions and the simulated launch (contract 3.6, added 2026-10-08).** The AI suggests ads like it suggests keywords and campaigns ("I think this ad would work, and here is why"):
  - **Ad preview card** (`new_ad`): a Google-style preview of the ad (headlines joined as Google would show them, the description under it, the display path), a **"why" line** built from `facts` and `winner_keywords` ("3 Fortuner, 2021-2023, from Rp 385 juta; shaped by your winners 'fortuner vrz bekas'"), the three **check flags** as plain badges (fits Google's limits, numbers come from stock, claims are ones you allow), a marker when the copy is a plain template (`polished: false`), and, for a replacement, the old ad and its strength. Inline editing is limited to what the checks allow: live character counters, and the buttons stay disabled while a check would fail.
  - **Where they appear:** inside each proposed/planned campaign poster (one ad per ad group), on a campaign's own page near the Ads section for existing ad groups, and in the ideas tray otherwise. Actions follow campaigns: **Plan it / Dismiss**, then for an existing ad group **I created it** (by hand) or **Create (simulated)**.
  - **Review and create** (planned campaign or planned ad): a panel that lists the exact objects (budget, campaign **paused**, ad groups, ads, keywords, negatives), a **Validate** button (`validate_only`), a banner that says **SIMULATED: nothing is sent to Google Ads**, a box where the owner types the campaign (or ad group) name to confirm, and the **Create** button. If `ads_write_enabled` is off the button is disabled and says why, with a Settings link; the demo account sees the panel but no controls.
  - **After creating:** the campaign appears in the Campaigns list with a **SIMULATED** tag (and has "no data yet", never zeros); the planned card leaves its lane. A **Launches** section on the Campaigns page shows the audit log.
  - **Settings:** a **Dealer profile** block (name, city, area, WhatsApp, landing URL), the four **claims** the ads may make with the inspection wording, and the **creation switch** (off by default) plus the read-only mode line ("Simulated").
- **Export panel:** copy-to-clipboard and download for the negatives list and CSV.
- **`KeywordTable.vue`:** add intent mix (small stacked bar), per-action conversions / value, keyword rank-lost share, a stock badge. Per-day fields come from the extended `GET /keywords/performance`; window aggregates (intent mix, per-action conversions, stock, waste exposure) come from the new `GET /keywords/summary` (section 13), joined by `keyword_id`; show "no data yet" for NULL, never 0. Extend `KeywordRow` and `aggregateKeywords` in `useCampaignDetail.ts` (the QS handling there shows the pattern: current-state metrics take the latest day, not a sum).
- **`SearchTermTable.vue`:** intent label + confidence, tooltip with the rule id or "model".
- **`features/keyword-optimizer/InventoryPanel.vue`** (or a section on the page): stock by make/model, aging, margin, which keywords map to which stock, snapshot date. Read-only.
- **Settings page:** show the inventory source status (demo / connected / error, from `GET /inventory/summary`) and the optimizer toggle and its few numeric parameters, reusing the existing settings composable. **Never** render, edit or echo `INVENTORY_DB_STRING`.
- **Demo behaviour:** the demo account can view everything above but not change anything; `DEMO_HIDDEN` stays as is (the new page is read-only-safe, so it can be visible to demo).
- **Mobile:** the existing app already works at phone width; keep tables horizontally scrollable like the current ones.

## 15. New color theme: "Atom-Eve" (frontend)

A third theme named **Atom-Eve** (`data-theme='atom-eve'`) from the owner's palette, **not the default** (Ferrari stays the default). The direction changed three times on 2026-10-06, so it is written down to stop it being re-litigated: first light, then bolder and dark (Marathon's UI as the reference), then **this final one: bold pop-art**, modeled on a Dribbble pop-art storefront the owner chose. That reference is one huge flat saturated ground (yellow there), pure black type, thin black outlines, solid black primary buttons with white text, and white secondary buttons. The owner's instruction was "Pink would be the background, choose a bolder tone". A bold pink is a saturated colour rather than a white page, but it is a bright theme, so earlier "dark" and "light" constraints no longer apply and status text uses dark shades.

| Role | Value | Notes |
|---|---|---|
| Ground | `#ff6aa0` | a bolder pink than the palette's `#FF91AF`; black on it 7.8:1 |
| Cards (surface) | `#f4c2c2` | the palette's light pink; black on it 13.3:1 |
| Inputs, hover rows, chips (raised) | `#ffe556` | the palette's yellow; black on it 16.6:1 |
| Primary fill ("rosso") | `#000000` | solid black with white text (21:1), as the example's "Add to cart" |
| Table headers | `#00bcf0` | the palette's cyan with black text, 9.5:1 |
| Page titles | `#ffe556` block, 2px black outline | |
| Outlines | `#000000` | black, sharp corners |
| Stripe | cyan, yellow, black | 8px |

### 15.1 How the theme system works today (verified)
- Tokens are CSS variables in `frontend/src/style.css`: Tailwind v4 `@theme { ... }` holds the default (Ferrari) palette; `:root[data-theme='...'] { ... }` blocks override it. The attribute selector wins on specificity, so no `!important`.
- `frontend/src/shared/composables/theme.ts` derives the `ThemeName` type, the stored-value check and the TopBar switch from a `THEMES` list.
- Token names are Ferrari-era and reused by every theme: `rosso` primary fill, `giallo` secondary, `verde` third, `bianco` = **text on a primary fill** (white here, because the primary fill is black). They are not renamed.
- Two tokens carry "accent as text" and "link" separately: `--color-accent-ink` (`text-accent-ink`, `border-accent-ink`) and `--color-link` (`text-link`, `.agent-prose a`). They equal today's values in Ferrari and Blueprint. Here both are black (links are underlined).
- Status colors `--color-flag-*` are outside the brand switch because they encode meaning. Atom-Eve uses dark shades so they are readable on pink.
- Chart.js needs raw hex, so `frontend/src/shared/utils/chartTheme.ts` keeps a hand-synced `PALETTES: Record<ThemeName, Palette>`.

### 15.2 Token mapping (as implemented)

```css
:root[data-theme='atom-eve'] {
  --color-bg: #ff6aa0;
  --color-surface: #f4c2c2;
  --color-surface-raised: #ffe556;
  --color-border: #000000;
  --color-border-strong: #000000;

  --color-ink: #000000;
  --color-ink-soft: #2e0a18;
  --color-ink-faint: #4a0f26;

  /* "rosso" is the PRIMARY fill: solid black with white text, as in the example. */
  --color-rosso: #000000;
  --color-rosso-dark: #26262b;
  --color-rosso-soft: #00000014;
  --color-giallo: #ffe556;
  --color-giallo-soft: #ffe55680;
  --color-verde: #00bcf0;
  --color-verde-soft: #00bcf033;
  --color-bianco: #ffffff;
  --color-accent-ink: #000000;
  --color-link: #000000;
  --color-stripe-mid: #ffe556;
  --color-wave-cursor: #000000;
  --glow-1: #ffffff2e;
  --glow-2: #ffe55640;

  /* Hard-edged panels: sharp corners (pills stay round). */
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;

  --color-flag-good: #023a1c;
  --color-flag-good-soft: #023a1c26;
  --color-flag-caution: #4f2c00;
  --color-flag-caution-soft: #4f2c0026;
  --color-flag-critical: #6e000d;
  --color-flag-critical-soft: #6e000d26;
}
```

Theme-scoped rules (all under `data-theme='atom-eve'`, so other themes are untouched):

```css
/* Flat colour blocks with black type, as in the reference. Scoped to this theme. */
:root[data-theme='atom-eve'] main h1 {
  display: inline-block;
  background: var(--color-giallo);
  color: #000000;
  padding: 0.1em 0.45em;
  border: 2px solid #000000;
}
:root[data-theme='atom-eve'] thead {
  background: #00bcf0;
}
:root[data-theme='atom-eve'] thead th {
  color: #000000;
}
:root[data-theme='atom-eve'] .top-stripe {
  height: 8px;
}
```

Measured contrast (ground / card / yellow-raised): black 7.8 / 13.3 / 16.6; ink-soft `#2e0a18` 6.7 / 11.4 / 14.2; ink-faint `#4a0f26` 5.6 / 9.6 / 12.0; flag-good 4.6, flag-caution 4.6, flag-critical 4.7 on the ground (7.6 to 8.0 on cards). White on the black primary fill 21.0; white on its hover `#26262b` 15.1.

### 15.3 Risks specific to this palette
- **Active vs inactive is weaker.** The primary fill is black, so a selected pill is black with white text (clear), but an active nav link (`text-accent-ink`, black) next to inactive ones (`text-ink-soft`, a dark maroon) differs only slightly. If it is hard to see, add a scoped underline or weight rule for the active link rather than changing the colors.
- **The brand cyan and yellow are fills only.** On the light-pink cards they are 1.4:1 and 1.2:1, so they appear as table headers, title blocks, inputs and stripe, never as text or thin lines.
- **Charts.** The three series are black, a deep cyan (`#007fa8`, 2.9:1 on cards) and a deep pink (`#b0004f`, 4.5:1), not the bright brand fills. Confirm adjacent series stay distinguishable and that the impression-share stacked bar still uses the flag colors.
- **Yellow everywhere.** Inputs, hover rows and chips are yellow and so are page titles. Check pages with many inputs (Settings, Aska) for visual noise; if too loud, set `--color-surface-raised` to the light pink and keep yellow for titles only.
- **Color alone must not carry severity.** The flags are dark and similar to the black ink; status pills keep their text labels. Check with a color-blindness simulator on the Run Inspector and Learning pages.
- **Waveform / voice orb.** The waveform cursor uses `--color-wave-cursor` (black here); the orb uses `color-mix` on yellow and the black primary, so check it reads on the pink ground.
- **`::selection`** is black with white text: fine.
- **Existing screenshots** (case study, README) are Ferrari and are not affected.

### 15.4 Code changes (done in the frontend commits)
`style.css` (block, scoped rules, two new tokens), `theme.ts` (THEMES list), `chartTheme.ts` (palette), `TopBar.vue` (list-driven switch, `top-stripe` class), `useWaveform.ts` (cursor token), EN/ID labels, and the `text-rosso` / `border-rosso` / `text-giallo` class renames to `text-accent-ink` / `border-accent-ink` / `text-link`.

### 15.5 Verification
- Switch to Atom-Eve, reload (persistence), and click through every page: Dashboard, Campaigns, Reports, Learning, Run Inspector, System Health, Settings, Aska, How It Works, Engineering Notes, and the Keyword Optimizer page.
- Confirm Ferrari and Blueprint look **identical to before** (compare screenshots).
- Check text on every fill (login button, active pills, locale and theme switches, selection, table headers, page titles), every link, and the active nav link (15.3).
- Check both languages, the charts, and the waveform.

## 16. i18n and docs

- Add keys to both `frontend/src/i18n/en.ts` and `id.ts` for every new string (nav label, page, tabs, badges, empty states, tooltips, intent labels, suggestion type names). Keep EN/ID in parity; there is no check that enforces it, so review both files in the same change.
- Add a section to the **Engineering Notes** page (`sections.ts`): the deterministic-engine-plus-LLM split, the significance rule, decoys and the scoring harness.
- Update the **How It Works** page if it lists agents or the pipeline.
- When it ships: update `README.md` and `docs/case-study.md` (the "What I'd do next" section lists keyword work only implicitly today).

---

## 17. Build order (frontend)

Each step is independently shippable. **Stop after each step, report, and wait.**

1. **Theme first (section 15).** It needs no backend and only touches `style.css`, `theme.ts`, `chartTheme.ts`, `TopBar.vue` and i18n. Verify Ferrari and Blueprint are unchanged.
2. **Types and API client** for scope doc section 13 in `shared/api/types.ts` and `shared/api/api.ts`, plus fixtures matching the contract exactly, so pages can be built before the backend exists.
3. **Keyword Optimizer page, export, inventory panel** (section 14), built against the fixtures, then switched to the real endpoints once the backend's API step (backend step 8) lands.
4. **Extend `KeywordTable.vue` / `SearchTermTable.vue`** with the new fields; `null` renders "no data yet", never `0`.
5. **Settings fields, i18n (EN and ID), Engineering Notes and How It Works updates, API Reference page** (section 16).

## 18. Risks (frontend)

| Risk | Mitigation |
|---|---|
| The new theme changes how Ferrari or Blueprint look | The two new tokens default to today's values; compare before/after screenshots of both themes (section 15.7) |
| Page is built before the backend exists | Build against fixtures that match section 13 exactly; handle `run: null`, empty `items`, `inventory.source: 'unavailable'` and `null` fields as normal states |
| Contract changes under the frontend | Section 13 version number is the check; if it changed, re-read it before the next step |

Open questions that affect this file: scope doc section 19, items 4, 8.
