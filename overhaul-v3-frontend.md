# Overhaul v3: Keyword optimizer. FRONTEND

**Status:** planned, not started. Written 2026-10-06. Companion to `overhaul-v3.md` (scope and API contract).

---

## 0. How to use this file (read first)

You are implementing **only the frontend** of Overhaul v3. You need **two files**: this one and `overhaul-v3.md` (the scope doc). Read the scope doc first. Its sections 1-3 (goal, decisions, phasing) and 13 (the API contract) are binding and live only there. Section numbers are global across the files.

- **Do not touch `backend/`.** Another file covers it. The backend is built in parallel; you work against the **API contract (scope doc section 13, version 3.0)**. Use fixtures that match it exactly until the real endpoints exist. If the contract seems wrong or incomplete, **stop and report it**; do not invent fields.
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

- **`features/keyword-optimizer/KeywordOptimizerPage.vue`** (new route `/keyword-optimizer`, registered in `app/router/index.ts`, nav link in `app/navLinks.ts`):
  - header: last run time, snapshot date of the inventory used, data source badge (demo / connected), coverage %;
  - tabs or groups by type: Negatives, Promote, Pause, Match type, New keywords, Campaign ideas;
  - each suggestion card: what to do, the evidence numbers (from the API, not the model), `basis` badge (`evidence` / `prior – unverified`), confidence, expected impact, inventory context (stock, days listed, margin), the LLM explanation, and a link into the keyword/campaign;
  - actions **Applied** / **Dismiss** (owner only; hidden/disabled when `isDemo` from `shared/composables/auth`);
  - first-class empty states: "not enough data yet", "nothing to suggest", "inventory unavailable";
  - the open/applied/dismissed counts feeding the future outcome-tracking feature (backlog item 3).
- **Export panel:** copy-to-clipboard and download for the negatives list and CSV.
- **`KeywordTable.vue`:** add intent mix (small stacked bar), per-action conversions / value, keyword rank-lost share, a stock badge. Per-day fields come from the extended `GET /keywords/performance`; window aggregates (intent mix, per-action conversions, stock, waste exposure) come from the new `GET /keywords/summary` (section 13), joined by `keyword_id`; show "no data yet" for NULL, never 0. Extend `KeywordRow` and `aggregateKeywords` in `useCampaignDetail.ts` (the QS handling there shows the pattern: current-state metrics take the latest day, not a sum).
- **`SearchTermTable.vue`:** intent label + confidence, tooltip with the rule id or "model".
- **`features/keyword-optimizer/InventoryPanel.vue`** (or a section on the page): stock by make/model, aging, margin, which keywords map to which stock, snapshot date. Read-only.
- **Settings page:** show the inventory source status (demo / connected / error, from `GET /inventory/summary`) and the optimizer toggle and its few numeric parameters, reusing the existing settings composable. **Never** render, edit or echo `INVENTORY_DB_STRING`.
- **Demo behaviour:** the demo account can view everything above but not change anything; `DEMO_HIDDEN` stays as is (the new page is read-only-safe, so it can be visible to demo).
- **Mobile:** the existing app already works at phone width; keep tables horizontally scrollable like the current ones.

## 15. New color theme: "Atom-Eve" (frontend)

A third theme named **Atom-Eve** (`data-theme='atom-eve'`) from the owner's palette. Decided 2026-10-06: **dark**, **bold**, and **not the default** (Ferrari stays the default). History, so nobody re-litigates it: the owner first asked for a light theme, then asked for bolder and more prominent colors modeled on Marathon's UI (a black ground with flat neon blocks, black text on them, hard edges), then changed their mind and asked for dark. Dark is final.

| Color | Hex | Contrast on black | Role |
|---|---|---|---|
| Cyan | `#00BCF0` | 9.45 | primary accent: fills, active states, accent text, table headers |
| Yellow | `#FFE556` | 16.59 | secondary accent: page-title blocks, links |
| Pink | `#FF91AF` | 9.92 | third accent: chart series, strong borders, glow |
| Light pink | `#F4C2C2` | 13.34 | soft ink and the default outline color |
| Black | `#000000` | n/a | the ground, and the text color ON a neon fill |

On black, every brand color clears 4.5:1 as text, so (unlike a light theme) they can be used as text, borders, fills and glows at the same time. Black text on the neon fills measures 9.45 (cyan), 16.59 (yellow) and 9.92 (pink).

### 15.1 How the theme system works today (verified)
- Tokens are CSS variables in `frontend/src/style.css`: Tailwind v4 `@theme { ... }` holds the default (Ferrari) palette; `:root[data-theme='...'] { ... }` blocks override it. The attribute selector wins on specificity, so no `!important`.
- `frontend/src/shared/composables/theme.ts` derives the `ThemeName` type, the stored-value check and the TopBar switch from a `THEMES` list.
- Token names are Ferrari-era and reused by every theme: `rosso` primary accent, `giallo` secondary, `verde` third, `bianco` = **text on an accent fill** (black in this theme). They are not renamed.
- Two tokens carry "accent as text" and "link" separately, because on a light theme the brand fill is not legible as text: `--color-accent-ink` (`text-accent-ink`, `border-accent-ink`) and `--color-link` (`text-link`, `.agent-prose a`). They equal today's values in Ferrari and Blueprint. In Atom-Eve they simply equal cyan and yellow, so they cost nothing here and keep the other themes safe.
- Status colors `--color-flag-*` are deliberately outside the brand switch: they encode meaning. Atom-Eve shifts their shades (brighter green, orange, red) so they stay distinct from the brand cyan/yellow/pink.
- Chart.js needs raw hex, so `frontend/src/shared/utils/chartTheme.ts` keeps a hand-synced `PALETTES: Record<ThemeName, Palette>`.

