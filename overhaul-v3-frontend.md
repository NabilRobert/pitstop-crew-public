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

A third theme named **Atom-Eve** (`data-theme='atom-eve'`), built from the owner's palette. Decided 2026-10-06: it is a **light** theme, and it is **not the default** (Ferrari stays the default).

| Color | Hex | Role |
|---|---|---|
| Cyan | `#00BCF0` | primary accent, used as a **fill** |
| Yellow | `#FFE556` | secondary accent, used as a **fill / highlight** |
| Pink | `#FF91AF` | third accent, used as a **fill** |
| Light pink | `#F4C2C2` | borders, tints, selected rows, page tint |
| Black | `#000000` | text and the darkest ink (as `#140f11`, a warm near-black) |

### 15.1 The core problem: these colors are too light to be text on a light page

Measured contrast against white (WCAG: 4.5 for body text, 3 for UI components):

| Color | on white |
|---|---|
| Cyan `#00BCF0` | 2.22 |
| Pink `#FF91AF` | 2.12 |
| Yellow `#FFE556` | 1.27 |
| Light pink `#F4C2C2` | 1.57 |

So on a light ground the palette works as **fills with dark text on them** (ink on cyan 8.54, on yellow 15.00, on pink 8.97, on light pink 12.06), but **not as text or thin lines**. The theme therefore uses the brand colors for fills, and adds two darker "ink" companions for the places where an accent is used as text. They are derived from the palette, not new brand colors.

### 15.2 How the theme system works today (verified)
- Tokens are CSS variables in `frontend/src/style.css`: Tailwind v4 `@theme { ... }` holds the default (Ferrari) palette; `:root[data-theme='blueprint'] { ... }` overrides it. The attribute selector wins on specificity, so no `!important`.
- `frontend/src/shared/composables/theme.ts`: `type ThemeName = 'ferrari' | 'blueprint'`, persisted in `localStorage` key `pitstop-theme`, applied as `document.documentElement.dataset.theme`.
- Token names are Ferrari-era and reused by Blueprint: `rosso` primary accent, `giallo` secondary, `verde` third, `bianco` = **text on an accent background**. **Do not rename them in v3**: it would touch most components for no visible gain.
- Measured usage of the accent tokens in `.vue`/`.ts`: `bg-rosso` 24, `text-rosso` 11, `border-rosso` 15, `text-giallo` 4 (all four are router links), `bg-rosso-dark` 1. `verde` has **no** Tailwind class usage, so it only appears in charts. `giallo`, `rosso` are also read via `color-mix(...)` in `VoiceOrb.vue` and `AskaPage.vue`, and via `getPropertyValue` in `useWaveform.ts`. `.agent-prose a` in `style.css` uses `--color-giallo` for links.
- Status colors `--color-flag-good|caution|critical` are deliberately not part of the brand switch. Blueprint overrides only their shades so they stay readable on a light background; Atom-Eve does the same.
- Chart.js needs raw hex, so `frontend/src/shared/utils/chartTheme.ts` keeps a hand-synced `PALETTES: Record<ThemeName, Palette>`.

### 15.3 Two new tokens, so other themes don't change
Add to the base `@theme` block, with values that equal today's usage so Ferrari and Blueprint render **exactly as before**:

- `--color-accent-ink` (default = `var(--color-rosso)`): for accent used **as text**. Replace the 11 `text-rosso` usages with `text-accent-ink`.
- `--color-link` (default = `var(--color-giallo)`): for link text. Replace the 4 `text-giallo` router links and the `.agent-prose a` rule with it.

Without these, light mode would render cyan text at 2.22:1 and yellow links at 1.27:1.

### 15.4 Token mapping (proposed; every ratio measured)

