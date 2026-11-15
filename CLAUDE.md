# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A running-log PWA for general runners ("RUNN · Nhật ký chạy"; each user's data lives only in their own browser, no accounts) in vanilla HTML/CSS/JS — **no framework, no bundler, no build step** — plus a handful of Vercel serverless functions for push reminders. UI language and code comments are Vietnamese; keep both that way.

## Commands

```bash
npx serve                 # or: python -m http.server
```

Open `http://localhost:<port>/index.html`. There is no build, no test suite and no linter — verification is manual in the browser.

`api/` only runs on Vercel (`npm install` only matters for those functions). Locally the app detects no server and falls back to local reminders; everything else works.

Deploy = `git push` to `main` (Vercel Git integration). Env-var changes need a **Redeploy** — Vercel only loads them at deployment creation.

```bash
curl -X POST https://<project>.vercel.app/api/test-push -H "Authorization: Bearer <CRON_SECRET>"
curl https://<project>.vercel.app/api/cron -H "Authorization: Bearer <CRON_SECRET>"
npx web-push generate-vapid-keys
```

## Module system

Every file in `js/` is an IIFE assigned to a global, taking its dependencies as arguments:

```js
window.Blocks = (function (Core, Templates) { 'use strict'; … })(window.Core, window.Templates);
```

Each HTML page lists only the modules it needs, in dependency order, via `<script src>`. **Order in the HTML is the dependency graph** — `core.js` and `nav.js` first, then data modules, then the page controller last.

Two kinds of module:

- **Library modules** (`core`, `templates`, `blocks`, `races`, `race-form`, `runlog`, `goals`, `shoes`, `predict`, `adapt`, `load`, `weather`, `charts`, `vision`, `backup`, `notify`, `migrate`, `nav`) export an object and have no side effects beyond that.
- `js/templates.js` also holds the goal-based plan **generator** (`Templates.generate`): it emits the same shape as the level templates (`days` with `role`, `weeks` with `e/l/q`), saved under `app-templates` with `gen: true`, so Blocks/Adapt/plan page need no special casing. `RaceForm.save` with `templateId === RaceForm.GEN` is the only entry point; it drops orphaned generated templates.
- Push payload (`api/subscribe.js` → Redis → `api/cron.js`) may carry `wx: {lat, lon, hour}` (rounded, opt-in via `Weather.setPush`) and per-day `type`/`pace`; `lib/heat.js` duplicates the heat table of `js/weather.js` for Node — change both together.
- `sw.js` handles `POST ./share` (Web Share Target) by stashing files in cache `bn27-share` and redirecting to `log.html?share=1`; `log-page.js` also drains an offline queue (`app-pending`) for Gemini reads / weather on `online`.
- **Page controllers** (`dashboard.js` for index, and `*-page.js`) export nothing, end in a self-calling `boot()`, and own all DOM for their page. Each `boot()` calls `C.registerSW()` and `C.lockOrientation()`.

Races are created on the home page but edited / deleted on their own `race.html`; both go through `js/race-form.js` (`RaceForm.save` / `remove`), which also owns attaching, swapping or dropping a race's block — don't reimplement that per page.

Page → controller map: `index.html`→`dashboard.js`, `plan.html`→`plan-page.js`, `log.html`→`log-page.js`, `stats.html`→`stats-page.js`, `settings.html`→`settings-page.js`, `race.html`→`race-page.js`.

### Adding or renaming a JS file requires three edits

1. `<script src>` in every HTML page that needs it, in the right position.
2. The `CORE` array in `sw.js` (precache list).
3. **Bump `CACHE` in `sw.js`** (`bn27-cache-vNN`). The service worker is stale-while-revalidate for html/css/js/json, so without a version bump returning users keep the old shell. Bump it for any meaningful change, not just new files.

Missing step 2 or 3 is the usual cause of "my change didn't show up".

## Data model

| Concept | Meaning | Storage |
| --- | --- | --- |
| Template | Shape of a training cycle (weeks, phases, easy/quality/long volume) — **no dates** | `localStorage['app-templates']` |
| Block | One application of a template to a race: start date, 3/4-session mode, custom day offsets, done ticks, notes, edits | `localStorage['app-blocks']` |
| Race | A milestone: name, date, distance, targets, pace zones; optionally linked to one block | `localStorage['app-races']` |
| Run | One run/walk, optionally with photo blob, optionally linked to a session | IndexedDB `bn-runs` |
| Goal | Personal target (km/week, sessions/week, km/month, time goal) | `localStorage['app-goals']` |
| Shoes | Pairs + retire threshold | `localStorage['app-shoes']`, `app-shoe-def` |

