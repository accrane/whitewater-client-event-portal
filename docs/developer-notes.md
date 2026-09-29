# Developer Notes — Whitewater Event Ecosystem

_Last updated: 2026-09-29. This is the engineering record for the portal app,
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
| **Coordinator** | `/admin` — daily event work; no Admin section, no dollar values | Supabase login, role `coordinator` |
| **Client** | `/e/<token>` — their event portal | Secure tokenized link, no login |
| **Sales** | GoHighLevel | GHL login |

Roles live in Supabase auth `app_metadata.role` and can only be changed from
Admin → Users (service role), so users can't escalate themselves. Access is
granted, not assumed: an account with no role (or an unknown one, or an
anonymous session) gets no portal access — the login page says so and a
manager assigns a role on Admin → Users, where such accounts show as
**No access**. Supabase's own "Allow new users to sign up" should stay off
(Authentication → Sign In / Providers); users are created from Admin → Users.
Every page, server action and API route checks through
`src/lib/admin/session.ts` (`getStaffUser` / `requireStaffUser`, and
`requireStaffApiUser` for `/api` routes) because the proxy only covers
`/admin` pages; the role rule itself is `src/lib/admin/roles.ts`.

---

## 2. Data and sync reference

### Where data lives

- **Supabase (Postgres)** — events (with a `ghl_snapshot` JSON mirror of the
  opportunity, plus app-only keys such as arrival time, meeting location,
  facilitator, and `eventEndDate` — the last day of a multi-day event,
  which GHL has no field for), checklist items/templates, schedule, vendors,
  uploads metadata, reservations/rooms, integration logs, portal users.
- **Supabase Storage** — client-uploaded files and archived signed
  contracts (private; coordinators get short-lived signed URLs).