### 15.2 Token mapping (as implemented; every ratio measured against the surface it sits on)

```css
:root[data-theme='atom-eve'] {
  --color-bg: #000000;
  --color-surface: #0b0b0d;
  --color-surface-raised: #16161a;
  --color-border: #f4c2c2;
  --color-border-strong: #ff91af;

  --color-ink: #ffffff;
  --color-ink-soft: #f4c2c2;
  --color-ink-faint: #a88e94;

  --color-rosso: #00bcf0;
  --color-rosso-dark: #33cdf5;
  --color-rosso-soft: #00bcf033;
  --color-giallo: #ffe556;
  --color-giallo-soft: #ffe55640;
  --color-verde: #ff91af;
  --color-verde-soft: #ff91af40;
  --color-bianco: #000000;
  --color-accent-ink: #00bcf0;
  --color-link: #ffe556;
  --color-stripe-mid: #ffe556;
  --color-wave-cursor: #ffffff;
  --glow-1: #00bcf040;
  --glow-2: #ff91af33;

  /* Hard-edged, Marathon-style panels: sharp corners (pills stay round). */
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;

  --color-flag-good: #2ee07f;
  --color-flag-good-soft: #2ee07f26;
  --color-flag-caution: #ff9f1a;
  --color-flag-caution-soft: #ff9f1a26;
  --color-flag-critical: #ff3b3b;
  --color-flag-critical-soft: #ff3b3b26;
}
```

Theme-scoped rules that make the neon blocks (all under `data-theme='atom-eve'`, so the other themes are untouched):

```css
/* Flat neon blocks: black text on solid brand fills (black on cyan is 9.5:1,
   on yellow 16.6:1, on pink 9.9:1). Scoped to this theme only. */
:root[data-theme='atom-eve'] main h1 {
  display: inline-block;
  background: var(--color-giallo);
  color: #000000;
  padding: 0.1em 0.45em;
}
:root[data-theme='atom-eve'] thead {
  background: var(--color-rosso);
}
:root[data-theme='atom-eve'] thead th {
  color: #000000;
}
:root[data-theme='atom-eve'] .top-stripe {
  height: 8px;
}
```

Measured contrast: ink 21.0 / 19.7 / 18.0 and ink-soft 13.3 / 12.5 / 11.5 and ink-faint 7.0 / 6.5 / 6.0 on bg / surface / raised; flag-good 12.1, flag-caution 11.5, flag-critical 6.5 on bg (5.5 on raised).

### 15.3 Risks specific to this palette
- **Brand colors vs status colors.** Cyan/yellow/pink are bright and so are the flags. Critical red vs pink is only 1.5:1 apart, caution orange vs yellow 1.5:1, good green vs cyan 1.3:1. Color alone must never carry severity: grade badges, run status and flag pills keep their text labels. Check with a color-blindness simulator on the Run Inspector and Learning pages.
- **Yellow links vs yellow title blocks.** Both are brand yellow. Links are text on dark, titles are black text on a yellow fill, so they read differently, but check pages where they sit together.
- **Loud on purpose, but check density.** Light-pink outlines on every card and cyan table headers are heavy. If a data-dense page (Run Inspector, Reports list) feels noisy, tone the border down for that theme (for example `#f4c2c2` at 50%) rather than changing the palette.
- **Charts.** Bars and lines both read well on black. Confirm adjacent series stay distinguishable, and that the impression-share stacked bar still uses the **flag** colors, as `chartTheme.ts` already intends. The tooltip stays dark in every theme.
- **Waveform / voice orb.** They read `--color-giallo` / `--color-rosso` / `--color-bianco` at runtime. `bianco` is black here, so the waveform cursor has its own token, `--color-wave-cursor` (white), defined only in this theme; every other theme still falls through to `bianco`.
- **`::selection`** is cyan with black text: fine.
- **Existing screenshots** (case study, README) are Ferrari and are not affected.

### 15.4 Code changes (done in the frontend commits)
`style.css` (block, scoped rules, two new tokens), `theme.ts` (THEMES list), `chartTheme.ts` (palette), `TopBar.vue` (list-driven switch, `top-stripe` class), EN/ID labels, and the `text-rosso` / `border-rosso` / `text-giallo` class renames to `text-accent-ink` / `border-accent-ink` / `text-link`.

### 15.5 Verification
- Switch to Atom-Eve, reload (persistence), and click through every page: Dashboard, Campaigns, Reports, Learning, Run Inspector, System Health, Settings, Aska, How It Works, Engineering Notes, and the Keyword Optimizer page.
- Confirm Ferrari and Blueprint look **identical to before** (compare screenshots).
- Check text on every neon fill (login button, active pills, locale and theme switches, selection, table headers, page titles) and every link.
- Check both languages, and the waveform cursor (15.3).

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