Other keys: `app-theme`, `app-gemini-key`, `app-gemini-model`, `app-ai-report`, `app-adapt-auto`, `app-stats-vol`, `app-migrated-v2`. `bn27-*` keys are the **legacy** schema — read-only, consumed once by `js/migrate.js` and deliberately never deleted.

Rules that matter when touching this:

- **Templates are immutable from the UI.** Per-block changes go in `block.edits[sid]` (overrides `type`/`title`/`d`/`km`), `block.removed[sid]`, and `block.adj[sid]` (why an auto-adjustment happened). `Blocks.sessionsOf()` is what merges template + edits + removals; always read sessions through it rather than reconstructing them.
- **Session identity** is `Blocks.sessionId(wi, k)` → `'w' + wi + k` (week index + day key). It is the key for `done`, `notes`, `edits`, `removed`, `adj` and for linking a run to a session. Changing a template's day keys orphans saved data — the level-based templates use different keys from the legacy `periodized-12w` (`mon`/`wed`/`fri`/`sun`) precisely for that reason.
- **Derived values are never stored**: PRs, streak, shoe mileage, weekly km series and race predictions are all recomputed from `bn-runs` on each render (`RunLog.computePRs`, `computeStreak`, `Shoes.usage`, `Predict.compute`). So editing or deleting a run self-corrects everything. Don't add caches for these.
- `migrate.js` runs once, guarded by `app-migrated-v2`, and only from pages that load it (`index.html`, `stats.html`). Opening `race.html` alone will not migrate legacy data.
- `Core.store` swallows all localStorage errors and returns fallbacks — never assume a write succeeded.

## Conventions

- **ES5 only**: `var`, `function`, no arrow functions / `let` / template literals / classes in `js/` and in the HTML inline scripts. (`api/` and `lib/` are Node and do use `const`/arrow/async.)
- DOM is built by string concatenation into `innerHTML`. **Every interpolated value goes through `Core.esc()`**; `Charts` tooltips use `textContent` for the same reason.
- `style.css` is one ~66 KB file, section-commented (`/* ===== Lịch tập: lịch tháng ===== */`). All colors are CSS custom properties on `:root`, overridden for dark mode under both `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`. Each page has a tiny inline script before the stylesheet that applies `app-theme` to avoid a flash.
- Charts are hand-rolled HTML/SVG in `js/charts.js` (columns, heatmap, hbars, spark, table, paceLine) — no chart library. They share one tooltip driven by `data-tip-h` / `data-tip` attributes.
- Portrait-only: `manifest.json` orientation, `Core.lockOrientation()` (fails silently outside installed PWAs — expected), plus a `.orient-lock` CSS overlay as the real backstop.
- Text selection/copy is deliberately blocked app-wide in `core.js`, with inputs/textareas exempted.
- Bottom nav is rendered by `js/nav.js` from one `ITEMS` array; pages only need an empty `<nav id="navbar">`. `race.html` counts as the "home" branch.

## Serverless side (`api/`, `lib/`)

- `vapid.js` (public key), `subscribe.js` (save/delete subscription + today's sessions), `cron.js` (daily push, guarded by `Bearer CRON_SECRET`), `test-push.js`, `health.js` (config check — reports env-var **names** only, never values).
- `lib/store.js` wraps Upstash Redis over REST and **sniffs env-var names** (`KV_REST_API_*`, `UPSTASH_REDIS_REST_*`, prefixed variants, excluding `READ_ONLY` tokens) because Vercel names them differently depending on how the store was connected. Max 50 subscriptions.
- Cron is `30 23 * * *` UTC = 06:30 Vietnam. Vercel Hobby allows **one cron run per day**, so `cron.js` deliberately ignores the user's chosen hour — gating on it would mean never sending. Changing push time means editing `vercel.json`.
- `sw.js` must never cache `/api/` — it bypasses cache explicitly, and regressing that previously made `/api/health` report stale failures.
- Photos never leave the device. Only session dates/titles/done flags, timezone and the push endpoint go to Redis. The Gemini key lives in `localStorage`, is sent straight to Google, and is intentionally excluded from backup JSON.

## Gemini usage (`js/vision.js`)

Called directly from the browser to `generativelanguage.googleapis.com` (no proxy), default model `gemini-3.5-flash-lite`, `temperature: 0` with a forced 3-field JSON schema; images are downscaled to ~960px before upload. Used for Strava-screenshot OCR and for the AI report on the stats page. **The report prompt is fed numbers the app already computed** (`Predict`) so the model only narrates — keep it that way rather than letting it do arithmetic.

## README drift

`README.md` is long and mostly accurate on behavior, but has fallen behind in places: it describes a two-page app (there are now six HTML pages plus a bottom nav), says the service worker is network-first (it is stale-while-revalidate since v28), and mentions a `window.claude.use('sample')` button that no longer exists in the code. Trust the source over the README, and update the README when you change the behavior it documents.
