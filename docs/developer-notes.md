# Developer Notes — Whitewater Event Ecosystem

_Last updated: 2026-09-22. This is the engineering record for the portal app,
GoHighLevel (GHL), and PandaDoc: how the pieces fit, where data lives, when
syncs fire, what configuration exists, and a changelog. The user-facing
guide is [manual.md](manual.md) — it is rendered inside the app at
`/admin/manual` and must stay free of code paths, env vars, and history.
When a feature ships, update both (section 6 says what to check)._

Related references (kept separate on purpose):

- [manual.md](manual.md) — the coordinator-facing guide rendered in the app.
- [ghl-custom-fields.md](ghl-custom-fields.md) — the authoritative field-by-field
  list of every GHL custom field the app reads/writes, with field ids.
- [roadmap.md](roadmap.md) — planned work.
- [domain-cutover.md](domain-cutover.md) — checklist for moving production
  from the vercel.app URL to `groupsales.whitewater.org` (domain live
  2026-09-20; the remaining boxes are tracked there).

---

## 1. The big picture

Three systems, three jobs:

| System | Job | Owns |
| --- | --- | --- |
| **GoHighLevel** | CRM and system of record | Contacts, opportunities, the Event Sales pipeline, client email/SMS notifications, calendars of record |
| **This portal app** | Working surface for coordinators and clients | Room calendar, event checklists, schedules, uploads, vendor submissions, the client-facing portal pages |
| **PandaDoc** (via GHL) | Proposals and signatures | Proposal documents; pushes the proposal link into GHL |

Two rules keep the integration sane:

1. **GHL is the system of record.** The app mirrors opportunity data into a
   local snapshot and writes changes back; when in doubt, what GHL says wins
   on the next sync.
2. **The app drives GHL, not the other way around** (adopted 2026-07-15).
   Coordinator actions in the app (linking a room, launching a portal) push the
   opportunity through the pipeline. The only GHL→app automation is the
   inquiry webhook that creates the draft event.

### Who uses what

| Person | Where they work | Access |
| --- | --- | --- |
| **Manager** (Austin / managers) | `/admin` — everything, incl. Admin section, user management, reports, dollar values | Supabase login, role `admin` (shown as "Manager") |
| **Coordinator** | `/admin` — daily event work; no Admin section, no dollar values | Supabase login, role `coordinator` (the default role) |
| **Client** | `/e/<token>` — their event portal | Secure tokenized link, no login |
| **Sales** | GoHighLevel | GHL login |

Roles live in Supabase auth `app_metadata.role` and can only be changed from
Admin → Users (service role), so users can't escalate themselves.

---

## 2. Data and sync reference

### Where data lives

- **Supabase (Postgres)** — events (with a `ghl_snapshot` JSON mirror of the
  opportunity), checklist items/templates, schedule, vendors, uploads
  metadata, reservations/rooms, integration logs, portal users.
- **Supabase Storage** — client-uploaded files and archived signed
  contracts (private; coordinators get short-lived signed URLs).
- **Supabase `event_contracts`** — one row per PandaDoc contract: name,
  description, line items, subtotal, app status + raw PandaDoc status,
  document id/link, recipient, sent/viewed/signed timestamps, signed-PDF
  path, `signed_actions_applied_at` (once-only guard for the signed side
  effects).
- **PandaDoc** — the documents themselves and signing; the app reads status
  and the executed PDF back.
- **GHL** — contacts, opportunities, pipeline stages, custom fields (see
  [ghl-custom-fields.md](ghl-custom-fields.md) for the full field map).

### When syncs happen