```css
:root[data-theme='atom-eve'] {
  --color-bg: #f7d0d0;
  --color-surface: #ffffff;
  --color-surface-raised: #cdeffc;
  --color-border: #000000;
  --color-border-strong: #000000;

  --color-ink: #000000;
  --color-ink-soft: #3d2f34;
  --color-ink-faint: #5a4a50;

  --color-rosso: #00bcf0;
  --color-rosso-dark: #00a8dc;
  --color-rosso-soft: #00bcf033;
  --color-giallo: #ffe556;
  --color-giallo-soft: #ffe55680;
  --color-verde: #ff91af;
  --color-verde-soft: #ff91af59;
  --color-bianco: #000000;
  --color-accent-ink: #005b75;
  --color-link: #005b75;
  --color-stripe-mid: #ffe556;
  --glow-1: #00bcf040;
  --glow-2: #ffe55659;

  /* Hard-edged, Marathon-style panels: sharp corners (pills stay round). */
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;

  --color-flag-good: #046a37;
  --color-flag-good-soft: #046a3726;
  --color-flag-caution: #7f5000;
  --color-flag-caution-soft: #7f500026;
  --color-flag-critical: #b01719;
  --color-flag-critical-soft: #b0171926;
}

/* Atom-Eve's flat neon blocks: black text on solid brand fills (ink on yellow
   is 16.6:1, on cyan 9.5:1, on pink 9.9:1). Scoped to this theme only. */
:root[data-theme='atom-eve'] main h1 {
  display: inline-block;
  background: var(--color-giallo);
  color: var(--color-ink);
  padding: 0.1em 0.45em;
  border: 1px solid var(--color-border);
}
:root[data-theme='atom-eve'] thead {
  background: var(--color-giallo);
}
:root[data-theme='atom-eve'] thead th {
  color: var(--color-ink);
}
:root[data-theme='atom-eve'] .top-stripe {
  height: 8px;
}
```

**Bold pass (2026-10-06), after the owner pointed at Marathon's UI as the reference:** flat neon blocks with black text, hard edges and heavy black outlines, kept light (not dark). Concretely: a saturated pink ground (`#f7d0d0`), white cards with **black 1px borders**, **sharp corners** (radius tokens set to 0; pills stay round), **yellow page-title blocks and yellow table headers** with black text, an 8px top color stripe, cyan-tinted raised surfaces (`#cdeffc`), pure-black ink, stronger accent washes and glows, and a darker `accent-ink`/`link` (`#005b75`) and flag set. Contrast was re-measured against the pink ground, the hardest background: ink 14.9, ink-soft 9.0, ink-faint 5.9, accent-ink 5.4, flags 4.8 to 5.0; black on the brand fills is 9.5 (cyan), 16.6 (yellow) and 9.9 (pink). The extra rules (`main h1`, `thead`, `.top-stripe`) are scoped to `data-theme='atom-eve'`, so the other themes are untouched. Left alone on purpose: drop shadows (Marathon's panels are flat) and a black top bar (its children use dark-on-light text tokens and would all need inverting).

Notes:
- **`--color-bianco` is black here**, because it is the text color on every `bg-rosso` button and active pill, and on `::selection`. White on cyan fails.
- A **pink-ink** for text is not needed yet, because pink has no text usage (`verde` is chart-only). If a component needs pink as text, use `#c2275c` (5.62 on white).
- Borders are now black, so dividers are strong by design. Table row separators use `border-border/60`, which stays lighter.