- **Supabase `event_contracts`** — one row per PandaDoc contract: name,
  description, line items, subtotal, app status + raw PandaDoc status,
  document id/link, recipient, sent/viewed/signed timestamps, signed-PDF
  path, `signed_actions_applied_at` (once-only guard for the signed side
  effects), `pay_by_check_at/by` (a coordinator's "Paying by check") and
  `rooms_booked_at` (when the contract's payment booked the rooms).
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
| Admin event page load | GHL → app | Opportunity snapshot refresh (name, date, coordinator, links, counts, value). A Date of Interest that differs from the stored one shifts `eventEndDate` by the same number of days (`shiftedEventEnd`), recomputes checklist due dates, and logs `event_date_changed_in_ghl` (not on the first fill of an empty date); the event's reservations are not moved — the Room bookings section flags them as off the event's days |
| Event dates dialog ("Save dates" / "Save rooms") | app → GHL | `changeEventDatesAction` → `changeEventDates` (`src/lib/admin/event-dates.ts`). A changed first day is written to the Date of Interest (`writeOpportunityEventDate`: field by key `opportunity.date_of_interest`, else `GHL_DATE_OF_INTEREST_FIELD_ID`; `PUT /opportunities/{id}` then `GET` to confirm GHL kept it; `opportunity_event_date_write_back` log). A failed write stops the whole change. Then the snapshot takes `eventDate`/`eventEndDate`, checklist due dates are recomputed, and the room decisions run: releases first, then moves one at a time in `orderRoomMoves` order via `moveEventReservation`, then rooms the dialog adds (`newRooms`: day + venue "HH:mm" times → `venueInstant`, inserted held via `addEventReservation`). Conflicts are reported, not forced. One `event_dates_change` log row per save. Moved rooms fire no planning-stage trigger; added rooms fire it only when the event had no rooms before |
| Event summary save | app → GHL | Guest/pass/bin counts, Value |
| Facilitator save (admin or client portal) | app → GHL | Facilitator name/email/phone custom fields + `facilitator`-tagged contact upsert (one-way; GHL never writes back). "Same as current contact" saves instead read the primary GHL contact and skip the upsert |
| Conversations drawer open | GHL → app | Contact's conversations + message history, read live (never stored); threaded email rows are expanded one email at a time (`/conversations/messages/email/{id}`) so client replies show |
| Conversations drawer reply | app → GHL | Email/SMS sent via the GHL Conversations API; threads into the same GHL conversation (needs the write-conversations scope). Emails end with GHL's `{{user.email_signature}}` tag, which GHL fills with the contact's assigned user's signature, unless the coordinator unticks it (§5 Email signatures) |
| Conversations drawer snippet menu | GHL → app | Location snippets (`/locations/{id}/templates`), read live and cached 5 min per server process (never stored). Merge tags are rendered by the app before the snippet is inserted (`src/lib/ghl/snippet-merge-tags.ts`, route `/api/ghl/contacts/[contactId]/message-templates?eventId=`): GHL would fill `user.*` with the contact's assigned user rather than the sender and has no opportunity context on API sends. `contact.*` from the GHL contact, `user.*` from the signed-in user's GHL match (falling back to the event's coordinator), and `opportunity.assigned_to` / `groupevent_name` / `event_date` / `portal_link` / `proposal_link` from the event's stored snapshot + `client_portal_url` — no extra GHL call, except that a snapshot with no proposal link runs `syncEventFromGhl` once first (PandaDoc writes the field in GHL, usually after the event page was last opened). The same response carries `signer` (the contact's assigned user's name, and whether that's the signed-in user) for the drawer's signature checkbox |
| Follow-ups pause / resume | app → GHL | `follow-ups-paused` tag added to / removed from the contact (`POST`/`DELETE /contacts/{id}/tags`) plus a GHL note; the pause row lives in `follow_up_pauses` (who, when, why, how it ended). Lifted automatically on contract signature (Booked) and by the dashboard's reconcile pass when GHL shows the opportunity Booked/Lost/won/lost |
| Notes drawer open | GHL → app | Contact's GHL notes, read live (never stored); count shown as a badge on the notepad button |
| Notes drawer add | app → GHL | Note written to the GHL contact, attributed to the matching GHL user by email |
| Tasks drawer open | GHL → app | Contact's GHL tasks, read live (never stored); open-task count badges the tasks button |
| Opportunities pipeline view | local only | No GHL calls per card. Note/task badge counts come from `ghl_contact_badges`, written only when a notes/tasks drawer loads (so they can lag notes/tasks added straight in GHL — there is deliberately no background sweep). **New reply** flags come from `ghl_contact_replies` for every stage (red dot on stage tabs, badge + dot on cards). The cards' **status badges** (`buildOpportunityBadges`, `src/lib/admin/opportunity-badges.ts`) are built server-side for the stage on screen from the opportunity search (`lastStageChangeAt`, the embedded `contact.tags`), the portal event (`inquiry_source`, `expedited`, `ghl_snapshot.eventEndDate` via `getEventFlagsByOpportunityIds`), `follow_up_pauses`, and `ghl_conversation_activity` (next row) |
| Opportunities card "Move to…" | app → GHL | `POST /api/ghl/opportunities/{id}/stage` → `moveOpportunityStage` (`opportunity-sync.ts`): checks the stage is in `fetchConfiguredPipeline`, then `PUT /opportunities/{id}` with `{pipelineId, pipelineStageId}`. Status stays open (Lost is a board stage, not GHL's lost status, or the card would leave the board). Any stage is allowed; the menu shows `stageMoveNotice` (`src/lib/ghl/stage-move.ts`) for Proposal Sent (starts the Step 4 chase), Booked (no rooms booked) and Lost. A move to Lost writes a contact note with the optional reason (`lostNoteBody`, attributed via `ghlUserIdForEmail`); a failed note doesn't undo the move. One `opportunity_stage_move` log row per move (previous stage, stage, by, reason). The board moves the card between tabs as soon as the PUT succeeds and holds it there while GHL's search still reports the old stage |
| Coordinator colors (Opportunities, Coordinator Assignments) | local only | `getCoordinatorColors` (`src/lib/admin/coordinator-colors.ts`) reads `coordinator_colors` (GHL user id → color) and hands out colors to ids that have none, in the order passed (GHL `role: "user"` coordinators first, then other assignees): the first unused `COORDINATOR_PALETTE` color, then generated golden-angle hues (`pickCoordinatorColor`, `src/lib/admin/coordinator-color-rules.ts`). A unique index on `lower(color)` stops two page views giving out the same color at once; a 23505 re-reads and picks again. If the table can't be read or written, colors are worked out for that page only. The palette's first ten are the calendar's old index order, so existing calendar colors held on first seed. The calendar matches assignment names to GHL users by name; a name GHL doesn't know gets a spare color for that page only |
| Conversation activity (Opportunities view) | GHL → app | `syncConversationActivity` runs beside the pipeline reads: `GET /conversations/search?sortBy=last_message_date&sort=desc&limit=100`, paged with `startAfterDate` = the last entry's `sort[0]`, until an entry at or below the table's newest `last_message_at` (≤3 pages; ≤10 when the table is empty). Per contact, `nextActivity` (`src/lib/ghl/conversation-activity-rules.ts`) settles who wrote last from `lastMessageDirection` / `lastOutboundMessageAction` / `lastManualMessageDate`, or sets `needs_check` when an automated message followed a new person's message (the list can't say whose it was). After the response (`after()`), up to 12 unsettled board contacts, on-screen stage first, get a history look-up (`checkConversationActivity`): `GET /conversations/{id}/messages?limit=100` → newest person-written row (`readMessageHistory`: email/SMS/call/chat types whose `source` isn't workflow/bulk/campaign), preceded by `GET /conversations/search?contactId=` for contacts with no row. A look-up writes only if the row's `updated_at` hasn't changed. Nothing goes to integration_logs; failures go to the server log and the badges lag a view |
| Client replies | GHL → app | GHL workflow (Customer Replied → Webhook, §5) posts `ghl_contact_id` to `POST /api/ghl/replies` → `ghl_contact_replies.last_inbound_at`. Loading the contact's conversations drawer (or replying from it) stamps `seen_at` with the time the messages were read (never moving it backwards), so a reply that lands during the load stays flagged; the card clears its flag only once the drawer has loaded |
| Contracts tab "Save and re-send" (Edit) | app → PandaDoc | Document moved to draft, updated (name, tokens, pricing table), sent again; row gets `revision`+1, `revised_at/by`; `contract_update` log |
| Contracts tab "Create and send" | app → PandaDoc | Document created from the template (tokens + one pricing table per tax treatment from the line items, option ticks included), waited to draft, sent silently (or emailed) |
| Contract form opens / template changes | PandaDoc → app | Template details (pricing tables, headings, option and starter rows) and the product catalog, both read live and cached 5 min per server process (never stored). On save the server re-reads the catalog to set catalog rows' names and prices |
| Admin event page / Contracts tab load | PandaDoc → app | Open contracts and signed ones in `document.waiting_pay` re-read from PandaDoc (status, total); signed side effects run if newly completed, the rooms step if newly `document.paid` |
| Portal "Review and sign" | app → PandaDoc | Embedded-signing session minted for the recipient (1-hour link) |
| Portal signer completion | PandaDoc → app | `POST /api/portal/<token>/contracts/<id>` `{action:"complete"}` re-reads the document and runs the signed actions (GHL Booked, PDF archived; rooms booked only if it's already paid) |
| Contracts tab "Paying by check" | app | `setContractPayingByCheckAction` → `markContractPayingByCheck` sets `pay_by_check_at/by` on a signed, unpaid contract and runs the rooms step now; "Not paying by check" clears them (`contract_pay_by_check_cleared` log) and leaves the rooms alone |
| PandaDoc webhook | PandaDoc → app | `POST /api/pandadoc/webhook?signature=…` (HMAC-SHA256 with `PANDADOC_WEBHOOK_KEY`); each document in the delivery is re-read and synced — needs a public URL. Answers 500 when a document failed to process so PandaDoc redelivers |
| Signed-step retries | app → GHL / storage | Signed contracts with steps left in `signed_actions_pending`, never started, with no PDF on file, or paid with rooms not yet booked are retried on their own: event page load (after the response), the Contracts page sweep and Refresh statuses, 2+ minutes apart, at most 10 automatic runs (`signed_actions_attempts`); the webhook and Refresh status always retry |
| Contract signed | app → GHL | Opportunity moved to the Booked stage (`opportunity_move_to_booked`) |
| Conversations send with a "Proposal" snippet | app → GHL | Opportunity moved to Proposal Sent, forward only (`opportunity_move_to_proposal_sent`) |
| Tasks drawer create / check off | app → GHL | Task created on the GHL contact (due date required by GHL, assignee defaults to the signed-in coordinator's GHL user) or completion toggled |
| Coordinator reassign / coordinator pick | app → GHL | Opportunity `assignedTo`, then the contact's `assignedTo` (`PUT /contacts/{id}`) so the contact owner in GHL matches; logged as `opportunity_assign_coordinator` and `contact_assign_coordinator` |
| Reservation linked to event | app → GHL | Opportunity moved to Planning stage |
| Portal launch | app → GHL | Portal Link field |
| Event delete | app → GHL | Blanks Event Planning App ID + Portal Link |

**Degrade rules:** every GHL call fails quietly (logged, never blocking the
coordinator's primary action) *except* coordinator reassignment and an event
date change, which surface the error because a silent failure would revert on
the next sync. All exchanges
land in **integration_logs** (`GHL_TO_PORTAL` / `PORTAL_TO_GHL`) — that page
is the first stop when "something didn't sync."

**Outbound calls** all go through `vendorFetch` (`src/lib/http/vendor-fetch.ts`;
GHL via `ghlFetch` in `src/lib/ghl/client.ts`): every request has a timeout
(GHL 15 s, PandaDoc 20 s / 60 s for PDFs, Salesforce 30–60 s, Mailgun 15 s), so
a hung vendor fails fast instead of holding a page until the platform kills
it. GET/PUT/DELETE retry up to twice on 429/502/503/504, honouring
`Retry-After` up to 5 s; POSTs never retry (they create notes, messages,
documents). A timeout surfaces as "GHL did not respond within 15s".

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

The app sends **only staff emails** (password resets and
coordinator-assignment notices), via Mailgun (`mg.whitewater.org`). All
client-facing email/SMS is GHL's job; emails from the conversations drawer
carry the assigned coordinator's GHL signature (§5 Email signatures).

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
  `event.type`, `event.date` (the whole span for a multi-day event, like
  `Date__c`), `event.start_date`, `event.end_date`, `event.arrival_time`, `event.meeting_location`,
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
  refresh, portal signer completion, and the webhook.
- **Signed side effects** (`applySignedContractActions`): four independent
  steps — `reservations` (rooms booked), `ghl_stage` (opportunity → Booked),
  `follow_ups` (pause lifted), `signed_pdf` (executed PDF archived). The
  signature runs all but `reservations`: the rooms wait for the contract's
  first payment (`contractPaymentReceived` — PandaDoc `document.paid`, or
  `pay_by_check_at` set by a coordinator), then that step runs once per
  contract and stamps `rooms_booked_at`; a failed try keeps it due while
  the contract is paid (`signedContractStepsToRun`). A run
  first takes a lease (`signed_actions_running_until`, set only while empty
  or expired, 5 minutes, cleared when the run ends), so the webhook, the
  signer and a page load can't run the same steps at once; the steps are then
  decided from the freshly claimed row and recorded as pending before any
  runs. Steps that fail go into
  `signed_actions_pending` and only those re-run later
  (`retryPendingSignedContracts`) — a finished step never repeats, so rooms a
  coordinator changes after payment aren't re-booked. A signed contract with
  no PDF on file always counts as having the PDF step left
  (`signedContractStepsToRun`), which also catches contracts signed before
  steps were tracked. A "skipped" outcome
  (no linked opportunity, stage env var unset) counts as finished. The event's
  Contracts tab lists pending steps as **Still to do**; every run logs
  `contract_signed` (first), `contract_paid` (the rooms step's first try
  after payment or "Paying by check"), or `contract_signed_retry`.
- **Webhook:** register `https://<app>/api/pandadoc/webhook` in PandaDoc for
  *document_state_changed* and *recipient_completed*, and put the shared key
  in `PANDADOC_WEBHOOK_KEY`. *document_state_changed* is also how a
  payment (`waiting_pay` → `paid`) arrives quickly; without the webhook the
  page-load syncs of `waiting_pay` contracts catch it on the next event or
  Contracts page view.
- **PandaDoc payments:** the standard templates have a payment step, so
  after the client signs, PandaDoc's signer moves on to "pay" and the
  document sits in `document.waiting_pay` until paid (`document.paid`). The
  app treats *waiting_pay* as **Signed** (GHL Booked, PDF archived) and
  `document.paid` as the payment that books the rooms. PandaDoc's details API
  exposes no payment fields, so the status is the only signal; "Mark as
  paid" in PandaDoc produces the same `document.paid`. A template with no
  payment step goes straight to `document.completed`, which is never a
  payment: its rooms wait for "Paying by check" or a manual booking.
  **Installments** would break "first payment": PandaDoc keeps the document
  in *waiting_pay* until the last installment is paid. The templates use
  one-time payments plus separate Final Payment documents (checked
  2026-09-24), so this doesn't arise today.
- **Paying by check:** a coordinator-only switch on a signed, unpaid
  contract (`markContractPayingByCheck`) counts as the payment and books the
  rooms at once. The contract stays *waiting_pay* in PandaDoc until someone
  marks it paid there, so the dashboard shows it as **Signed, check pending**
  (`contractDeadlineState` → `check_pending`) rather than plain unpaid.
- **Payment status** on the event is still the GHL-synced field; the
  contract-level note (`contractPaymentLabel`: Paid / Paying by check /
  Payment pending / No PandaDoc payment) is what the event page, dashboard
  and Contracts page show.

---

## 4. Configuration quick reference

All in `.env.local` (see `src/lib/env.ts` for the full list):

| Variable | Breaks what when missing/invalid |
| --- | --- |
| `GHL_ACCESS_TOKEN` / `GHL_LOCATION_ID` | All GHL sync; coordinator dropdowns fall back to read-only; Opportunities page shows empty states |
| `GHL_WEBHOOK_SECRET` | Inquiry and reply webhooks reject deliveries (sent as the `x-portal-webhook-secret` header) |
| `GHL_PIPELINE_ID` / `GHL_PLANNING_STAGE_ID` | Planning-stage moves; Opportunities pipeline board |
| `GHL_BOOKED_STAGE_ID` | Contract-signed move to the Booked stage (logged as a skipped warning when missing) |
| `PANDADOC_API_KEY` | Contracts tab can't create documents; portal shows no signing; template picker explains |
| `PANDADOC_TEMPLATE_ID` | No default template preselected (coordinators pick one per contract) |
| `PANDADOC_WEBHOOK_KEY` | Webhook deliveries rejected (401); signer completion + page refresh still work |
| Field id vars (`GHL_OPPORTUNITY_EVENT_FIELD_ID`, `GHL_PORTAL_LINK_FIELD_ID`, `GHL_DATE_OF_INTEREST_FIELD_ID`) | The respective field reads/writes |
| Supabase vars | Everything — auth, data, storage |
| `SUPABASE_STORAGE_BUCKET` | Where signed contract PDFs are archived (defaults to `event-uploads`; production uses `event-portal-uploads`). Must name a bucket that exists: in September 2026 archives failed with `Bucket not found` because the Vercel value was wrong (first another variable's name, then a typo). Contracts missing a PDF retry on their own once it's right |
| `MAILGUN_API_KEY` | Password-reset and coordinator-assignment emails (with `MAILGUN_DOMAIN`, `EMAIL_FROM`) |
| `EMAIL_FROM` | Every email. Format `USNWC Event Portal <no-reply@mg.whitewater.org>`. In Vercel enter it **without** surrounding quotes: `.env.local` quotes are stripped when loaded, but Vercel keeps them, and Mailgun then rejects the sender ("from parameter is not a valid address") |
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

### Customer replied webhook (GHL → app)

Drives the **New reply** flag on Opportunities cards and stage tabs (§2).
One workflow per environment:

- Trigger **Customer Replied** (any reply channel).
- Action **Webhook**, method `POST`, URL
  `https://groupsales.whitewater.org/api/ghl/replies`.
- Header `x-portal-webhook-secret` = the app's `GHL_WEBHOOK_SECRET` (same as
  the inquiry webhook).
- Custom data `ghl_contact_id` = `{{contact.id}}` (the route also accepts
  GHL's default `contact_id`).

It fires on every inbound message, so the route stays quiet: rejected
deliveries (401 bad secret, 400 no contact id) go to the server log, not
integration_logs. A 500 means the database write failed and GHL may retry.
To check it end to end, reply to a test contact and watch the card.

### Private Integration scopes and follow-up pauses

**Private Integration scopes** the token needs beyond the basics (Settings →
Private Integrations in GHL): *write conversation messages* (drawer replies),
*view templates* / `locations/templates.readonly` (snippet menu), *edit
contacts* / `contacts.write` (follow-ups pause tag, contact owner on coordinator
assignment). Each missing scope
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

**Contact owner backfill.** Coordinators assigned before 2026-09-23 were
written only to the opportunity, so their contacts showed *Unassigned* in
GHL. `scripts/backfill-contact-assignments.ts` catches up every contact from
the pipeline's open and won opportunities (`--include-closed` adds lost and
abandoned; `planContactAssignments` in `src/lib/ghl/contact-assignment.ts`
picks the newest open opportunity per contact). Dry run by default,
`--apply` writes, re-runs skip contacts already on the right user:

```
npx tsx --env-file=.env.local scripts/backfill-contact-assignments.ts --apply
```

Run against production on 2026-09-23 (3 contacts updated). Reassigning in
GHL itself still only changes the opportunity; the contact owner follows
only assignments made in the portal.

---

### Step 3 coordinator chase (tag trigger)

GHL's workflow **"Group Sales Inquiry: Step 3 – Coordinator Follow-Up"**
used to start on the *User Replied* trigger, which only fires for a message
a user types in GHL's own Conversations screen. Portal sends go through
`POST /conversations/messages` as the location, not a user, so the chase
never started from the drawer. Cathy rebuilt the workflow on 2026-09-21:

1. **Trigger:** Contact Tag → *Tag added* includes `coordinator-intro-sent`.
2. **Remove Tag** `coordinator-intro-sent` (first action, so a later intro
   email can re-add it and re-enrol the contact).
3. Add tag *Group Sales - Step 3 Waiting for Response*, wait 48 hours,
   conditions, chase email (unchanged). Allow re-entry, allow multiple
   opportunities, stop on response, published.

The portal's side (2026-09-22): the conversations drawer sends the names of
the snippets inserted into a message (`snippetNames`), and
`sendConversationMessage` adds the tag after a successful send when any
name contains **"EC Welcome"** (or the older "Event Coordinator Welcome") —
rule in `src/lib/ghl/coordinator-intro.ts`. Logged as
`coordinator_intro_tag`. Rename a snippet away from that phrase and it
stops starting the chase. Known gaps, deliberately left: a contact still
enrolled is skipped on re-entry (a second intro inside 48h doesn't restart
the clock), and *Stop on response* only sees replies to messages the
workflow itself sent, so a client answering the portal's intro during the
wait may still be chased — both fixed in GHL by replacing *Wait 48 hours*
with a wait that ends on reply or timeout.

### Step 4 proposal chase (stage trigger)

GHL's proposal chase triggers when the opportunity enters **Proposal
Sent**; the workflow itself needs no change. The portal moves the stage
(2026-09-22) after a successful drawer send whose `snippetNames` include
one containing **"proposal"** (rule in `src/lib/ghl/proposal-sent.ts`),
not on PandaDoc approval: approval only produces the link, and a chase for
a proposal the client never received would be wrong. The stage is found
by name in the configured pipeline (no env var), the opportunity is the
card the drawer was opened from, else the portal event's
`ghl_opportunity_id`, and it must belong to the message's contact. It
only moves forward from New Inquiry / Contacted / Planning; Proposal Sent,
Booked, and Lost are left alone. Logged as
`opportunity_move_to_proposal_sent`; a failure never fails the send.
Renaming the stage or the snippets away from "proposal" breaks it.

### Chase tags (card badges)

The Opportunities cards name the GHL chase a contact is on from the
contact's tags: any tag matching *Step N … Waiting for Response* (GHL
stores tags lower-cased), read by `chaseFromTags` in
`src/lib/admin/opportunity-badges.ts` from the opportunity search's embedded
contact (no extra call). Step 1 → **Inquiry chase**, Step 3 → **Coordinator
chase**, Step 4 → **Proposal chase**, any other step → "Step N chase"; the
highest step wins when several are present. The badge is grey while the
contact's follow-ups are paused and amber on a Booked or Lost deal (a tag
the Booked/Lost workflow should have removed).

GHL-side setup (someone with workflow access; the portal only reads):

1. **Step 1: Form Submission** and **Step 4: Proposal**: first action *Add
   Contact Tag* `Group Sales - Step 1 Waiting for Response` /
   `Group Sales - Step 4 Waiting for Response`; last action *Remove Contact
   Tag* (the same tag). Step 3 already adds `Group Sales - Step 3 Waiting
   for Response`; check that it removes it when the chase ends.
2. **Client replies** (Step 3: Client Replied): remove all three tags, and
   remove the contact from the Step 1, 3 and 4 workflows. *Stop on
   response* only sees replies to the workflow's own emails: on 2026-09-24
   a test client who answered the portal-sent proposal still got two
   Step 4 reminders afterwards.
3. **Booked/Lost - Remove from Chase**: also remove the three tags.

Not yet verified live: how quickly a tag change reaches the opportunity
search's embedded contact. Check it the first time a chase tag is added.

### Email signatures

Each coordinator's signature is set in GHL only (Settings → My Staff → edit
the user → Email Signature). Emails sent from the conversations drawer end
with GHL's `{{user.email_signature}}` tag (`appendEmailSignature`, added in
`sendConversationMessage`), and GHL fills it as the email goes out. Found
with two test sends to Austin's own contacts on 2026-09-24:

- The public API can't read a signature. `GET /users/{id}`, `GET /users/`,
  and `GET /users/search` all leave it out after one is saved, and no
  signature endpoint exists, so the drawer names whose signature it will
  be instead of previewing it.
- GHL merge-renders Conversations API emails, using the contact and the
  **contact's assigned user** as `{{user.*}}`. A `userId` in the send is
  ignored for email (the message is recorded under the assigned user), so
  the signature is the assigned coordinator's whoever sends. An assigned
  user with no signature renders as nothing; the route skips the tag for
  a contact with nobody assigned.
- GHL added no signature of its own to the API sends. If emails ever show
  two, check the user's "Enable signature on all outgoing messages" box.

The contact owner only follows coordinator assignments made in the portal
(see the backfill note above), so reassigning an opportunity in GHL keeps
the old coordinator's signature on that contact's emails until the contact
is reassigned too. The email snippets still end with a typed sign-off
(`{{user.first_name}}` or `{{opportunity.assigned_to}}`, then "Whitewater
Group Sales Team") that now sits right above the signature; trimming it is
a snippet edit in GHL.

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
| 2026-09-29 | **`{{opportunity.proposal_link}}` in snippets.** The drawer now fills it from `ghl_snapshot.links.proposal` (`SnippetMergeContext.event.proposalLink`). A coordinator had put it in a proposal snippet and it went out unfilled: the portal didn't know the tag, and GHL blanks opportunity tags on API sends. When the snapshot has no link and the event has an opportunity, the message-templates route re-syncs the event from GHL once before rendering. Test in `tests/admin/snippet-merge-tags.test.mjs`. |
| 2026-09-29 | **Coordinator colors on the Opportunities board.** Each card has a tab above it with the coordinator's name on their color, continuing as a 4px left border (unassigned: a grey "Unassigned" tab and `UNASSIGNED_COLOR` border; a GHL user no longer listed: slate). Cards are now sorted by Date of Interest, soonest first, undated last (client-side, so moved cards sort too); before, they were in GHL's search order. A legend above the grid (`CoordinatorLegend` in `pipeline-board.tsx`) shows one chip per coordinator with the stage's count, under the search and every filter except coordinator. Chips toggle the existing coordinator filter, so the stage tabs' match counts show where that coordinator's cards are. Colors are stored per GHL user in the new `coordinator_colors` table (migration `20260929100000`, §2) and shared with the Coordinator Assignments calendar, which no longer colors by list index (`coordinatorColor` and the palette left `coordinator-calendar.tsx`; the calendar reads `listGhlUsers` once and filters coordinators itself). `BoardCoordinator` gained `color`. Tests: `tests/admin/coordinator-color-rules.test.mjs`. |
| 2026-09-29 | **Move opportunities between stages from the board.** Each pipeline card has a **Move to…** button (`OpportunityStageMenu`, `src/components/admin/opportunity-stage-menu.tsx`) listing every other stage; confirming posts to the new `/api/ghl/opportunities/[opportunityId]/stage` route → `moveOpportunityStage` (§2). Drag-and-drop was ruled out: the board shows one stage tab at a time. Every stage is allowed, with a notice before confirming for Proposal Sent, Booked, and Lost (`stageMoveNotice`); Lost takes an optional reason that becomes a contact note (`lostNoteBody`). `PipelineBoard` keeps client-side overrides (`moves`, keyed by opportunity, holding only while the server still has the card in the stage it left) so the card changes tab immediately, then `router.refresh()`es. `ghlUserIdForEmail` is now exported from `follow-up-pauses.ts`. Stage guides and the **Date passed** badge now point to the move button instead of GHL. Rules and tests: `src/lib/ghl/stage-move.ts`, `tests/ghl/stage-move.test.mjs`. |
| 2026-09-25 | **Opportunities card badges.** A right-hand column of status badges on each card, in a fixed order (`buildOpportunityBadges`, `src/lib/admin/opportunity-badges.ts`, tests in `tests/admin/opportunity-badges.test.mjs`): conversation (**Client waiting** — the newest person-written message is the client's, blue under 24 h then red; **Not contacted** — a New Inquiry website inquiry over 24 h old with no person-written message; **Quiet Nd** — staff wrote last by hand, amber ≥5 days, red ≥10, selling stages only, not while paused), timing (**Event in Nd/tomorrow/today/under way** before Booked, amber ≤21 days, red ≤7; **Date passed** on open deals, using the portal's `eventEndDate` for multi-day events), intake (**Expedited**/**Phone**, moved into the column), stage age (amber past `STAGE_AGE_LIMIT_DAYS`: New Inquiry 2, Contacted 7, Planning 7, Proposal Sent 14, from the search's `lastStageChangeAt`), and the chase from GHL's *Step N Waiting for Response* tags (§5 Chase tags). **New reply** stays and shows only without Client waiting. Who wrote last lives in the new `ghl_conversation_activity` table (migration `20260925100000`), synced from GHL's conversation list once per board view with history look-ups after the response (§2; `src/lib/ghl/conversation-activity.ts`, rules in `conversation-activity-rules.ts`, tests in `tests/ghl/conversation-activity-rules.test.mjs`). The card grid now fits columns to the width (`repeat(auto-fill, minmax(min(100%, 22rem), 1fr))`) so the badge column always leaves room for the name; `Tooltip` gained `align="end"` and `wrap`, and the pause button's tooltips hang left of it (they overflowed the page on the right-hand cards). `GhlPipelineOpportunity` gained `lastStageChangeAt` and `contactTags`; `EventFlags` gained `eventEndDate`. |
| 2026-09-24 | **PandaDoc staff links are managers-only.** Contracts are approved in PandaDoc and coordinators may not approve their own, so coordinators no longer see the staff PandaDoc link: the event page's **View in PandaDoc** (rendered only when `getUserRole` is `admin`), the event Contracts tab's **Open in PandaDoc** (`pandadocUrl` nulled server-side for coordinators, so the URL isn't in the page at all), and the Contracts page's PandaDoc column with **Approve/Open/View in PandaDoc** (`showPandaDocLinks`). Coordinators keep **Customer View**. The company history's links to archived Salesforce-era PandaDoc documents are unchanged. This hides links only: approval rights are PandaDoc's own workflow setting. |
| 2026-09-24 | **Change an event's date; multi-day events.** The event page's header date (and a new **Dates** row in Event summary) opens a dates dialog (`src/app/admin/events/[eventId]/event-dates-dialog.tsx`): first day, optional last day, and a row per reservation choosing its target day (the same day of the event by default — `defaultRoomMoves`), room, "leave on its old date", or release. It reads `GET /api/calendar/reservations` for the new window and flags conflicts against other events and the event's own rooms at their final positions; Save is blocked while any remain. Server: `changeEventDates` (§2 sync table); new `moveEventReservation` / `releaseEventReservation` in `room-calendar.ts` are scoped to the event and name the conflicting booking. `ghl_snapshot.eventEndDate` (app-only, no migration) holds a multi-day event's last day; `AdminEventListItem`, `ClientPortalEvent`, the contracts list, merge-tag context, and the assignment email carry it. Date and venue-time logic is import-free in `src/lib/dates/event-dates.ts` (`VENUE_TIME_ZONE` = America/New_York: moves keep wall-clock times across DST; `orderRoomMoves` sequences moves so an event holding the same room on consecutive days can shift without tripping the overlap constraint; swaps are reported as blocked). Tests: `tests/admin/event-dates.test.mjs`. Also: checklist due dates recompute from `due_offset_days` on any date change (`recomputeChecklistDueDates`); a GHL-side date change shifts the end date and logs `event_date_changed_in_ghl`; Room bookings groups a multi-day event's rooms by day and flags **Not an event day** with a **Move rooms** shortcut; its times are now formatted in venue time (the old `formatReservationTimes` used the server's zone, UTC on Vercel). **Add room** offers day chips for a multi-day event and posts one reservation per day, blocking a save with a known overlap; each day heading under Room bookings has its own Add room (`initialDays`). The dialog also adds rooms: an **Add a room** row (day, room, start/end; defaults to the first day without rooms, the event's first room if free then, else the first free room) and a **Same room on …** shortcut per room that copies it to the event days lacking it; rows are conflict-checked with everything else and saved held (`ChangeEventDatesInput.newRooms`, outcome `added`, failures keyed `key`). `TimeSelect` is shared from `event-room-bookings.tsx`; `venueInstant` / `venueTime` / `isVenueTime` join `event-dates.ts`. Dashboard: in-progress multi-day events count as today ("Day 2 of 3"), `listUpcomingLaunchedEvents` also matches on `eventEndDate`, and the upcoming metric counts to the last day. PandaDoc tokens: `event.date` and `Date__c` send the span for multi-day events; new `event.start_date` / `event.end_date`. Contract sub-heading boxes suggest each event day (create and edit), and **Add another group** starts with the next day. Snippet `{{opportunity.event_date}}` and `{{event.date}}` render the span. |
| 2026-09-24 | **Rooms book on the first payment, not the signature.** Migration `20260924130000` adds `event_contracts.pay_by_check_at`, `pay_by_check_by`, `rooms_booked_at`, backfilling `rooms_booked_at` for contracts already signed (their rooms booked at signature under the old rule). `signedContractStepsToRun` now leaves `reservations` out of the signature run and makes it due once `contractPaymentReceived` (PandaDoc `document.paid`, or `pay_by_check_at`) and until `rooms_booked_at` is stamped (`src/lib/contracts/shared.ts`, tests in `tests/admin/contract-signed-steps.test.mjs`). Page-load syncs (`syncEventContracts`, `syncOpenContracts`) now also re-read `document.waiting_pay` contracts so a payment is caught without the webhook; the retry sweep includes paid contracts whose rooms aren't booked. New coordinator-only **Paying by check** on the Contracts tab (`markContractPayingByCheck` / `clearContractPayingByCheck`, `setContractPayingByCheckAction`) books the rooms at once; undoing it leaves rooms alone. Logs: `contract_paid`, `contract_pay_by_check_cleared`; `contract_signed` messages say whether rooms booked. Payment notes (`contractPaymentLabel`) on the event page's Contracts line, the dashboard's recently signed list, and the Contracts page; dashboard state `check_pending` ("Signed, check pending"). **Refresh status** shows on signed-unpaid contracts. The portal's thank-you says rooms are confirmed once the first payment is received (`ClientContract.paymentReceived`). The GHL opportunity still moves to Booked at signature. |
| 2026-09-24 | **Email signatures from GHL.** Drawer emails end with GHL's `{{user.email_signature}}` tag (`appendEmailSignature` in `src/lib/ghl/snippet-merge-tags.ts`, applied by `sendConversationMessage` when `includeSignature` is set; never twice if the message already has the tag). The conversations route sets it unless the POST body says `includeSignature: false`, and skips contacts with nobody assigned; the integration log records `signature` on email sends. The message-templates route returns `signer` (`{ name, isSender }`, from the contact's `assignedTo`) so the checkbox beside Send names whose signature it is. `findUnfilledMergeTags` no longer flags the signature tag. The two test sends behind it (§5 Email signatures) also showed that GHL does merge-render API sends — contact tags from the contact, `user.*` from the contact's assigned user — correcting the 2026-09-21 note below; opportunity tags still go out blank. Tests in `tests/admin/snippet-merge-tags.test.mjs`. |
| 2026-09-24 | **Review follow-ups (Greptile on PR #1).** Signed-contract runs now hold a lease (`signed_actions_running_until`, migration `20260924120000`) instead of an `updated_at` check, which let a sync that wrote the row first claim a run already in progress. Reply "seen" is the time the conversation was read (captured before the GHL call) and only moves forward; the card's flag clears after the drawer loads, not on click. `listUpcomingLaunchedEvents` pages by exact count past the API's max-rows. `vendorFetch` re-wraps response bodies so a timeout while reading one reports "… did not finish responding within Ns" (tests in `tests/http/vendor-fetch.test.mjs`). |
| 2026-09-24 | **Audit fixes (security, reliability, scale).** From the 2026-09-23 read-only audit's "fix first" list. (1) **Staff access is granted, not assumed:** `getUserRole` (`src/lib/admin/roles.ts`) returns null for an account without an `admin`/`coordinator` role or an anonymous session; proxy, login, and every page/action/API route check through the new `src/lib/admin/session.ts` (`getStaffUser` is `cache()`d per request; the calendar-api guard, which only checked sign-in, is now `requireStaffApiUser`). Admin → Users shows role-less accounts as **No access** with a required role picker. Supabase public sign-up was found enabled; turn it off in the dashboard. (2) **Rich text is sanitized** (`src/lib/html/sanitize.ts`, `sanitize-html`): schedule notes and checklist FAQ HTML on every save and load — formatting, lists, links (new tab, noopener) and https/data-URL images kept; styles, classes, scripts, handlers, iframes and forms removed; output matches the browser's serialization so untouched notes don't look edited. Tests: `tests/html/sanitize.test.mjs`. (3) **Timeouts and 429 retries** on every vendor call (`vendorFetch`, §2); `updateGhlOpportunity` returns a failure instead of throwing. Tests: `tests/http/vendor-fetch.test.mjs`. (4) **Signed-contract steps retry** (§3): migration `20260924100000` adds `signed_actions_pending` / `signed_actions_attempts` and queues `signed_pdf` for signed contracts whose PDF never archived; any signed contract with no PDF on file counts as having that step left (`signedContractStepsToRun`); Contracts tab shows **Still to do**; the PandaDoc webhook answers 500 on a failed document. Tests: `tests/admin/contract-signed-steps.test.mjs`. (5) **New reply flags replace the badge sweep:** the pipeline's background note/task sweep (up to 120 GHL calls a view, over GHL's burst limit) is gone; a GHL Customer Replied workflow (§5) posts to `/api/ghl/replies` (migration `20260924110000`, table `ghl_contact_replies`, `src/lib/ghl/replies.ts`, rules in `reply-flags.ts`, tests `tests/ghl/reply-flags.test.mjs`); cards show **New reply** and a dot on the conversations button, stage tabs a red dot; opening the drawer clears it. (6) **No more 50-event cap:** `listAdminEvents` is gone. The Events page pages 50 at a time with filter, search (event name, type, coordinator) and tab counts in SQL (`listAdminEventsPage`, `?page=`); the dashboard reads every upcoming launched event (`listUpcomingLaunchedEvents`, served by `events_status_event_date_idx`) plus the events its lists point at (`listAdminEventsByIds`). |
| 2026-09-23 | **Coordinator assignment also sets the GHL contact owner.** `assignOpportunityCoordinator` (`src/lib/ghl/opportunity-sync.ts`) now follows a successful opportunity `assignedTo` write with `assignContactUser(contactId, ghlUserId)` (`src/lib/ghl/contacts.ts`, `PUT /contacts/{id}`) on the event's `ghl_contact_id`, so every portal path (reservation modal, event page reassign, phone intake) keeps the contact's Assigned To in step with the coordinator. Logged as `contact_assign_coordinator` (warning when the event has no contact id; an error there doesn't undo the opportunity assignment). `GhlContactSummary` gained `assignedTo`. One-time catch-up for existing contacts: `scripts/backfill-contact-assignments.ts` (§5), run in production the same day. Planner rules in `src/lib/ghl/contact-assignment.ts`, tests in `tests/ghl/contact-assignment.test.mjs`. |
| 2026-09-22 | **Proposal snippets move the opportunity to Proposal Sent.** After a successful drawer send with a snippet named "…proposal…", `sendConversationMessage` calls `moveOpportunityToProposalSent` (`opportunity-sync.ts`): opportunity from the new `opportunityId` the pipeline card passes to the drawer, else the event's `ghl_opportunity_id`; GETs it, checks the contact, resolves the Proposal Sent stage by name from `fetchConfiguredPipeline`, and only moves forward (`shouldMoveToProposalSent`). Rules and tests: `src/lib/ghl/proposal-sent.ts`, `tests/ghl/proposal-sent.test.mjs`. Stage guide no longer tells coordinators to move it in GHL (§5). |
| 2026-09-22 | **EC Welcome snippets start the Step 3 chase.** The drawer tracks which GHL snippets were inserted into the message (cleared when the box is emptied or sent) and posts their names; the route passes `snippetNames` to `sendConversationMessage`, which after a successful send adds `coordinator-intro-sent` to the contact when any name contains "EC Welcome" / "Event Coordinator Welcome" (`src/lib/ghl/coordinator-intro.ts`, tests in `tests/ghl/coordinator-intro.test.mjs`), logged as `coordinator_intro_tag`. The pause feature's tag write moved to a shared `setContactTag(contactId, tag, present)` in `src/lib/ghl/contact-tags.ts`. GHL workflow already retriggered on the tag by Cathy (§5). |
| 2026-09-22 | **Contracts page** (`/admin/contracts`, nav under Events). All `event_contracts` across events (`listAllContracts`, two queries: contracts + their events' snapshots) in Open / History tabs (`contractTab`: draft/creating/approval/sent/viewed/error are open), sorted approvals-first so the manager's only manual step is on top, each row linking straight into the PandaDoc document (`pandaDocDocumentUrl`) — approval stays in PandaDoc because a coordinator must not approve their own contract, so the document owner is left as the API user. GET-form filters: search (contract/event/customer/coordinator), coordinator (managers; "My events" via `resolveCurrentCoordinator`, now in `src/lib/admin/current-coordinator.ts` and shared with the dashboard), status group (`CONTRACT_STATUS_GROUPS`, per tab), event date. Coordinators are scoped to their own events (`isCurrentCoordinatorsEvent`) before filtering; a login with no coordinator match sees an explanation. Statuses: `syncOpenContracts(limit)` re-reads the least-recently-updated open contracts from PandaDoc — 25 in `after()` on every load, 60 synchronously on **Refresh statuses** (`?refresh=1`) — and re-sums event value where a status changed. Filter logic in `event-filters.ts` (contracts section), tests in `tests/admin/contract-list-filters.test.mjs`. Dollar amounts manager-only. |
| 2026-09-22 | **Snippet lists survive the drawer.** GHL's editor emits `<li><p>…</p></li>`, so `htmlToText` was producing a blank paragraph per bullet and no marker, and the send path wrapped each in its own `<p>`. `htmlToText` (`src/lib/ghl/html-text.ts`) now unwraps those, prefixes `<li>` with `•` (numbers `<ol>` items), keeps link addresses as `text (url)`, puts table cells on their own lines, and trims nbsp-only lines. New `textToEmailHtml` (used by `sendConversationMessage`) is its inverse: bullet/`-`/`*` lines → `<ul>`, `1.` lines → `<ol>`, bare URLs linked, text escaped (it wasn't before). Inbound emails, notes, and tasks in the drawers get the same bullet rendering. Tests: `tests/ghl/html-text.test.mjs`. |
| 2026-09-22 | Opportunities cards title with the **Group/Event Name** field (fallbacks: Company/Organization Name, then opportunity name) and show the company on its own line under the contact. GHL names a form inquiry's opportunity after the contact, so cards were showing the contact's name twice; lines identical to the title are omitted. Search matches group and company names too. |
| 2026-09-22 | Manual: added **Adding a new coordinator** under section 1 (GHL Settings → Staff with the User role, permissions copied from Sarah; portal login under Admin → Users with the matching email). The dropdown filter behind it is `listGhlCoordinatorUsers` (`role === "user"`). |
| 2026-09-22 | **Coordinator assignment email.** Assigning a coordinator anywhere in the portal (reservation modal, event page reassign, phone intake) now emails them through Mailgun with the event name, date, type, contact, guest count, who assigned them, and a link to the admin event page. Hooked into `assignOpportunityCoordinator` (`src/lib/ghl/opportunity-sync.ts`), which every path already uses: after the GHL write succeeds it schedules `notifyCoordinatorAssigned` (`src/lib/email/notify-coordinator-assigned.ts`) with Next's `after()` so the save isn't slowed. Skipped silently when the coordinator is unchanged (`ghl_snapshot.planner.id` before the write) or when the assigner's login email is the coordinator's GHL email; logged as a `coordinator_assigned_email` warning when the GHL user has no email or Mailgun isn't configured, error on a failed send, success otherwise. Template in `src/lib/email/coordinator-assigned.ts` (`tests/email/coordinator-assigned.test.mjs`). Needs `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `EMAIL_FROM` in production (see §4). |
| 2026-09-22 | **Opportunities cards: original-inquiry pop-up and tooltips.** A form icon on each card opens a modal with the inquiry as recorded on the opportunity's custom fields (contact, company, group name, inquiry type, location, date of interest, guests, activity interest, the five quick questions, message) plus the submission time (`createdAt`) and source (form vs phone, from `eventFlags`). Read in the same search sweep as the cards — `searchPipelineOpportunities` now returns `inquiry: OpportunityInquiry`; no per-card calls. `INQUIRY_FIELD_IDS` moved to the import-free `src/lib/ghl/inquiry-fields.ts` (re-exported from `phone-inquiries.ts`) so the reader can use it without a cycle; `findFieldText` in `field-values.ts` joins checkbox arrays. New `Tooltip` primitive (`src/components/ui/tooltip.tsx`, CSS hover/focus) replaces the native `title` on the conversations, notes, tasks, pause, and Paused/Resume controls everywhere they appear. |
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
