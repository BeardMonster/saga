# Saga — Handoff Document

**Purpose:** this document lets a new AI agent (or a new person) pick up work on Saga without re-deriving context that already exists. It's compiled from the working memory built up over the project's development sessions, organized by topic rather than chronology.

**How to use this doc:** read top to bottom once, then treat it as a reference — the "Current build status" section tells you what exists and works today; "Key decisions & lessons learned" tells you what's already been tried and why things are built the way they are; "Planned work" tells you what's next. When in doubt, the actual code and the git history (once a real repo exists — see Known Gaps) are the source of truth over this document if they ever disagree.

**Note on credentials:** this document deliberately does NOT contain real secret values (API keys, passwords, tokens). It says *where* each one lives so a legitimate operator can retrieve it directly. If you're an AI agent reading this and you need one of these values to do your job, ask Brandon for it directly rather than expecting it to be embedded here.

---

## 1. Current Build Status — Page by Page

Saga is a single-user personal life-management app. Every page below is reachable from the main nav once the app is running. Status reflects what's actually built and verified working, not just planned.

### Dashboard (`/`) — ✅ complete
Landing page. Shows live API/DB health pills, plus a "What this is built on" panel: a static stack summary and a **live-pulled** list of which AI model handles which task (pulled from `GET /settings/ai-tasks` so it can't silently go stale).

### Projects (`/projects`) — ✅ complete
Freeform projects with a status (active/done/archived), description, manual position ordering (move up/down, not drag-and-drop — deliberate, since Brandon uses this on mobile where touch-drag is unreliable). Soft-delete via Trash. First real content: an inventory of retro games/consoles being sold off, feeding an early-retirement goal.

### Checklists (`/checklists`) — ✅ complete
Standalone lists or attached to a project. Items support completion toggling (with a synthesized chime + CSS sparkle animation on check-off), manual reordering scoped to same-completion-status groups, and can be moved to a *different* checklist entirely via a dropdown. Soft-delete/Trash throughout.

### Goals (`/goals`) — ✅ complete
Long-range goals with a horizon (10yr → 3mo), a "Mark achieved" action, and pixel-art icons that change by horizon length. Manual reordering within horizon groups.

### Calendar (`/calendar`) — ⚠️ partial
Local events work fully, including recurrence via an RRULE field (`FREQ=YEARLY` etc.), and birthdays created from the People page show up here automatically. **Google/Apple 2-way sync is explicitly NOT built** — it needs Brandon's own OAuth app credentials, which can't be set up remotely. The RRULE field exists specifically so sync can be added later without a schema change.

### Reminders (`/reminders`) — ✅ complete, but verify delivery
"Set a date once, get a multi-stage reminder sequence" — an anchor date + a `cadenceDays` offset array (e.g. `[-30,-7,-1,0]`, with Google Calendar's own offset presets available as checkboxes) generates one instance per offset. A 60-second poll in the API pushes due instances via **ntfy** (self-hosted push). `isRecurringAnnually` auto-rolls the anchor date forward a year after the final instance fires, so annual reminders (birthdays) don't need manual recreation. **Known gap:** confirm Brandon has actually installed the ntfy app and subscribed to the topic — the server-side pipeline was verified working, but phone-side subscription was a separate, easy-to-forget step.

### People (`/people`) — ✅ complete, one known rough edge
Per-person profile with freeform preferences (JSON, not normalized), a private gift-idea list (idea/purchased/given status, deletable), and a "🎂 set reminder" button that creates both a reminder cascade *and* a calendar event in one action. **Known rough edge:** the "already set" button state is client-side React state only, not checked server-side — revisiting the page forgets it, and clicking again creates a duplicate reminder+event rather than being idempotent. Low-impact, not fixed.

### Finance (`/finance`) — 🚧 framework only
Schema + CRUD + manual-entry screens exist (`Account`/`Statement`/`Transaction`/`Category`/`Subscription`), seeded with a starter category taxonomy. **Actual statement parsing/ingestion (the Ollama-driven part) is not built** — this page currently only supports manual entry. Hard architectural rule already in place: financial data's `categorizedBy` field only allows `rule`/`ollama`/`manual` — no Claude tier, ever, regardless of ambiguity, per Brandon's explicit instruction that financial data never leaves the box.

### Investments (`/investments`) — 🚧 framework only
Same story as Finance: `InvestmentAccount` + `BalanceSnapshot` (periodic balance-over-time tracking for 401k/brokerage), CRUD works, no automated ingestion built yet.

### Recipes (`/recipes`) — ✅ complete
Full CRUD, client-side search (title/ingredients/tags, no server search endpoint needed for one household's box), dark-mode support, and an allergen system: 9 FDA major allergens + coconut as quick-toggle checkboxes plus free text, with a one-click AI auto-scan (`POST /recipes/scan-allergens`, local model) that suggests tags for review — never auto-saves. Recipe photo/voice capture happens through the Inbox pipeline (see below), and captured media/transcripts display on the recipe once confirmed. **Deferred, not built:** sharing a recipe with someone else (varying allergies) — flagged as needing its own design pass when actually wanted.

### Grocery Deals (`/grocery`) — ✅ live, with real known limits (see Section on Grocery below for detail)
Shopping list + stores management + a weekly price-comparison scan. Currently: **Aldi, Lidl, and Lowe's Foods** scrape their own real websites directly and are live with zero errors. **Harris Teeter, Food Lion, Walmart, and Publix** fall back to Flipp (a weekly-ad aggregator) because all four have a real blocker (three different bot-detection mechanisms, plus Publix's own data-availability gap — detailed later in this doc). **Whole Foods/Amazon Fresh has no scraper at all yet** and isn't covered by Flipp either — zero pricing data for it currently. The weekly automated scan is built but **not turned on** — currently manual-trigger only via the "Scan now" button.

### Inbox (`/inbox`) — ✅ complete
The "dumping ground": paste text, upload recipe photos (multi-image, for cards with writing on both sides), or upload a voice/video recording. Each produces an AI-proposed structured item (checklist item, goal, calendar event, reminder, gift idea, project, or recipe) for review — edit or reject-with-feedback (which re-tries using the full history of prior attempts, not a blind restart) before anything is actually created.

### Trash (`/trash`) — ✅ complete
30-day recoverable soft-delete across all 17+ deletable content types, restore or permanently delete early, hourly purge scheduler.

### Settings (`/settings`) — ✅ complete
Per-AI-task provider/model picker (local Ollama model, Claude API, or Claude Code CLI), a live Ollama model list (queried live, not hardcoded), and a Claude Code OAuth token countdown card (color-coded by days remaining).

### Alerts (`/alerts`) — ✅ complete, just built
A site-wide banner (polls every 5 min) plus a dedicated page listing unresolved/resolved alerts with a Resolve action. Currently fed by the grocery scanner: fires when a direct-site store's location-selection throws, or when a store matches zero of the shopping list in one run (a strong signal its page structure changed) — deliberately scoped to direct-site stores only, since Flipp's normal catalog gaps would false-positive constantly under the same rule. Each alert also pushes an ntfy notification.

### Broadcasts — 🚧 backend only, no dedicated page found in current routes
An API module exists (`modules/broadcasts`) for the SMS/Discord themed-broadcast concept from Phase 3, but there is no standalone `/broadcasts` route in the current nav — worth confirming with Brandon whether this is meant to be surfaced from the People page instead, or whether frontend work here was never finished. **Verify this rather than assume** — flagged honestly because it wasn't directly re-checked in this pass.

---

## 2. Infrastructure & Access

**Hosting:** a Lenovo M920q Tiny with an RTX 3050 6GB, running Proxmox VE bare metal. Proxmox host is `yggdrasil` (`192.168.11.3`, wired). Saga runs inside a single Ubuntu 24.04 **LXC container** (not a VM — deliberate, so this GPU can eventually be shared with other unrelated projects via device-node bind-mounts, which a VM's exclusive PCI passthrough wouldn't allow), named `saga`, at `192.168.11.10`.

**Access to the LXC:** SSH as user `lostlegend` (not `brandon` — deliberately unlinked from his public handles). Key-based auth; see the credentials section above for key locations and how to generate a new one. Passwordless sudo is enabled for this user.

**How deployment actually works — important, not obvious:** source is edited locally at `C:\Users\lostlegend\Projects\saga\{saga-api,saga-web,saga-grocery-scanner}`, then `scp`'d to `~/saga/` on the LXC, where Docker Compose actually builds and runs everything. **Editing local files does not update the running containers by itself** — `saga-api`/`saga-web` bind-mount only `src/` (and `saga-web` also needs `public/`) for live-reload via `tsx watch`/Vite; anything outside those mounted paths (package.json, tailwind.config.js, Dockerfile changes) needs a real `docker compose up -d --build`. `saga-grocery-scanner` has no live bind-mount at all — every code change there needs a rebuild (or a `docker cp` into the running container for fast iteration during testing, followed by a real rebuild once verified).

**Cross-service networking:** every service is its own independent Docker Compose project (not one shared network), so they reach each other via `host.docker.internal` (with an explicit `extra_hosts: ["host.docker.internal:host-gateway"]` on each compose file — this LXC runs plain Docker Engine, not Docker Desktop, where that resolution isn't automatic).

**Running services on the LXC:**
| Service | How it runs | Port | Notes |
|---|---|---|---|
| Postgres 16 | own Compose project | 5432 | superuser + `saga_api_user` app role |
| `saga-api` | Fastify/Prisma, own Compose project | 3000 | main backend |
| `saga-web` | Vite/React, own Compose project | 80 (host) → 5180 (container, unchanged internally) | proxies `/api/*` to saga-api |
| Ollama | native on the LXC host (not Dockerized) | 11434 | local AI models |
| `saga-grocery-scanner` | Playwright/Chromium, own Compose project | 8200 | store scraping, `/scan` + `/status` endpoints |
| `saga-whisper` | faster-whisper, own Compose project | 8100 | voice/video transcription |
| ntfy | own Compose project | 8090 | self-hosted push notifications |

**Remote access:** Tailscale is installed on the LXC; reachable at `http://saga` (port 80, no port needed) over Tailscale MagicDNS from any of Brandon's authorized devices, or directly by LAN IP.

**Auth model:** there is no login screen. Single-user, and the app is only reachable from Tailscale-authorized devices or the LAN — a login on top of that was judged to guard against a threat that doesn't currently exist. A `prisma/seed.ts` script creates the one `User` row; API modules resolve "the" user via a helper, not a session check. Revisit only if a second real user account is ever wanted.

---

## 3. Tech Stack

The repo already has several planning docs that go deeper than this section should — read them rather than expecting this document to duplicate them:
- `README.md` — scope/phasing overview
- `STACK-FOUNDATION.md` — the original stack template and reasoning
- `DATA-MODEL.md` — entity sketch
- `BUILD-PLAN.md` — the original infra-through-Phase-1 build walkthrough
- `SETUP-CHECKLIST.md` — the actively-checked-off infra log, including detailed gotcha writeups referenced throughout this doc

**Backend:** Fastify 5 + TypeScript + Prisma ORM, on PostgreSQL 16. Response shape is a consistent envelope: `{ status, message, code, data }` (helpers in `lib/envelope.ts` — `ok()`/`err()`). Every domain lives in its own `src/modules/<name>/` folder with `service.ts` (business logic) + `routes.ts` (Fastify route registration), registered in `src/app.ts`.

**Frontend:** React 19 + Vite + TypeScript + TanStack Query + Axios + Tailwind CSS. Dark mode via Tailwind's class strategy + a `useTheme()` hook persisting to `localStorage`. Each domain has a `src/features/<name>/` folder, generally one main page component plus supporting pieces.

**AI:** three providers, picked per-task via a `AiTaskSetting` model (editable in Settings):
- `ollama` — local models on the LXC's own GPU, free, default for everything unless there's a specific reason not to
- `claude` — the paid Anthropic API, requires a real `ANTHROPIC_API_KEY` (currently blank/unset) — **strictly opt-in, never a default**, per Brandon's explicit standing instruction
- `claude_cli` — Claude Code run headlessly via OAuth token from a Pro/Max subscription (`claude setup-token`) — free at point of use, used as the default fallback for hard cases (e.g. cursive handwriting) instead of the paid API

All routed through one call site: `runAiTask(prisma, taskKey, prompt, imagesBase64?)` in `lib/ai/taskRunner.ts`. **Standing rule, stated more than once by Brandon: never default any new feature to the paid Claude API.** Local first, Claude strictly opt-in, and say so in the UI wherever it's offered.

**Local models currently in use:**
- `llama3.1:8b` — general text tasks, allergen scanning, grocery-match judging
- `qwen3-vl:4b` — vision (recipe photo OCR, reading Flipp's image-rendered prices)
- faster-whisper (in `saga-whisper`) — voice/video transcription

**The grocery scanner is architecturally separate** from the rest of the app — `saga-grocery-scanner` is a standalone Node service using Playwright/Chromium for real browser automation, since nothing else in Saga needs that. It exposes `/scan` (fire-and-forget trigger) and `/status` (poll), proxied through `saga-api` so the browser frontend never talks to it directly.

---

## 4. Code Map — Where Things Live

```
saga-api/
  prisma/schema.prisma       — all models; migrations in prisma/migrations/
  src/app.ts                 — every module registered here; start here to see the full route surface
  src/lib/envelope.ts        — ok()/err() response helpers, used by every route
  src/lib/currentUser.ts     — getCurrentUserId() — the single-user resolution helper
  src/lib/ntfy.ts            — sendReminder(title, message) — push notifications (title is sanitized to Latin-1)
  src/lib/ai/                — taskRunner.ts (dispatch), ollama.ts, claude.ts, claude_cli.ts, whisper.ts, ffmpeg.ts, tesseract.ts
  src/modules/<domain>/      — one folder per feature: service.ts + routes.ts (+ scheduler.ts where a background job exists, e.g. reminders/trash)
  src/modules/trash/registry.ts — every soft-deletable content type is registered here (label, getTitle, listDeleted, restore, hardDelete)
  src/modules/grocery/       — stores, shopping list, deals, comparison logic (getComparison's sort key is where "cheapest" ranking lives)
  src/modules/alerts/        — the SystemAlert model's API surface

saga-web/
  src/App.tsx                — every route registered here — the definitive current page list
  src/shared/components/     — MoveButtons (up/down reordering), AlertBanner, NavBar, InlineEditText
  src/shared/hooks/useConfirm.ts — the confirm-before-destructive-action dialog used everywhere
  src/core/api/client.ts     — apiGet/apiPost/apiPatch/apiDelete/apiUpload — the only way pages talk to the API
  src/features/<domain>/     — one folder per feature, generally mirroring saga-api's module names

saga-grocery-scanner/
  lib.js                     — the scan orchestration: runFlippScan, runDirectScan, pickBestMatch (the deterministic
                                safety filters — dairy, frozen — live here), parsePriceText, alert reporting
  server.js                  — the HTTP wrapper (/scan, /status) plus the (currently dormant) weekly self-trigger
  sites/<store>.js            — one file per store, each exporting selectStore(page, zip, locationHint) and
                                searchProducts(page, query) — this is the pattern to follow for any new store
```

**The single most important pattern to preserve when extending anything:** every list-like entity that supports manual ordering uses a `position: Int` field + a `moveX` service function that swaps positions with an adjacent sibling in a transaction, paired with the shared `<MoveButtons>` component on the frontend. Every deletable entity has `deletedAt: DateTime?` and is registered in the Trash registry rather than having its own bespoke delete-forever logic.

---

## 5. Key Decisions & Lessons Learned

### Architectural decisions and why
- **Single-user, no login** — see Section 2. Revisit only if a second real account is wanted.
- **Soft-delete everywhere, one registry** — added because Brandon wanted a universal Trash, not per-feature confirm dialogs with no recovery.
- **Local-AI-first, Claude strictly opt-in** — a real correction after Brandon pushed back on defaults leaning toward Claude; a Pro/Max or Claude Code subscription does **not** cover a self-hosted app's own API calls — that's a separate, real-money Anthropic API key with no bridge between the two products.
- **Financial data never leaves the box** — a hard exception to the general per-feature AI routing choice, not a preference: `Transaction.categorizedBy` has no Claude tier at all, regardless of ambiguity.
- **Grocery deals are an append-only log (`GroceryDeal`), never upserted** — price history over time falls out of this for free; don't "optimize" this into an update-in-place table.
- **Manual reordering, not drag-and-drop** — Brandon is on mobile a lot, and touch-drag reordering is unreliable there.

### Real bugs and dead ends worth not repeating
- **A local text model cannot be trusted with a hard safety exclusion, no matter how the prompt is worded.** `llama3.1:8b` was tested against the *exact same failing input* with an increasingly explicit prompt twice and picked the same wrong (dairy) answer both times for a "Non-Dairy Yogurt" search. The fix was a deterministic code-level filter (reject candidates lacking an explicit plant-based keyword) applied *before* the model ever sees the candidate list — not a smarter prompt. The same pattern was reused for a "no frozen unless asked" rule. **Rule of thumb: if a wrong answer has real consequences (allergies, health, money), filter it in code; if a wrong answer is just a minor annoyance (best-generic-match judgment), a model's judgment call is fine.**
- **`force: true` in Playwright is not a safe "more robust" fallback.** It skips the actionability retry loop entirely, so it fires exactly once against whatever the element's geometry happens to be at that instant — worse for the exact class of transient timing bug it's usually reached for. A plain `.click({ timeout })` retries against real geometry until it settles, which is usually what actually fixes it.
- **Renaming a shopping-list item can silently break Flipp matching** — Flipp only matches its own exact indexed catalog terms, not arbitrary text. "Chicken Breast" → "Raw Chicken Breast" broke matching entirely; the working fix for a mismatch was a better extraction prompt, not a renamed search term. (Renaming *is* safe and sometimes correct when the new name is itself a common catalog term — e.g. "Broccoli" → "Broccoli Crowns" worked fine.)
- **Direct-site scraping quirks are all confirmed via live DOM inspection before being "fixed," never guessed** — this discipline caught things like: search URLs that look direct-linkable but never actually render (Aldi, Lidl — the SPA needs the real search box + button interaction); a store-picker whose stale outer modal reverts a just-made selection if you click its own "Confirm" button (Aldi); a debounced geocode suggestion whose timing varies run to run enough to need a retry loop, not just a longer timeout (Lidl); a store-picker's zip filter that visually looks like it works but doesn't actually re-sort anything (Lowe's Foods, worked around by searching the full list for a location-name hint instead).
- **Bind-mounts aren't recursive-by-assumption** — `saga-web`'s dev container only mounted `src/` and `index.html` at first; `tailwind.config.js` and `public/` changes landed on the LXC's filesystem but the running container kept using stale baked-in versions until `public/` was explicitly added to the compose file's mounts. Worth checking for any *new* top-level directory a service starts referencing.
- **TypeScript type changes don't fix runtime behavior** — a `createStore` function's type signature was updated to include a new field, but the actual object literal passed to Prisma still didn't list it, silently dropping the field at runtime. Types are erased at runtime; only the actual code matters.

### Store-specific findings (grocery scanner)
- **Harris Teeter** — blocked at the network/TLS level (Akamai). Even a bare `curl --http2` gets its stream reset right after the TLS handshake, with zero page content — this happens before any browser-level fingerprint could even be evaluated.
- **Food Lion** — blocked by an explicit bot-detection page naming the LXC's actual IP directly ("Access is temporarily restricted... Automated (bot) activity on your network"). Confirmed this is *not* a datacenter-IP-reputation issue — it's Brandon's real home IP, and his phone passes an automated check on the same network — so the more likely explanation is TLS/browser-fingerprint detection distinguishing a Playwright-controlled browser from a real one, not IP reputation. This reopens stealth-browser techniques as worth trying (not yet tested).
- **Walmart** — a third, different mechanism: the page loads and looks completely normal, but nothing responds to clicks. Console output showed PerimeterX's bot-check script present alongside React hydration errors and blocked API calls (412s) — the working theory is the bot challenge corrupts the app's initial data fetch, leaving React's client-side hydration mismatched against the server-rendered HTML, so the UI paints but its handlers never attach.
- **Publix** — not a block at all. Store selection and browsing work fine with no login. But its category/browse pages only carry real prices for *promotional* items — a non-sale product's price-badge component exists in the DOM but every conditional slot inside it is empty. Real per-item pricing likely needs its separate delivery/order-ahead flow (probably Instacart-backed, same as Aldi under the hood), which likely needs a real account or delivery address.
- **Aldi, Lidl, Lowe's Foods** — all confirmed clean, no bot-detection, all three built and live.

---

## 6. Methodology — How This Project Has Been Built

This matters as much as the task list itself:

1. **Verify live, before writing code that depends on it.** Never guess a selector, an API's URL shape, or a site's behavior — open it in a real browser session first (or curl it), confirm the actual DOM/response, then write the automation against what was actually observed.
2. **Test the smallest possible slice before committing to the larger build.** Isolate one function against a real target before wiring it into the full scan pipeline; a fix that "should work" gets verified against the exact input that was failing before moving on.
3. **Verify against the real database/output, not just "the code ran without an error."** A scan finishing with no errors doesn't mean the data it produced is correct — check the actual recorded rows.
4. **When a fix doesn't work, check if it made things worse before trying a third variation.** (The `force: true` and prompt-iteration cases above are both examples of catching a regression instead of layering another patch on top.)
5. **Local AI first, always.** Every new AI-assisted feature defaults to a local Ollama model; Claude (paid API) is opt-in only and must be visibly labeled as a real cost in the UI wherever it's offered; Claude Code CLI (free, subscription-based) is the reasonable middle fallback for hard cases.
6. **Deterministic code over model judgment for anything with real consequences.** A local model's judgment is fine for "which of these is the best generic match"; it is not reliable enough to trust with a hard exclusion (allergens, safety, money) — write that as an explicit filter instead, and verify it against the actual failing case before trusting it.
7. **Clean up test/disposable data after verifying** — don't leave synthetic test recipes, projects, or scan artifacts sitting in the real database or filesystem.
8. **When something is ambiguous, ask rather than guess** — but when Brandon has explicitly authorized proceeding (e.g. overnight), keep building and document every decision made along the way rather than stalling.

---

## 7. Brandon-Specific Context

These shape real decisions, not just flavor — don't quietly regress any of them:

- **Dairy allergy — a hard exclusion**, not a generic preference. Applies to any food/grocery/recipe suggestion, not just an allergen-list checkbox. See the deterministic-filter lesson above.
- **ADHD** — relies on external reminders and low-friction capture. Favor low-effort capture flows (the Inbox pattern) and multi-stage reminder cascades over anything requiring sustained manual upkeep.
- **Local-AI-first, Claude strictly opt-in** — a repeated, explicit instruction, not a one-time preference. Never default a new feature to the paid Claude API.
- **Grocery preferences:**
  - Dietary: "Broccoli" always means fresh crowns, not florets or frozen; "Asparagus" always means fresh, not frozen. Any staple with no explicit "frozen" in its name should default to excluding frozen candidates.
  - Confirmed preferred store addresses (all in `GroceryStore.externalConfig.preferredLocation`, zip 27615 area): Aldi (6300 Creedmoor Rd, 27612), Lidl (4308 Wake Forest Rd, 27609), Lowe's Foods (9600 Strickland Rd, 27615), Publix (9640 Leesville Rd, 27613), Food Lion (7713 Lead Mine Rd Ste 35, 27615), Harris Teeter (toss-up: 7400 Creedmoor Rd 27612 or 6024 Falls of Neuse Rd 27609), Whole Foods (8710 Six Forks Rd, 27615). Walmart is explicitly lowest priority — Brandon actively avoids it, paying more elsewhere to skip going in.
  - Non-Dairy Yogurt: Silk or So Delicious brand, soy preferred over almond when both exist. He's aware a generic "Non-Dairy Yogurt" list item is sometimes too broad and plans to add "Silk Soy Yogurt" as its own separate, more specific item alongside it — not a structural gap, a naming/usage choice he's making deliberately.
- **Working style:** prefers a written proposal before a big build, but will explicitly authorize proceeding without waiting for review (e.g. overnight) — read the specific message for which mode is active. Has explicitly confirmed liking the "verify live, test small slices, local-AI-first" methodology described in Section 6 — keep doing it, don't drift from it.

---

## 8. Planned Work

**Confirmed and prioritized by Brandon, not yet built as of this document:**

1. **Baseline/expected price per shopping-list item** (one global value per item, not per store — but every store's current price should still be shown per item so Brandon can weigh convenience against savings himself). Compare each new scan against this baseline rather than only against other stores' current prices.
2. **Price history view.** The raw data already accumulates today (`GroceryDeal` is append-only, never overwritten) — this is building an actual way to view/query that history, not collecting it for the first time.
3. **Audit trail for baseline price edits** — track when and to what a baseline gets changed.
4. **Per-item "alert me" opt-in checkbox** plus hot-sale push notifications, extending the existing Alerts/ntfy infrastructure — scoped per-item so notifications don't fire for everything at once.
5. **Weekly scan scheduling** — the scanner already has a dormant self-trigger; worth designing its timing around real store sale-cycle patterns (Food Lion changes prices right before its sale day; unconfirmed whether others follow the same pattern).
6. **Source labeling in the grocery UI** — tag each deal as coming from the store's own website vs. the Flipp fallback, so it's never ambiguous which is which. (Brandon's stated expectation is that deals come from the store's real site by default; Flipp is a fallback and should read as one.)
7. **Derived per-oz/per-unit pricing** when a weight is parseable from the matched product's name (e.g. "5.3 oz" in the name) but the store didn't show an explicit per-unit rate — compute `price ÷ parsed weight`, clearly marked as calculated/estimated so it's not confused with a rate the store actually published. Only valid for **weight** units (oz/lb/g) — explicitly do NOT attempt this for **volume** units (pint/quart/gallon) applied to non-liquid produce, since volume-to-weight conversion needs density data that isn't available and would produce a confidently wrong number.
8. **Stealth-browser / residential-proxy investigation** for Harris Teeter, Food Lion, and Walmart — a real technical investigation, not a guaranteed fix. The residential-proxy option specifically has a real recurring cost and is Brandon's call, not something to set up unilaterally.
9. **Lower priority, still open:** Publix's real (non-promotional) pricing needs its delivery/order-ahead flow investigated (likely needs an account/address); Whole Foods/Amazon Fresh has no scraper built at all yet.
10. **Also still pending from earlier in the project, not urgent:** Google/Apple 2-way calendar sync (needs Brandon's own OAuth app setup), Twilio/Discord broadcast credentials, a real git repository + GitHub remote for Saga itself (currently every `git` command inside the project resolves to an unrelated stray repo rooted at the Windows user home directory — nothing has leaked, but there's no real version history for Saga either), Finance/Investments actual statement-parsing ingestion (currently manual-entry-only frameworks), the Facebook monitor (explicitly a "much later" phase).

---

## Known Gaps in This Document

Being direct about what this handoff doc does *not* fully cover, so a new agent doesn't assume completeness where there isn't any:
- The Broadcasts feature's actual frontend surface was not re-verified in this pass (see Section 1).
- Whether Brandon has completed ntfy phone-app setup was not re-verified (see Reminders in Section 1).
- This document was compiled from a running memory log spanning many sessions; it has not been cross-checked line-by-line against the current live codebase for drift. Treat it as a strong, current-as-of-compilation starting point — not a guarantee that hasn't diverged from the code in small ways.