### 15.5 Risks specific to this palette
- **`border-rosso` (15 usages).** Cyan on white is 2.22:1, below the 3:1 expected of a UI component. Where the border is the *only* sign of a selected or active state, switch that usage to `border-accent-ink` or add a fill change. Review each of the 15 rather than changing them blindly.
- **Yellow = "caution".** Brand yellow `#FFE556` and the status caution amber are different in light mode (`#9a6300` text), but a yellow fill next to a caution pill can still read as a warning. Keep yellow for highlights and decoration only, never for status.
- **Pink vs critical red.** Pink fills sit next to red status text. Never rely on color alone for severity: grade badges, run status and flag pills keep their text labels. Check with a color-blindness simulator on the Run Inspector and Learning pages.
- **Charts on a white canvas.** Cyan, yellow and pink lines on white are 2.22, 1.27 and 2.12:1. Bars and areas with a visible fill are fine; **lines need a darker stroke** (use the ink companions: cyan `#00718f`, a darker pink such as `#c2275c`, and for yellow either avoid lines or give it a dark outline). Grid color should be dark-on-light (`rgba(0,0,0,0.08)`, as Blueprint does). The impression-share stacked bar must keep using the **flag** colors (`flagGood/Caution/Critical`), as `chartTheme.ts` already intends. The tooltip stays dark in every theme (existing comment), so its white title color is still right.
- **Yellow fill with white text anywhere** would fail; the only valid text on a yellow fill is the dark ink. Grep for any component that hard-codes white text on `bg-giallo` (none was found in the usage count above, since `bg-giallo` has zero uses).
- **Waveform / voice orb.** `useWaveform.ts` reads `--color-giallo` / `--color-rosso` / `--color-bianco` at runtime with Ferrari hex fallbacks; with `bianco` dark the cursor line will be dark on a light waveform, which is correct for a light page. `VoiceOrb.vue` uses `color-mix` on the accents; check that its glow reads on a white background.
- **Selection color.** `::selection` is `rosso` background with `bianco` text, which becomes cyan with dark text: fine.
- **Existing screenshots** (case study, README) are Ferrari. Not affected unless the owner wants Atom-Eve shown.

### 15.6 Code changes required
1. `frontend/src/style.css`: add `--color-accent-ink` and `--color-link` to the base `@theme` (with the Ferrari-equal defaults above), add the `:root[data-theme='atom-eve']` block, and change `.agent-prose a` to `var(--color-link)`.
2. Replace the 11 `text-rosso` usages with `text-accent-ink` and the 4 `text-giallo` router links with `text-link` (Tailwind v4 generates `text-link` from `--color-link`). Review the 15 `border-rosso` usages as described.
3. `frontend/src/shared/composables/theme.ts`: extend `ThemeName` to include `'atom-eve'`. **The current load check is `stored === 'blueprint' ? 'blueprint' : 'ferrari'`; with a third theme it would silently reset a saved Atom-Eve to Ferrari on every reload.** Replace it with a membership check against a `THEMES` list. The default stays `'ferrari'`.
4. `frontend/src/shared/utils/chartTheme.ts`: add an `'atom-eve'` entry (TypeScript will require it because `PALETTES` is a `Record<ThemeName, Palette>`): `rosso '#00bcf0'`, `giallo '#ffe556'`, `verde '#ff91af'`, `inkFaint '#6d6065'`, `gridColor 'rgba(0, 0, 0, 0.08)'`, flag colors equal to Blueprint's. Add line-stroke variants for the three series as noted in 15.5, and update the file's "keep in sync" comment to list `style.css`'s new tokens.
5. `frontend/src/app/TopBar.vue`: the theme switch is a **hard-coded two-button** segmented control (`ferrari` / `blueprint`, each with `bg-rosso text-bianco` when active). Make it a third button or a small menu driven by the `THEMES` list. Check the width in both languages.
6. `frontend/src/i18n/en.ts` and `id.ts`: add the long and short labels next to `themeFerrari` / `themeBlueprint` (for example `themeAtomEve`, `themeAtomEveShort: 'AE'`).

### 15.7 Verification
- Switch to Atom-Eve, reload (persistence), then click through every page: Dashboard, Campaigns, Reports, Learning, Run Inspector, System Health, Settings, Aska, How It Works, Engineering Notes, and the new Keyword Optimizer page.
- Confirm Ferrari and Blueprint look **identical to before** (the two new tokens default to today's values). Compare screenshots.
- Check every text-on-accent spot (login button, active pills, locale and theme switches, selection) and every link.
- Check both languages.
- Run a contrast check on the rendered pages (not just the token table), because `color-mix` and opacity utilities change effective colors.

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