| Trigger | Direction | What moves |
| --- | --- | --- |
| Inquiry webhook | GHL → app | `POST /api/ghl/opportunities/inquiry` with `ghl_opportunity_id` (location defaults to config; contact/event details read via `GET /opportunities/{id}` when not in the delivery; an empty opportunity id is resolved from `ghl_contact_id` via `GET /opportunities/search?contact_id=` → newest open) → draft event; app writes event id back. Rejected deliveries (bad secret, bad payload, failure) log `inquiry_webhook_rejected` |
| Phone inquiry | app → GHL | Contact upsert (`/contacts/upsert`, tag `inquiry-phone`), opportunity create (`POST /opportunities`, New Inquiry stage, form custom fields, `assignedTo`), contact note; then the draft event is created locally and its id written back. `events.inquiry_source` / `events.expedited` record the path |
| Inquiry backfill | GHL → app | `GET /opportunities/{id}` → same draft-event creator as the webhook (`inquiry_event_backfill` log) |
| Admin event page load | GHL → app | Opportunity snapshot refresh (name, date, coordinator, links, counts, value) |
| Event summary save | app → GHL | Guest/pass/bin counts, Value |
| Facilitator save (admin or client portal) | app → GHL | Facilitator name/email/phone custom fields + `facilitator`-tagged contact upsert (one-way; GHL never writes back). "Same as current contact" saves instead read the primary GHL contact and skip the upsert |
| Conversations drawer open | GHL → app | Contact's conversations + message history, read live (never stored); threaded email rows are expanded one email at a time (`/conversations/messages/email/{id}`) so client replies show |
| Conversations drawer reply | app → GHL | Email/SMS sent via the GHL Conversations API; threads into the same GHL conversation (needs the write-conversations scope) |
| Conversations drawer snippet menu | GHL → app | Location snippets (`/locations/{id}/templates`), read live and cached 5 min per server process (never stored). Merge tags are rendered by the app, not GHL (`src/lib/ghl/snippet-merge-tags.ts`, route `/api/ghl/contacts/[contactId]/message-templates?eventId=`): `contact.*` from the GHL contact, `user.*` from the signed-in user's GHL match (falling back to the event's coordinator), and `opportunity.assigned_to` / `groupevent_name` / `event_date` / `portal_link` from the event's stored snapshot + `client_portal_url` — no extra GHL call |
| Follow-ups pause / resume | app → GHL | `follow-ups-paused` tag added to / removed from the contact (`POST`/`DELETE /contacts/{id}/tags`) plus a GHL note; the pause row lives in `follow_up_pauses` (who, when, why, how it ended). Lifted automatically on contract signature (Booked) and by the dashboard's reconcile pass when GHL shows the opportunity Booked/Lost/won/lost |
| Notes drawer open | GHL → app | Contact's GHL notes, read live (never stored); count shown as a badge on the notepad button |
| Notes drawer add | app → GHL | Note written to the GHL contact, attributed to the matching GHL user by email |
| Tasks drawer open | GHL → app | Contact's GHL tasks, read live (never stored); open-task count badges the tasks button |
| Opportunities pipeline view | GHL → app | Badge counts for the visible stage read from the local `ghl_contact_badges` cache; stale rows (>5 min) across the whole pipeline re-swept from GHL after the response, paced (60 contacts/view, concurrency 5) for the 140–250-card in-season pipeline (see roadmap "Expected volume") |
| Contracts tab "Save and re-send" (Edit) | app → PandaDoc | Document moved to draft, updated (name, tokens, pricing table), sent again; row gets `revision`+1, `revised_at/by`; `contract_update` log |
| Contracts tab "Create and send" | app → PandaDoc | Document created from the template (tokens + one pricing table per tax treatment from the line items, option ticks included), waited to draft, sent silently (or emailed) |
| Contract form opens / template changes | PandaDoc → app | Template details (pricing tables, headings, option and starter rows) and the product catalog, both read live and cached 5 min per server process (never stored). On save the server re-reads the catalog to set catalog rows' names and prices |
| Admin event page / Contracts tab load | PandaDoc → app | Open contracts re-read from PandaDoc (status, total); signed side effects run if newly completed |
| Portal "Review and sign" | app → PandaDoc | Embedded-signing session minted for the recipient (1-hour link) |
| Portal signer completion | PandaDoc → app | `POST /api/portal/<token>/contracts/<id>` `{action:"complete"}` re-reads the document and runs the signed actions (rooms booked, GHL Booked, PDF archived) |
| PandaDoc webhook | PandaDoc → app | `POST /api/pandadoc/webhook?signature=…` (HMAC-SHA256 with `PANDADOC_WEBHOOK_KEY`); each document in the delivery is re-read and synced — needs a public URL |
| Contract signed | app → GHL | Opportunity moved to the Booked stage (`opportunity_move_to_booked`) |
| Tasks drawer create / check off | app → GHL | Task created on the GHL contact (due date required by GHL, assignee defaults to the signed-in coordinator's GHL user) or completion toggled |
| Coordinator reassign / coordinator pick | app → GHL | Opportunity `assignedTo` |
| Reservation linked to event | app → GHL | Opportunity moved to Planning stage |
| Portal launch | app → GHL | Portal Link field |
| Event delete | app → GHL | Blanks Event Planning App ID + Portal Link |

**Degrade rules:** every GHL call fails quietly (logged, never blocking the
coordinator's primary action) *except* coordinator reassignment, which surfaces the
error because a silent failure would revert on the next sync. All exchanges
land in **integration_logs** (`GHL_TO_PORTAL` / `PORTAL_TO_GHL`) — that page
is the first stop when "something didn't sync."

### Salesforce migration (staging)

The sales team is migrating from Salesforce to GHL. The app is the
**middleman**: records are pulled read-only from Salesforce into staging
tables, reviewed/mapped there, then (contacts only, so far) pushed to GHL —
never Salesforce → GHL directly. One-way sync; Salesforce stays the source
of truth until cutover. The staging tables are also the app's permanent
archive of pre-GHL booking history — Salesforce goes away at cutover, these
tables don't.

- **Pull:** `npx tsx --env-file=.env.local scripts/sf-pull.ts` (incremental,
  each object resumes from its own watermark; `--full` re-pulls everything,
  `--only=contacts|accounts|opportunities|documents` limits the run). Unchanged
  records are hash-skipped, so re-runs are cheap. Runs are logged in
  `sf_pull_runs` (one row per object per run). Shared engine:
  `src/lib/salesforce/pull-engine.ts`.
- **Scope:** `sf_contacts` (Contacts, `Account.Name`/`Owner.Name` flattened
  in), `sf_accounts` (Accounts incl. `Type` and the
  `Number_of_Booked_Opportunities__c` / `Last_Booking_Date__c` roll-up
  snapshots — recompute live values from `sf_opportunities` instead of
  trusting these), and `sf_opportunities` (Opportunities incl. stage,
  amount, `Date__c` "Date of Event", head count, primary `ContactId`; the
  event-detail custom fields — rentals, adventures, catering totals — ride
  along in `raw`), and `sf_pandadoc_documents` (the PandaDoc managed
  package's `pandadoc__PandaDocDocument__c`: one row per document with its
  Opportunity, PandaDoc UUID, status string, template name, and the
  total / sent / completed dates lifted from the package's stored webhook
  JSON). That JSON is **deliberately dropped** after parsing — it embeds
  each recipient's tokenized `shared_link`, which opens the document
  without a login. Rows flagged `pandadoc__Is_Deleted__c` are staged but
  never linked (dead in PandaDoc). Auth is the client-credentials flow
  against the "Contact Export" External Client App (read-only run-as user).
- **Contract links:** the company detail timeline links each archived
  opportunity to its documents via `pandaDocDocumentUrl(uuid)` —
  `app.pandadoc.com`, so the viewer needs a seat in Whitewater's PandaDoc
  workspace. Nothing is fetched from PandaDoc; the UUIDs outlive the
  Salesforce cutover as long as the PandaDoc workspace does.
- **Push to GHL:** not built yet — `sf_contacts.push_status` tracks each
  contact through `staged → approved/excluded → pushed`. Accounts and
  opportunities are **not** planned for wholesale push: GHL has no real
  account object and no roll-up fields, so company/booking history stays
  in-app (Salesforce also has duplicate accounts — e.g. three "Wells
  Fargo" rows — so any push would need account-level dedupe first).
- **Review screen:** `/admin/system/sf-migration` (admin-only) — pulls,
  search/status/dupe filters, per-contact approve/exclude, and a preview of
  the exact GHL payload (`src/lib/salesforce/ghl-mapping.ts` is the single
  source of truth for the field mapping).

### Email

The app sends **only password-reset emails**, via Mailgun
(`mg.whitewater.org`). All client-facing email/SMS is GHL's job.

---

## 3. PandaDoc internals

**Proposals** still come from GHL's PandaDoc integration (Proposal Link
field, read-only in the app — see Step 2).

**Contracts** are the app's own PandaDoc integration (manual Steps 4b and 6):

- **Account/API:** needs a PandaDoc plan with API access and an API key in
  `PANDADOC_API_KEY`. A sandbox key works against the same host for testing.
- **Template:** build a "Contract" template in PandaDoc with one recipient
  role for the client (any role containing "client"/"customer"/"signer" is
  picked, else the first), a **pricing table** (the first one receives the
  app's line items), and whichever tokens you want filled: `event.name`,
  `event.type`, `event.date`, `event.arrival_time`, `event.meeting_location`,
  `event.num_attendees`, `event.activity_passes`, `event.parking_passes`,
  `event.storage_bins`, `contact.name/email/phone`,
  `coordinator.name/email/phone` (also sent as `planner.*` for older templates),
  `facilitator.name/email/phone`,
  `contract.name`, `contract.description`, `contract.subtotal`. Set its id as
  `PANDADOC_TEMPLATE_ID` for the default; coordinators can pick any template.
- **Whitewater's existing templates** (EA Group, Group w/ Catering, Final
  Payment, the wedding ones, …) were built for PandaDoc's Salesforce
  integration: two roles (*Client* and *Event Coordinator*), pricing tables
  named `PricingTable1`/`PricingTable2`, and tokens named `Client.FirstName`,
  `Client.LastName`, `Client.Email`, `Client.Phone`, `Account.Name`,
  `Date__c`. The app fills those names too (Account.Name blank — the event
  has no company field), so they work unchanged. Only the Client role is
  assigned; PandaDoc gives that recipient every signature field.
- **Pricing tables (one per tax treatment).** The templates hold several
  pricing tables and the table a row sits in decides its tax: the "Food &
  Beverage Items" table carries a Catering Service Fee (22%) and a Food &
  Beverage Tax (9.25%) set on the table in the template; "Item" is untaxed;
  Santee's accommodation and fees tables carry their own rates. The details
  API only reports the combined amount as `tax` (the breakdown shows in the
  PDF), and nothing about tax is readable from an empty template — so the
  app never computes tax. It files each row under a table and PandaDoc
  applies that table's settings. Tables are addressed by their internal
  `name`, which says nothing about purpose (Food & Beverage is
  `Pricing Table 1`, `PricingTable2` or `PricingTable1` depending on the
  template, and `PricingTable2` is the options table on the EA templates),
  so the form labels each table with its **heading** — the `header` of the
  Name column in template details. A heading can't be set through the API
  (an undocumented `columns` property is ignored); a titled **section**
  prints as a sub-heading inside the table, which is where the event-day
  line goes, one section per day.
- **Rows.** Each line item carries `table`, `table_heading`, `section`,
  `catalog_item_id`, `sku`, `optional`, `selected` in
  `event_contracts.line_items` (rows saved before this have none and go in
  the first priced table). `pricing_tables` is sent with `data_merge: false`
  and PandaDoc's standard lowercase keys (`name`, `description`, `price`,
  `qty`, `sku`): that works on every table, including Final Payment's
  renamed merge columns, whereas `data_merge: true` is rejected by some
  tables whose details report `data_merge_enabled: true` (EA Group w/
  Catering's options table). Rows sent for a table **replace** the rows
  saved in the template; a table that isn't sent keeps them. So the form
  loads the template's starter rows as editable custom rows, and a table
  left without rows is sent with an empty section to clear it (on create:
  priced tables that had starter rows; on edit: tables that held rows at
  the last save).
- **Options tables.** A table whose Price column is hidden is a menu of
  optional `$0` rows (the EA education programs). The form lists the
  template's options as checkboxes; all of them are sent back with
  `optional: true` and `optional_selected` for the tick. Unticked options
  are excluded from subtotals, the client portal's item list, and the
  line-item count in the integration log.
- **Product catalog.** `GET /public/v2/product-catalog/items/search`
  (the only v2 call; `pandaDocRequest` swaps the base URL's `/v1`), paged
  100 at a time and cached 5 minutes per server process, like the template
  list and template details. PandaDoc is the price list: catalog rows are
  read-only in the form, and on every create/edit the server re-reads the
  catalog and overwrites the row's name, SKU and price from it, whatever
  the browser sent. A catalog item deleted in PandaDoc fails the save with
  a message naming the row. Custom rows keep the coordinator's price.
  Catalog items have no tax data and no table affinity — coordinators
  place them, as they do in PandaDoc — but the form warns when an item
  from a catering category (numbered categories, "Catering", "Hot Drinks")
  sits outside a Food & Beverage table while the template has one.
- **Sandbox vs production key.** The sandbox key is issued inside the real
  workspace: it reads the real templates, catalog and documents, and what it
  creates lands there with a `[DEV]` prefix. It is capped at 10 requests a
  minute for every endpoint, which a create can brush against when the
  caches are cold (template details + up to three catalog pages + create +
  status polls + send + details). Production keys need PandaDoc's approval.
- **Editing:** move-to-draft → update → send, all on the same document id
  (see the manual, Step 4b). PandaDoc refuses to update anything not in draft, and
  refuses a move-to-draft on a draft, which the app handles.
- **Sandbox limits:** sandbox documents get a `[DEV]` name prefix and can
  only be *sent* to workspace members' addresses ("not allowed to send
  documents outside of your organization"), so test with a recipient like
  a whitewater.org member or austin@bellaworksweb.com. Silent send means no
  email goes out either way.
- **Signing:** silent send + embedded signing in the portal. Staff links go
  to the PandaDoc app; clients never leave the portal. Sessions can only be
  minted while the document is *sent*/*viewed* — not draft, not waiting
  approval.
- **Status back to the app:** three paths funnel through one sync
  (`src/lib/admin/contracts.ts` → `syncContractFromPandaDoc`): page-load
  refresh, portal signer completion, and the webhook. The signed side
  effects run exactly once per contract.
- **Webhook:** register `https://<app>/api/pandadoc/webhook` in PandaDoc for
  *document_state_changed* and *recipient_completed*, and put the shared key
  in `PANDADOC_WEBHOOK_KEY`. Only matters once the app has a public URL —
  on localhost the signer-completion path already flips rooms within
  seconds of the client finishing.
- **PandaDoc payments:** the standard templates have a payment step, so
  after the client signs, PandaDoc's signer moves on to "pay" and the
  document sits in `document.waiting_pay` until paid (`document.paid`). The
  app treats *waiting_pay* as **Signed** (rooms booked, GHL Booked, PDF
  archived) because the signature is what commits the event; the card notes
  that payment is pending in PandaDoc. Turn payments off in the template if
  clients should pay elsewhere.
- **Payment status** is still the GHL-synced field; PandaDoc payments are
  not wired (a `document.paid` status simply reads as Signed).

---

## 4. Configuration quick reference

All in `.env.local` (see `src/lib/env.ts` for the full list):

| Variable | Breaks what when missing/invalid |
| --- | --- |
| `GHL_ACCESS_TOKEN` / `GHL_LOCATION_ID` | All GHL sync; coordinator dropdowns fall back to read-only; Opportunities page shows empty states |
| `GHL_WEBHOOK_SECRET` | Inquiry webhook rejects deliveries |
| `GHL_PIPELINE_ID` / `GHL_PLANNING_STAGE_ID` | Planning-stage moves; Opportunities pipeline board |
| `GHL_BOOKED_STAGE_ID` | Contract-signed move to the Booked stage (logged as a skipped warning when missing) |
| `PANDADOC_API_KEY` | Contracts tab can't create documents; portal shows no signing; template picker explains |
| `PANDADOC_TEMPLATE_ID` | No default template preselected (coordinators pick one per contract) |
| `PANDADOC_WEBHOOK_KEY` | Webhook deliveries rejected (401); signer completion + page refresh still work |
| Field id vars (`GHL_OPPORTUNITY_EVENT_FIELD_ID`, `GHL_PORTAL_LINK_FIELD_ID`, `GHL_DATE_OF_INTEREST_FIELD_ID`) | The respective field reads/writes |
| Supabase vars | Everything — auth, data, storage |
| `MAILGUN_API_KEY` | Password-reset emails |
| `SALESFORCE_DOMAIN` / `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` | Salesforce contact pulls (migration staging) |

A GHL **401** in the dev logs means the access token is expired/invalid —
coordinator pickers go read-only and pipeline views go empty until it's replaced.

---

## 5. GHL configuration

### Inquiry webhook (GHL → app)

Set up once per environment, in the GHL workflow that runs on a website
inquiry (**Group Sales Inquiry: Step 1 - Form Submission**): a *Webhook*
action right after *Create opportunity*, named "Portal: create draft event".

- Method `POST`, URL `https://<app host>/api/ghl/opportunities/inquiry`
  (production: `https://groupsales.whitewater.org`; the old
  `whitewater-client-event-portal.vercel.app` host 308-redirects there, but
  don't count on GHL's webhook POST following a redirect — use the new host).
- Header `x-portal-webhook-secret` = the app's `GHL_WEBHOOK_SECRET`.
- Custom data `ghl_opportunity_id` = `{{opportunity.id}}` **and**
  `ghl_contact_id` = `{{contact.id}}` (`ghl_location_id` = `{{location.id}}`
  is sent too but defaults to config). The app reads contact and event
  details from GHL itself; any field the delivery carries wins. The contact
  id is the safety net: on a form-submission trigger GHL does not reliably
  fill `{{opportunity.id}}`, and a delivery with an empty opportunity id is
  resolved to that contact's newest open opportunity in the pipeline.
- The app must be reachable from the internet. For local testing,
  `cloudflared tunnel --url http://localhost:3000` prints a temporary
  `trycloudflare.com` host (new every run).
- Success is a `create_inquiry_event` row in the integration log; a
  duplicate delivery logs `create_inquiry_event_duplicate` and reuses the
  event. Any delivery the route turns away — wrong or missing secret,
  invalid payload, or a failure while creating the event — logs
  `inquiry_webhook_rejected` (status error) with the HTTP status and a
  summary of what the delivery carried, so a missing draft is diagnosable
  from Admin → Integration Logs without Vercel logs. No row at all means
  GHL never called the app: check the workflow's Execution logs and its
  re-entry setting (a contact that already went through the workflow —
  e.g. a second test with the same email — is not re-enrolled unless
  "Allow re-entry" is on). If nothing arrives, the New inquiry page's
  backfill list uses the same code path (`inquiry_event_backfill`).

Wired for the Event Sales pipeline on 2026-09-15. Any other form or pipeline
that should produce portal events needs its own workflow with the same
action.

### Private Integration scopes and follow-up pauses

**Private Integration scopes** the token needs beyond the basics (Settings →
Private Integrations in GHL): *write conversation messages* (drawer replies),
*view templates* / `locations/templates.readonly` (snippet menu), *edit
contacts* / `contacts.write` (follow-ups pause tag). Each missing scope
surfaces as a labeled 401 message in the feature it gates.

**GHL workflow checklist for follow-up pauses** (someone with workflow
access does this once in GHL; the portal only sets and clears the tag):

1. In every chase workflow (the automated "haven't heard back" sends),
   add an **If/Else** step immediately before each send action:
   *Contact tag* → *includes* → `follow-ups-paused`. Route the "yes"
   branch around the send so the contact skips that message but stays in
   the workflow; the "no" branch sends as before.
2. Backstop for deals that book or die inside GHL: a small workflow with
   two triggers — *Opportunity stage changed* to **Booked** and to
   **Lost** — whose only action is *Remove Contact Tag*
   `follow-ups-paused`. (The portal lifts the tag itself when a contract
   is signed and on each dashboard load, but this keeps GHL self-consistent
   even if nobody opens the portal.)
3. Don't create the tag by hand; the portal adds it the first time someone
   pauses, and GHL creates tags on first use.

---

## 6. Keeping the docs current

When you ship a feature, ask:

1. Does it add or change a **step in the event lifecycle**, a **screen**,
   or something a coordinator does? → update [manual.md](manual.md) (plain
   language, no code paths, env vars, or log names — it is shown to users
   in the app) and bump its _Last updated_ date.
2. Does it **read/write GHL or PandaDoc**? → update section 2 here *and* the
   field table in [ghl-custom-fields.md](ghl-custom-fields.md).
3. Does it need **new env/config or GHL-side setup**? → sections 4 and 5.
4. Add a changelog row below and bump the _Last updated_ date at the top.

## Changelog

| Date | Change |
| --- | --- |
| 2026-09-22 | **Contract name default.** A new contract's name starts as `MM-DD-YYYY - Group name - Contact name` (event date, event name, primary contact; missing pieces skipped) instead of `<event> — Event Contract`. `defaultContractName` in `src/lib/contracts/shared.ts`, computed on the Contracts page and passed down as `defaultName`. |
| 2026-09-22 | **Dashboard filters + contracts switch.** The dashboard takes the same filter row as the pipeline (shared `EventFilterFields` component, `src/components/admin/event-filter-fields.tsx`) with a **My events** option that matches the signed-in user by coordinator email, GHL user id, or name (`resolveCurrentCoordinator`; hidden when the login has no email). Coordinator values on the dashboard are names (what `ghl_snapshot.planner` reliably holds), not GHL ids. Filters ride in the URL and scope vendor submissions, upcoming events, both contract lists, and paused follow-ups (a pause with no portal event is hidden while filtering); the metric tiles stay portal-wide. `?contracts=all` widens Needs attention from the three-week window to every upcoming launched event the deadline rules would flag. `AdminEventListItem` gained `coordinatorEmail`, `coordinatorGhlUserId`, `numberOfGuests` (moved up from the detail type). Filter logic merged into `src/lib/admin/event-filters.ts` (one module because the test runner can't resolve an extension-less relative import between two `.ts` files); tests in `tests/admin/event-filters.test.mjs` and `tests/admin/dashboard-filters.test.mjs`. Note: `listAdminEvents` still returns the 50 most recently created events, so All upcoming is bounded by that. |
| 2026-09-22 | **Opportunities → Pipeline filters.** A filter row under the stage tabs narrows the cards by coordinator (GHL `assignedTo`, plus Unassigned), group size (Number of Guests between an inclusive min and/or max; whole numbers only), event date (Date of Interest from/to, undated cards never match), and group type (Inquiry Type, case-insensitive). `searchPipelineOpportunities` now reads Number of Guests and Inquiry Type by field id into `guestCount` / `inquiryType`; the dropdowns list only coordinators with an open opportunity and the Inquiry Types actually present. Filters combine with the search box, the stage tabs show per-stage match counts while any is active, and the choices ride in the URL (`?coordinator=&min_guests=&max_guests=&from=&to=&type=`) alongside `?q=` and `?stage=`. Parsing/matching is import-free in `src/lib/admin/event-filters.ts` (`tests/admin/event-filters.test.mjs`). Cards now show guest count and group type. |
| 2026-09-21 | **Snippets fill event merge tags.** Emails were going out with blanks ("My name is ,", "your proposal for on ,") because messages sent through the Conversations API aren't merge-rendered by GHL, and the app only filled `contact.*` and `user.*`. The snippet route now takes `?eventId=` (the event page passes its id; Opportunities cards pass the card's portal event id from `eventFlags`) and fills `{{opportunity.assigned_to}}` (event coordinator, `ghl_snapshot.planner`), `{{opportunity.groupevent_name}}` / `{{opportunity.name}}`, `{{opportunity.event_date}}` (long form), and `{{opportunity.portal_link}}` (`events.client_portal_url`, so only after launch). `{{user.*}}` falls back to the event's coordinator when the signed-in login has no GHL user match. Rendering moved to the import-free `src/lib/ghl/snippet-merge-tags.ts` (tested in `tests/admin/snippet-merge-tags.test.mjs`). The drawer lists any `{{…}}` still in the subject/body in an amber warning above Send, since GHL sends leftovers as blanks. |
| 2026-09-21 | **Fix: client email replies never showed in the conversations drawer.** Replies were arriving in GHL all along (outbound mail goes out from `reply@lc.whitewater.org`, GHL's LC Email dedicated domain, whose MX points at GHL's Mailgun — not the client's `mg.whitewater.org` account). GHL folds an email thread into **one** message row whose `body` is the first email's and whose `meta.email.messageIds` lists every email, so the drawer showed a single bubble with the coordinator's own text. `listConversationMessages` now expands any row with more than one id via `GET /conversations/messages/email/{id}` (last 20 per thread, falls back to the collapsed row on a failed fetch) into one message per email with its real direction, and `stripQuotedReply` (`src/lib/ghl/html-text.ts`) drops the quoted history so only the newly typed text shows. Reply threading still uses the newest email id. |
| 2026-09-20 | **Production moved to `groupsales.whitewater.org`.** Domain added in Vercel (CNAME in the whitewater.org zone), and `whitewater-client-event-portal.vercel.app` now 308-redirects to it, so links already sent keep working. Not to be confused with GHL's *Client Portal → Domain Setup* screen: that sets the address of GHL's own clientclub.net portal and must not be given this subdomain. `lc.whitewater.org` (GHL's dedicated email sending domain) is unrelated to the app host. `docs/domain-cutover.md` carries the real domain and what is still open. |
| 2026-09-17 | **Contracts: PandaDoc catalog, tables by tax treatment, option checkboxes.** The contract form now mirrors the chosen template's pricing tables (grouped under each table's heading, read live from template details) instead of one flat item list. Rows come from the PandaDoc product catalog (new `src/lib/pandadoc/catalog.ts`, API v2; name and price locked and re-read server-side on every save) or are typed as custom rows. Each table's taxes and fees stay PandaDoc's — Food & Beverage = 22% service fee + 9.25% tax — so the form shows subtotals and the card shows PandaDoc's total. Sub-headings (pricing-table sections) carry the event day, prefilled from the event date, one per day for multi-day events, because table headings can't be set by API. Menu-style tables (EA education programs) render as checkboxes the coordinator ticks before sending. Payload switched to `data_merge: false` with standard keys, which removed the try-the-next-table fallback. `line_items` JSON gained `table`, `table_heading`, `section`, `catalog_item_id`, `sku`, `optional`, `selected` (no migration; old rows still load). Draft-table logic lives in `src/lib/contracts/draft-tables.ts` with tests. Verified against the sandbox with three draft documents (create, edit, clearing a table, renamed-column template). |
| 2026-09-17 | **Admin role shown as "Manager".** Admin → Users (role badge, dropdown, messages), the event page's Value hint, and the manual now say Manager. Display only: the stored `app_metadata.role` value, `requireAdmin`/`role === "admin"` checks, `/admin` URLs, and the "Admin" section in the dock are unchanged. |
| 2026-09-17 | **"Planner" renamed to "Coordinator" everywhere.** The non-admin role is now `coordinator` (Admin → Users shows Manager / Coordinator); all screens, the manual, merge-tag menu (`{{coordinator.name/email/phone}}`), code identifiers, and the Coordinator Assignments URL params (`?coordinator=` / `?coordinators=`) follow. `resolveRole` treats anything that isn't `admin` as a coordinator, so users whose Supabase `app_metadata.role` still says `planner` need no migration. Four stored/wire names deliberately keep the old word: the `ghl_snapshot.planner` JSON key on existing event rows, the `planner` key in the create-draft-event payload (the parser accepts `coordinator` or `planner`), and `{{planner.*}}` merge tags in already-saved templates (aliased to the coordinator tags, hidden from the menu), and the PandaDoc document tokens, which are sent under both `coordinator.*` and `planner.*` so existing PandaDoc templates keep filling. |
| 2026-09-17 | **Event summary contracts: two links.** Each contract line now shows the name as text plus **View in PandaDoc** (staff app link) and **Customer View** — the recipient's `shared_link` from PandaDoc's document details (`app.pandadoc.com/document/v2?token=…`, public, no login). `syncContractFromPandaDoc` stores it in `event_contracts.pandadoc_shared_link` (migration `20260917120000`), matching the recipient by email; PandaDoc issues it only once the document is sent and a re-send can change it, so every sync overwrites it (null while draft/awaiting approval). Existing rows were backfilled once. The link acts as the customer (marks viewed, can sign), so it is **copy-only** (`CopyableValue` with a `label`, "Copied!" pill) rather than an anchor — staff opening it would distort PandaDoc's view analytics. Staff-only surface, never rendered in the portal. Status label "Viewed by client" → "Viewed by customer". |
| 2026-09-17 | **Booking history links to PandaDoc contracts.** Their Salesforce org runs the PandaDoc managed package, so every document is a `pandadoc__PandaDocDocument__c` row tied to its Opportunity with the PandaDoc UUID. New staging table `sf_pandadoc_documents` (migration `20260917100000`, pull `--only=documents`, `sf_pull_runs.sf_object = 'pandadoc_document'`); first pull staged 6,293 documents (6,240 on an opportunity, 677 deleted in PandaDoc, 2019 → today). Company detail → Booking history lists each opportunity's documents (template name, status, admin-only total) as links into the PandaDoc app. The package's stored webhook JSON is parsed for total/sent/completed and not kept — it contains tokenized signer links. |
| 2026-09-15 | `docs/domain-cutover.md`: checklist for moving production to a whitewater.org subdomain (DNS + Vercel domain, `PORTAL_BASE_URL`, the GHL webhook action URL, PandaDoc webhook, Portal Link fields, sign-in again). Audit found no host hardcoded in code; absolute URLs come from the request host or `PORTAL_BASE_URL`. |
| 2026-09-15 | **Inquiry webhook: rejected deliveries logged, contact-id fallback.** A test submission created the GHL opportunity but no draft appeared and the integration log had no row for it — the route returned 401/400 before logging anything, so a GHL-side miss and an app-side rejection looked identical. Every rejected delivery now logs `inquiry_webhook_rejected` with the HTTP status and a summary of the received fields. A delivery whose `ghl_opportunity_id` merge field is empty is resolved from `ghl_contact_id` (the contact's newest open opportunity in the pipeline, `findNewestOpenOpportunityIdForContact`); the GHL webhook action should send `{{contact.id}}` alongside `{{opportunity.id}}`. Missing drafts are still recoverable from the New inquiry backfill list. |
| 2026-09-15 | **Docs split into two audiences.** `docs/manual.md` is the coordinator-facing user guide (roles, lifecycle how-to, screen guide, contracts, troubleshooting — no code paths, env vars, or history) and is the only doc the in-app Manual page renders. `docs/ecosystem-manual.md` became this file, `docs/developer-notes.md`: big picture, data/sync reference, PandaDoc internals, configuration, GHL-side setup (inquiry webhook action, scopes, pause checklist), and the changelog — six 2026-09-09 changelog rows that had been pasted into the section-1 table are back where they belong. `§4`/`§6` pointers in code comments now read `developer-notes.md §2`/`§4`; AGENTS.md describes both docs. |
| 2026-09-15 | **Manual in the app**: `/admin/manual` renders the user guide from the repo's `docs/` folder with `marked`, heading anchors, an "On this page" list, and doc-to-doc links rewritten to in-app routes (`src/lib/admin/manual.ts`, allowlisted docs only). A **?** icon beside the theme switch opens it in a new tab. `outputFileTracingIncludes` ships the Markdown with the Vercel function. |
| 2026-09-15 | Inquiry webhook made self-sufficient: a delivery carrying only `ghl_opportunity_id` now works — the location defaults to `GHL_LOCATION_ID` and the contact, event name, inquiry type and date of interest are read from GHL (same reader as the New inquiry backfill, `buildInquiryPayloadFromOpportunity`); fields GHL sends still win. Reason: website form submissions were reaching GHL but no draft events appeared — the workflow webhook had never reached the app (no public URL). Step 1 now documents the GHL webhook action setup and the tunnel option for local testing. |
| 2026-09-11 | Opportunities → Pipeline search: a box beside the stage tabs filters the current stage's tiles as you type (name, contact, email, phone, coordinator; highlighted matches, non-matches hidden), stage tabs switch to per-stage match counts while a term is active, empty results link to the stages that do match, and `?q=` keeps the term across stage switches. The tabs + grid moved into a client component (`pipeline-board.tsx`); data loading stays server-side. |
| 2026-09-11 | New inquiry page (`/admin/inquiries/new`): phone intake that creates the GHL contact (upsert, `inquiry-phone` tag) and opportunity (New Inquiry, web-form custom fields, coordinator) then the draft event directly, with a duplicate-opportunity guard; **Expedited** fast track (auto-ticked inside 14 days; needs email + coordinator; lands on the event page with the room-hold modal open) stored as `events.expedited` with `events.inquiry_source`; Expedited badges on event page, Events list, Opportunities cards, dashboard; expedited contract rule (unsigned inside 3 days / unpaid inside 1). Same page backfills draft events for GHL opportunities the webhook never delivered. "New inquiry" buttons on Opportunities and Events. |
| 2026-09-11 | Follow-ups pause: a pause switch on Opportunities cards, in the conversations drawer, and on the event page's contact card adds the `follow-ups-paused` tag to the GHL contact (which the chase workflows check before each send — see the section 5 checklist), writes a GHL note with who/why, and records the pause in the new `follow_up_pauses` table. Amber Paused badge + Resume. Lifted on contract signature (Booked), by the dashboard's reconcile pass when GHL shows the deal Booked/Lost/won/lost, or manually — never by a timer. New dashboard section **Paused follow-ups** lists contacts paused over 14 days with a Resume control. API: `GET`/`POST /api/ghl/contacts/[contactId]/follow-ups`. |
| 2026-09-11 | Opportunities → Pipeline: each stage tab now shows a two-column stage guide ("What's happened" / "What to do next") between the header and the cards, describing the automatic steps and the coordinator's next move for New Inquiry, Contacted, Planning, Proposal Sent, Booked, Lost, and Other. Keyed by GHL stage name (`STAGE_GUIDES`). |
| 2026-09-11 | Conversations drawer: the Email/SMS picker now defaults to the channel of the contact's most recent inbound message (first load only; DND still wins), and every thread message shows an envelope/phone/bubble icon for its channel. |
| 2026-09-11 | Conversations drawer honors GHL Do Not Disturb: the contact's `dnd` / `dndSettings` are read with the thread (`GET …/conversations` now returns `dnd`), a DND channel is removed from the Email/SMS picker with an explanatory notice (all-channel DND blocks sending entirely), and `POST …/conversations` refuses a DND channel with a 409. `GhlContactSummary` gained `dnd`. |
| 2026-09-11 | Coordinator Assignments gained a month calendar (now the default view) at the client's request: every coordinator's events on one grid, color per coordinator (the Room Calendar still colors by room), legend chips that filter by coordinator and show monthly counts, month arrows + Today, multi-day events on each day they cover. A day shows one chip per event rather than one per room; clicking opens an event summary pop-up (all rooms with times and held/booked status, "Open event" link top right for event-linked reservations), so a four-room booking is one tile. Chips fade only when every room is held. URL-driven (`?month=&coordinators=`), no client state. The original coordinator columns remain behind a Calendar/Columns toggle (`?view=columns`). |
| 2026-09-11 | Opportunities → Pipeline redesigned from a column-per-stage board to stage tabs: a row of stage tabs with counts (and the stage total for admins) above a full-width card grid for the selected stage (`?stage=<id>`, first stage by default, "Other" for orphaned stages). No more sideways scrolling or long narrow columns in season. Badge reads cover just the visible stage; the stale sweep still covers the whole pipeline. |
| 2026-09-11 | Removed "Use email template" from the conversations drawer: GHL email-builder templates are marketing designs, not customer correspondence. The drawer now only offers "Insert snippet"; the `emailTemplateId` send path, the `/emails/builder` read, and the `emails/builder.readonly` scope requirement are gone. |
| 2026-09-11 | Fix: "Insert snippet" in the conversations drawer showed no snippets. The GHL `/locations/{id}/templates` read was passing `originId=<location id>`, which GHL treats as a filter on the snippet's origin record and answered with an empty list; the parameter is dropped. Snippet merge tags also gained `{{contact.company_name}}` (used in every email snippet's subject), read from the GHL contact's company name. |
| 2026-09-09 | Client portal restyled to match the admin's light look (same tokens via a `data-theme="light"` layout scope: neutral grays, green primary buttons, red Whitewater mark, small radii, no shadows, mono labels and bordered status chips). No workflow changes. |
| 2026-09-09 | Dashboard rebuilt around daily work: vendor submissions needing approval, today's and this week's events, recently signed contracts, and a red "Needs attention" list of events within three weeks lacking a signed contract (two weeks for unpaid). The old attention/upcoming lists are gone; the metric tiles stay. |
| 2026-09-09 | End-to-end sandbox signing verified from the portal. PandaDoc templates carry a payment step: signed-but-unpaid documents (`document.waiting_pay`) now count as **Signed** in the app so the signed side effects run on signature, not payment. |
| 2026-09-09 | Event **Value** now equals the sum of the event's PandaDoc contracts (recomputed on contract create/edit/status change, mirrored to GHL `monetaryValue`). Contracts tab picks the template's pricing table with a visible Price column and uses each column's merge name (EA Group's option menu and Final Payment's renamed keys both broke the first attempt). Live check after Austin approved a doc in PandaDoc: it moved straight to *sent*. |
| 2026-09-09 | Contracts: **Edit** for unsigned contracts (same PandaDoc document moved to draft, updated, re-sent; `revision`, `revised_at`, `revised_by` columns; `contract_update` log; portal shows "Updated …" and handles a session ended by an edit). New **approval** status for templates with a PandaDoc approval workflow — portal shows *Being finalized* without a sign button; after approval in PandaDoc the sync sends it automatically (`contract_approved` log). First live verification against the sandbox API key: create/update/re-send work; pricing table rows now use PandaDoc's `Name`/`Description`/`Price`/`QTY` keys (lowercase was rejected); Salesforce-style tokens (`Client.*`, `Account.Name`, `Date__c`) filled so the existing Whitewater templates work; sandbox can only send to workspace members. Webhook and end-to-end signing still unverified (needs an approved doc + public URL). |
| 2026-09-09 | Admin restyle toward a developer-tool look (Supabase-inspired): neutral gray palette in all three themes with one green brand accent for primary actions and positive status, 4–8px radii, hairline borders and no panel shadows, and a mono uppercase label style (`type-label`) for eyebrows, table headers, metric labels and status chips. The sidebar is now a rail (icons-only when collapsed) and a new desktop top bar carries the breadcrumb, a `development` tag on local builds, the theme switch, the signed-in email and sign out (they left the sidebar footer; the mobile drawer still has them). Dashboard metric tiles gained icons. Login and reset-password screens follow the admin theme. Client portal untouched apart from the shared button/badge shapes. Tokens live in `src/app/globals.css`. |
| 2026-09-08 | PandaDoc contracts: new **Contracts** tab on the admin event page (create from a PandaDoc template with description/terms, line items + prices, recipient; full history with status, totals, PandaDoc link, signed PDF, refresh) and a **Contracts** card in the client portal with embedded PandaDoc signing. New `event_contracts` table, `src/lib/pandadoc/*` client, `src/lib/admin/contracts.ts`, `/api/pandadoc/webhook` (signed), `/api/portal/[token]/contracts/[id]` (session/complete). On signature: held reservations → booked, GHL opportunity → Booked (`GHL_BOOKED_STAGE_ID`, new `moveOpportunityToBooked`), signed PDF archived to Storage, `contract_signed` integration log. Event summary lists contracts under Portal URL. Built before the PandaDoc API key existed — unverified against the live API. |
| 2026-09-08 | Conversations drawer (event page + Opportunities cards) gained GHL snippets and email templates: "Insert snippet" pastes a GHL Snippet for the current channel into the reply box with contact/user merge tags pre-filled server-side (`src/lib/ghl/message-templates.ts`, new `/api/ghl/contacts/[contactId]/message-templates` route, 5-minute cache); "Use email template" sends a GHL email-builder template by id (`templateId` on the Conversations send, `emailTemplateId` in the POST body) so GHL renders the design. Needs the `locations/templates.readonly` and `emails/builder.readonly` scopes on the Private Integration — each menu reports its own scope error. |
| 2026-08-31 | Primary contact on the event: page-load sync now also pulls the GHL contact's name/email/phone into `ghl_snapshot.contact`, shown at the top of the Event facilitator card. New conversations drawer (speech-bubble button): full GHL email/SMS history for the contact, read live via the Conversations API, with reply-from-the-app (sends through GHL, threads into the same conversation; needs the Private Integration's write-conversations scope). New `/api/events/[eventId]/conversations` route backs it. Notes drawer beside it (notepad button + red note-count badge): reads the contact's GHL notes live and adds new ones to GHL, attributed to the GHL user matching the coordinator's email (`/api/events/[eventId]/notes`). Tasks drawer completes the trio: read, create, and check off the contact's GHL tasks like GHL natively does; badge counts open tasks. The drawer trio also sits on every Opportunities board card, backed by contact-keyed routes (`/api/ghl/contacts/[contactId]/conversations`, `/notes`, `/tasks`) shared with the event page. |
| 2026-08-31 | Salesforce staging expanded to Accounts (`sf_accounts`) and Opportunities (`sf_opportunities`) per client request; `sf_pull_runs` is per-object (`sf_object`, `records_seen`/`records_upserted`). These tables double as the permanent pre-GHL booking-history archive; no plan to push them wholesale into GHL. |
| 2026-08-31 | Reports gained a "Booked business" section: won events / won value / top companies from the Salesforce archive, on the same timeframe filter (`sf_booked_business_report` SQL function). Salesforce stopped carrying dollar amounts ~Oct 2024 (proposals moved to PandaDoc), so recent won events report $0 — the section says so. GHL cutover checklist started in roadmap.md. |
| 2026-08-31 | Event facilitator workflow: new Facilitator card on the admin event page and client portal (client submissions flagged needs review), synced to three new GHL opportunity fields (`facilitator_name/email/phone`) plus a `facilitator`-tagged GHL contact upsert so staff can message them from Conversations. App-authoritative — GHL never writes facilitator info back. Default checklist template gained a "Provide your event facilitator's contact info" section; `facilitator.*` merge tags added. Both cards have a "Same as current contact" checkbox that copies the primary GHL contact's details on save (no tagged-contact upsert in that case). |
| 2026-08-31 | Companies "Last event" fixed to mean the most recent PAST won event — it previously took max over all won opportunities, so future bookings (real "Booked" 2027 events, not bad data) displayed as the last event. The view now also exposes `next_event_date` (soonest upcoming won event): shown as a "Next event" stat on company pages and as a green "Next …" fallback in the directory list when a company has no past events yet. |
| 2026-08-31 | New Companies directory (`/admin/companies`, in the sales nav group): searchable company list + per-company detail (contacts, full booking history, duplicate-name callout). Booking stats computed live from `sf_opportunities` via the `sf_company_directory` view — "Booked" stage = won/upcoming, "Event Occured" = won/past; the Salesforce roll-ups only counted "Booked". Won value and per-opportunity amounts are admin-only. |
| 2026-08-14 | Salesforce → GHL contact migration staging: read-only Salesforce pulls into `sf_contacts` via `scripts/sf-pull.ts`, new `SALESFORCE_*` env vars. Review screen and GHL push still to come. |
| 2026-08-11 | Initial manual. Covers inquiry→launch lifecycle, coordinator reassignment on the event page, staff-coordinator-only pickers, and the new Opportunities page (pipeline board + Won tab). |
