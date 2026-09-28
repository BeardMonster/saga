# Saga — Data Model Sketch

First pass at the entities behind phases 1-4 (see README.md for phase detail). Not a final Prisma schema — a shape to build the real migrations from once infra is up. Phases 5+ are sketched only lightly since their scope is still likely to shift.

Single-tenant: every table below still carries a `user_id` for forward-compatibility (cheap now, saves a painful migration if a second real account is ever needed), but there's exactly one `User` row for the foreseeable future.

---

## Phase 1 — Core organizer

```
User          id, email, name, created_at

Project       id, user_id, name, description, status[active|done|archived], created_at

Checklist     id, user_id, project_id (nullable — a checklist can stand alone,
              e.g. the grocery list, or belong to a Project)
              name, kind[generic|grocery]

ChecklistItem id, checklist_id, title, is_complete, completed_at,
              position (for manual ordering), due_date (nullable)

Goal          id, user_id, title, description ("the why" / consequences text),
              horizon[10yr|5yr|3yr|1yr|6mo|3mo], target_date (nullable), status
```

**Design note:** `ChecklistItem.completed_at` (not just a boolean) is what the task-completion feedback and any future "here's what you got done" recap digest read from — capture it from day one even though nothing consumes it yet.

---

## Phase 2 — Calendar, reminders & important dates

```
CalendarEvent   id, user_id, title, start_at, end_at, location,
                recurrence_rule (nullable — a standard RRULE string, RFC 5545,
                the same format Google Calendar's API and Apple's CalDAV both use)
                external_ref (Google/Apple event id, for 2-way sync), is_shared

ReminderCascade id, user_id, title, anchor_date, cadence (e.g. [-30,-7,-1,0] days),
                person_id (nullable), goal_id (nullable)
                — exactly one of these populated depending on what the cascade
                is attached to (a birthday, a goal deadline), or neither for a
                standalone reminder

ReminderInstance id, cascade_id, fire_at, sent_at (nullable), acknowledged_at (nullable)
```

**Decided:** reminder attachment uses explicit nullable FK columns per subject type (`person_id`, `goal_id`) rather than a generic polymorphic reference — real FK constraints, easier joins, and there are only a couple of subject types today. **Decided:** recurrence adopts RRULE directly rather than a custom scheme — that's the literal mechanism "use Google/Apple's own recurrence handling" resolves to, since it's the standard both their APIs already speak; Saga doesn't need its own recurrence engine, just to store and pass through the same rule.

`ReminderCascade` is the template; `ReminderInstance` rows are what actually get generated and fired — this is the mechanism behind "set the date once, get the whole chain automatically." Brandon's existing manual staggered-reminder habit for birthdays is exactly what this replaces.

---

## Phase 3 — People & gifts

```
Person       id, user_id, name, relationship, birthday (nullable),
             phone (nullable), discord_user_id (nullable),
             notes (freeform text), preferences (JSON — likes/loves/hates,
             go-to restaurant orders, etc.)

GiftIdea     id, person_id, description, link (nullable), price_estimate (nullable),
             status[idea|purchased|given], noted_at

User (add)   myregistry_url (nullable)
             — Brandon's own wishlist lives entirely on MyRegistry.com (see Key
             decisions in README.md); Saga just stores the link, no WishlistItem
             entity or claim-tracking needed on our side

Broadcast    id, user_id, title, message_body (the themed message text),
             channels (array: sms, discord), recipient_person_ids (array),
             sent_at (nullable), status[draft|sent|failed]
             — composes once, fans out via Twilio (SMS) and a Discord bot post;
             replaces the earlier "guest tracker" idea with something concrete

OpenInvite   id, user_id, title, description, date_range
             — the "ping friends for a weekend project" feature
```

**Design decision:** `Person.preferences` as JSON rather than a normalized `Preference` table. Faster to build, flexible for the kind of freeform stuff in the original partner-preferences doc (food, music, "hates X"). Worth normalizing later only if a real need to *query* across it shows up (e.g. "who likes sushi" across all profiles) — not needed yet.

**Decided:** Brandon's own public wishlist integrates with MyRegistry.com rather than being built in Saga — it already supports any-store bookmarking and hides claimed items from the owner while showing them to visitors. This removed the need for a `WishlistItem` entity, claim-tracking, and any Cloudflare Pages/Functions build entirely.

---

## Phase 4 — Financial ingestion & insights

```
Account      id, user_id, name, institution,
             platform[bank|credit_card|venmo|paypal|wise|cashapp], last4,
             type[checking|savings|credit|payment_app]

Statement    id, account_id, period_start, period_end, imported_at,
             import_method[file_upload|pasted_text], source_file_ref (nullable)

Transaction  id, account_id, statement_id (nullable), occurred_at,
             merchant_raw, amount, category_id (nullable),
             categorized_by[rule|ollama|manual]
             — no "claude" option here: financial data never leaves the box,
             see AI strategy's hard exception in README.md

Category     id, name, parent_category_id (nullable) — small hierarchy,
             e.g. Food > Groceries, Food > Dining Out

Subscription id, account_id, service_name, amount, billing_cycle, next_charge_date
             — the credit-card-per-service tracker; can start out manually
             entered and later be inferred from recurring Transaction patterns

InvestmentAccount id, user_id, institution (e.g. "Charles Schwab", "401k provider"),
                  account_type[401k|brokerage|ira|other], last4 (nullable)

BalanceSnapshot   id, investment_account_id, as_of_date, total_value,
                  contributions_this_period (nullable), source_statement_ref (nullable)
                  — periodic point-in-time balances, not itemized transactions;
                  this is what actually tracks progress toward the early-retirement
                  goal, more directly than spending categorization does
```

**Design note:** `Transaction.categorized_by` records which tier made the call (rule-based / Ollama / manual correction) — cheap to add now, and it's exactly the field you'd want later to answer "how often is the local model getting it wrong" without re-deriving it from logs.

**Also worth noting:** `Category` here is the same taxonomy Phase 5's grocery deal cross-referencing will want (matching sale items against what you actually buy) — one shared table, not two.

**Decided:** transactional financial data (bank/credit card/Venmo/PayPal/Wise/Cash App — whether imported as a file or pasted as raw text) all funnels through `Account`/`Statement`/`Transaction`. Investment/retirement statements (401k, Schwab) are a genuinely different shape of data — balances and holdings over time, not itemized purchases — so they get their own `InvestmentAccount`/`BalanceSnapshot` pair rather than being forced into the transaction model.

---

## Phase 5+ (conceptual only, expect this to shift)

```
SaleItem   store, item_name, sale_price, regular_price_estimate,
           valid_from, valid_to, is_flagged_fake_sale

MealPlan   date, recipe_ref, calorie_target
```

Both read from `Transaction`/`Category` (phase 4) rather than tracking a separate purchase history.

---

## Open questions

None remaining from the original sketch — reminder attachment, recurring events, statement import breadth, gift claim visibility, backup target, and financial-data AI routing are all resolved; see the "Decided" notes inline above and README.md's "Key decisions" section.
