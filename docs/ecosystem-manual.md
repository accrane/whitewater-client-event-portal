# Whitewater Event Ecosystem Manual

_Last updated: 2026-09-09. This is a **living training manual** for the whole
event ecosystem: this portal app, GoHighLevel (GHL), and PandaDoc. When a
feature ships, update the relevant section and the changelog at the bottom —
treat doc updates as part of the feature, not an afterthought._

Related references (kept separate on purpose):

- [ghl-custom-fields.md](ghl-custom-fields.md) — the authoritative field-by-field
  list of every GHL custom field the app reads/writes, with field ids.
- [roadmap.md](roadmap.md) — planned work.

---

## 1. The big picture

Three systems, three jobs:

| System | Job | Owns |
| --- | --- | --- |
| 2026-09-09 | Client portal restyled to match the admin's light look (same tokens via a `data-theme="light"` layout scope: neutral grays, green primary buttons, red Whitewater mark, small radii, no shadows, mono labels and bordered status chips). No workflow changes. |
| 2026-09-09 | Dashboard rebuilt around daily work: vendor submissions needing approval, today's and this week's events, recently signed contracts, and a red "Needs attention" list of events within three weeks lacking a signed contract (two weeks for unpaid). The old attention/upcoming lists are gone; the metric tiles stay. |
| 2026-09-09 | End-to-end sandbox signing verified from the portal. PandaDoc templates carry a payment step: signed-but-unpaid documents (`document.waiting_pay`) now count as **Signed** in the app so the signed side effects run on signature, not payment. |
| 2026-09-09 | Event **Value** now equals the sum of the event's PandaDoc contracts (recomputed on contract create/edit/status change, mirrored to GHL `monetaryValue`). Contracts tab picks the template's pricing table with a visible Price column and uses each column's merge name (EA Group's option menu and Final Payment's renamed keys both broke the first attempt). Live check after Austin approved a doc in PandaDoc: it moved straight to *sent*. |
| 2026-09-09 | Contracts: **Edit** for unsigned contracts (same PandaDoc document moved to draft, updated, re-sent; `revision`, `revised_at`, `revised_by` columns; `contract_update` log; portal shows "Updated …" and handles a session ended by an edit). New **approval** status for templates with a PandaDoc approval workflow — portal shows *Being finalized* without a sign button; after approval in PandaDoc the sync sends it automatically (`contract_approved` log). First live verification against the sandbox API key: create/update/re-send work; pricing table rows now use PandaDoc's `Name`/`Description`/`Price`/`QTY` keys (lowercase was rejected); Salesforce-style tokens (`Client.*`, `Account.Name`, `Date__c`) filled so the existing Whitewater templates work; sandbox can only send to workspace members. Webhook and end-to-end signing still unverified (needs an approved doc + public URL). |
| 2026-09-09 | Admin restyle toward a developer-tool look (Supabase-inspired): neutral gray palette in all three themes with one green brand accent for primary actions and positive status, 4–8px radii, hairline borders and no panel shadows, and a mono uppercase label style (`type-label`) for eyebrows, table headers, metric labels and status chips. The sidebar is now a rail (icons-only when collapsed) and a new desktop top bar carries the breadcrumb, a `development` tag on local builds, the theme switch, the signed-in email and sign out (they left the sidebar footer; the mobile drawer still has them). Dashboard metric tiles gained icons. Login and reset-password screens follow the admin theme. Client portal untouched apart from the shared button/badge shapes. Tokens live in `src/app/globals.css`. |
| **GoHighLevel** | CRM and system of record | Contacts, opportunities, the Event Sales pipeline, client email/SMS notifications, calendars of record |
| **This portal app** | Working surface for planners and clients | Room calendar, event checklists, schedules, uploads, vendor submissions, the client-facing portal pages |
| **PandaDoc** (via GHL) | Proposals and signatures | Proposal documents; pushes the proposal link into GHL |

Two rules keep the integration sane:

1. **GHL is the system of record.** The app mirrors opportunity data into a
   local snapshot and writes changes back; when in doubt, what GHL says wins
   on the next sync.
2. **The app drives GHL, not the other way around** (adopted 2026-07-15).
   Planner actions in the app (linking a room, launching a portal) push the
   opportunity through the pipeline. The only GHL→app automation is the
   inquiry webhook that creates the draft event.

### Who uses what

| Person | Where they work | Access |
| --- | --- | --- |
| **Admin** (Austin / managers) | `/admin` — everything, incl. Admin section, user management, reports, dollar values | Supabase login, role `admin` |
| **Planner** (event coordinators) | `/admin` — daily event work; no Admin section, no dollar values | Supabase login, role `planner` (the default role) |
| **Client** | `/e/<token>` — their event portal | Secure tokenized link, no login |
| **Sales** | GoHighLevel | GHL login |

Roles live in Supabase auth `app_metadata.role` and can only be changed from
Admin → Users (service role), so users can't escalate themselves.

---

## 2. Lifecycle of an event (end to end)

This is the core training walkthrough: what a human does at each step, and
what the systems do automatically in response.

### Step 1 — Inquiry arrives

**Human:** nothing (client fills out the Gravity Forms inquiry on the website).

**Automatic:**
- GHL creates the contact and an opportunity in the **Inquiry** stage of the
  Event Sales pipeline (GHL-side workflow).
- A GHL workflow webhook posts the opportunity to
  `POST /api/ghl/opportunities/inquiry` (secured by the
  `x-portal-webhook-secret` header matching `GHL_WEBHOOK_SECRET`).
- The app creates a **draft portal event** (idempotent on
  `events.ghl_opportunity_id` — duplicate webhook deliveries are safe).
- The app writes the new portal event id back to the opportunity's
  **Event Planning App ID** custom field, so GHL knows a portal event exists.

### Step 2 — Proposal (PandaDoc, via GHL)

**Human:** sales builds and sends the proposal from PandaDoc/GHL.

**Automatic:**
- PandaDoc (integrated in GHL) writes the proposal URL into the opportunity's
  **Proposal Link** custom field.
- The app picks it up on the next event-page sync and shows it as a clickable
  link on the admin event page and in the client portal's "Documents and
  payment" section. GHL/PandaDoc stay authoritative — blank the field there
  and it disappears in the app.

### Step 3 — Rooms are reserved

**Human:** a planner opens **Room Calendar** (`/admin/calendar`), creates a
reservation, and in the modal:
- picks the room(s), date, and times (the date auto-fills from the
  opportunity's Date of Interest);
- links the portal event in the **Linked Event** select;
- picks the **Event Coordinator** (dropdown lists GHL staff planners —
  ACCOUNT-USER role only, admins are excluded).

**Automatic:**
- Saving a block linked to a portal event moves the GHL opportunity to the
  **Planning** stage (`GHL_PIPELINE_ID` + `GHL_PLANNING_STAGE_ID`). GHL
  workflows key off this stage for internal tasks/notifications.
- Picking a coordinator assigns that GHL user to the opportunity
  (`assignedTo`) — they own it in GHL too, and they appear as the event's
  **Planner** in the app.
- Reservations start as **held** (faded/dashed on the calendar); a planner
  flips them to **booked** from the event page's Room bookings section.

### Step 4 — Event prep in the app

**Human:** the planner works the event at `/admin/events/<id>`:
- **Event summary** — set arrival time, meeting location, guest count,
  activity passes, parking passes, storage bins; admins also see/edit Value.
  The **Planner** can be reassigned here at any time (staff planners only).
- **Primary contact + conversations** — the top of the Event facilitator
  card shows the person who originally inquired (name/email/phone, synced
  from the GHL contact on page load). The speech-bubble button opens a
  right-side drawer with the contact's full GHL conversation history
  (email/SMS, live from GHL) and a reply box — replies send **through GHL**
  so they land in the same Conversations thread. Sending requires the
  Private Integration's *write conversation messages* scope; without it the
  drawer still shows history and the send reports a clear scope error.
  The drawer honors GHL's **Do Not Disturb**: a channel the contact has DND
  on (the contact-level switch, or per-channel DND including a STOP
  opt-out GHL records itself) disappears from the Email/SMS picker with a
  notice explaining why, and the send API refuses it as a backstop. Each
  message in the thread carries a channel icon (envelope = email, phone =
  SMS, bubble = chat/social) and label. The compose box's Email/SMS picker
  chooses the reply channel; it starts on whichever channel the contact
  last used to reach us (falling back to Email), and email replies thread
  onto the most recent email.
  The reply box also reuses what's already set up in GHL: **Insert snippet**
  drops a GHL Snippet (Settings → Snippets; filtered to the chosen channel)
  into the message as editable text, with `{{contact.*}}` / `{{user.*}}`
  merge tags already filled in for this contact and the signed-in planner
  (other tags stay visible so you can fix them before sending). The list is
  cached for five minutes; "Refresh from GHL" inside the menu bypasses that
  after editing snippets in GHL. The menu needs the *view templates* →
  `locations/templates.readonly` scope on the Private Integration; a missing
  scope shows as a message inside the menu. GHL's email-builder templates
  (Marketing → Emails) are intentionally not offered here — they're
  marketing designs, not customer correspondence.
  Beside it, a notepad button (with a red badge showing the note count)
  opens a matching drawer of the contact's **GHL notes**; notes added there
  save to the GHL contact, attributed to the GHL user whose email matches
  the signed-in planner. A third button opens the contact's **GHL tasks**
  (badge counts open tasks): planners can create tasks (title, description,
  due date, assignee — defaults to themselves) and check them off, exactly
  like GHL's own task list; every change writes straight to GHL.
- **Event facilitator** — record the client's on-site contact (name, email,
  phone) when someone besides the inquiry contact runs the event day, common
  on large corporate events. A **"Same as the event's current contact"**
  checkbox covers the common case: it hides the fields and copies the primary
  GHL contact's details on save. Saving pushes the info to the opportunity's
  Facilitator fields and (for a separate facilitator) upserts a
  `facilitator`-tagged GHL contact so staff can message them from
  Conversations. Client portal submissions land here flagged **needs
  review**.
- **Checklist** — apply a checklist template, then tailor items per event
  (client-visible vs internal, required vs optional). The default template
  includes a "Provide your event facilitator's contact info" section —
  delete it per event when there's no separate facilitator.
- **Schedule & Notes** — build the event-day schedule from the whitewater day
  template; WYSIWYG fields support merge tags that resolve live per event.
- **Room bookings** — confirm held rooms as booked.

**Automatic:**
- Opening the event page **syncs from GHL first** (name, type, Date of
  Interest, contact, planner, proposal link, guest counts, value) — quiet on
  failure so the page always renders.
- Saving the Event summary writes guest count, pass/bin counts, and Value
  back to the GHL opportunity in one PUT.
- Reassigning the planner updates the GHL opportunity's assigned user; the
  local snapshot only updates after the GHL write succeeds.

### Step 4b — Contract (PandaDoc, from the app)

**Human:** on the event's **Contracts** tab (`/admin/events/<id>/contracts`)
the planner clicks **New contract**, names it (initial agreement, an
event-order change, a 50% deposit — as many per event as needed), picks a
PandaDoc template, writes any description/terms, adds the **items and
prices** it covers, confirms the recipient (prefilled from the GHL
contact), and clicks *Create and send*. The client then signs it **inside
the portal** (see Step 6). Nothing goes through GHL.

**Automatic:**
- The app creates the PandaDoc document from the template: line items
  become the template's first pricing table, event/contact/planner values
  are sent as document tokens (`[event.name]`, `[event.date]`,
  `[contact.email]`, `[contract.description]`, `[contract.subtotal]`, …),
  the client is assigned to the template's client role, and the document is
  sent **silently** (PandaDoc emails the invite too only if the planner
  ticks "also email from PandaDoc").
- Every contract stays on the event forever (name, terms, line items,
  status, PandaDoc link, signed date). The Event summary lists them under
  the Portal URL with a status pill and a link into PandaDoc; the tab shows
  history, totals, "Refresh status", "Open in PandaDoc", and the archived
  **Signed PDF** once executed.
- **When the client signs** (detected by the portal's embedded signer the
  moment they finish, by the event/Contracts page refresh, or by the
  PandaDoc webhook — whichever comes first, applied once):
  1. every **held** room reservation on the event flips to **booked**;
  2. the GHL opportunity moves to the **Booked** stage
     (`GHL_BOOKED_STAGE_ID`);
  3. the signed PDF is copied into Supabase Storage
     (`contracts/<event>/<contract>.pdf`);
  4. the outcome is written to integration logs (`contract_signed`).
- **Editing before signature:** an unsigned contract (*Awaiting PandaDoc
  approval*, *Awaiting signature*, *Viewed by client*, or a *Draft* left by
  a failed re-send) has an **Edit** button. The same form opens prefilled;
  saving moves the PandaDoc document back to draft, updates its name, terms
  and pricing table, and re-sends it. The client's earlier signing link
  stops working and the portal shows the revised contract ("Updated …").
  The card shows *Revised … by … (revision N)*. Template and recipient
  can't change — send to someone else with a new contract. Signed
  contracts can't be edited: changes after signing are a new contract
  (order change, final payment).
- **Approval workflow:** if the PandaDoc template has an approval workflow,
  sending parks the document in PandaDoc's *waiting approval* state. The app
  shows **Awaiting PandaDoc approval** and the portal shows *Being
  finalized* without a sign button. Once someone approves it in PandaDoc,
  the next refresh (page load, Refresh status, or webhook) sends it to the
  client automatically (`contract_approved` integration log).
- **Event value = contracts combined.** After every contract create, edit,
  or status change the event's **Value** becomes the sum of its live
  contracts (PandaDoc's total where known, else the app subtotal;
  declined, voided and failed ones don't count) and is written to the GHL
  opportunity's monetary value (`opportunity_value_write_back` log). Until
  the first contract exists the manually entered value stands.
- Failed creations stay listed as *Failed* with PandaDoc's error so the
  planner can fix the template/key and retry; only those can be removed.

### Step 5 — Portal launch

**Human:** when the checklist and schedule are client-ready, the planner uses
the **gated launch action** at the bottom of the event page (requires ticking
the planner-approval confirmation).

**Automatic:**
- The app generates a **secure tokenized portal URL** (`/e/<token>`), stores
  only the token hash, and stamps `launched_at`.
- The absolute portal URL is written to the opportunity's **Portal Link**
  custom field.
- **The app does not email the client.** GHL workflows send the portal link
  (email/SMS) using the Portal Link field — client notification stays
  GHL-owned.

### Step 6 — Client works their portal

**Human (client):** at `/e/<token>` (no login) they can:
- see the event summary, arrival details, and their planner's contact info;
- complete their checklist items;
- upload files (insurance, logos, rosters — stored privately in Supabase
  Storage);
- submit vendors;
- submit or update their **event facilitator's** contact info (synced to GHL
  immediately, flagged needs review for the planner);
- **review and sign contracts** in the Contracts card: each contract shows
  its items and total with a *Review and sign* button that opens PandaDoc's
  signer in an embedded frame — no email or PandaDoc account needed. When
  they finish, the portal confirms with the app immediately (rooms booked,
  GHL Booked, PDF archived) and shows the contract as **Signed**;
- open proposal/contract/invoice/payment links ("Documents and payment");
- view the event-day schedule at `/e/<token>/schedule`.

**Automatic:**
- Client submissions (checklist completions, uploads, vendors) are flagged
  **needs review** for planners and surface on the admin dashboard work
  queue and the event page. Facilitator submissions are also flagged needs
  review, shown on the event page's Facilitator card (not yet in the
  dashboard queue).
- Portal views are counted (first/last viewed, view count).

### Step 7 — Review and event day

**Human:** planners clear the review queue (mark uploads/vendors/checklist
items reviewed), keep the schedule current, and run the event. Reviewing is
app-only — nothing syncs back to GHL or notifies the client.

### Step 8 — After the event

- Won business lives in **Opportunities → Won** (`/admin/opportunities?tab=won`):
  every won opportunity as a contact list, filterable by when the event
  happened (All time / Past 6 months / Past year / custom range) — the
  starting point for rebooking outreach.
- Past events stay in **Events** under its past filter (`/admin/past-events`).

### Deleting an event (admin, destructive)

Deleting from the event page removes the event and everything attached
(checklist, vendors, uploads metadata, schedule, linked reservations),
**blanks the opportunity's Event Planning App ID and Portal Link fields** so
the inquiry flow can re-run, and kills the portal token. Uploaded files stay
in Supabase Storage. GHL contact/opportunity are untouched otherwise.

---

## 3. Screen map

### Admin (`/admin`, Supabase login)

| Screen | Route | What it's for |
| --- | --- | --- |
| Dashboard | `/admin` | Four metric tiles, then: **Vendor submissions** awaiting planner approval (links to the event's vendors section); **Upcoming events** split into *Today's events* and *This week's events* (next seven days); **Contracts** with *Recently signed* and a red *Needs attention* list — launched events within three weeks with no signed contract (no contract sent / awaiting PandaDoc approval / awaiting signature) and, inside two weeks, signed-but-unpaid ones (PandaDoc `waiting_pay`) |
| Events | `/admin/events` | All portal events; open one to work it |
| Event detail | `/admin/events/<id>` | Summary (incl. contracts list under Portal URL), planner, room bookings, launch, review queues |
| Contracts | `/admin/events/<id>/contracts` | PandaDoc contracts for the event: create (template, terms, line items, recipient), edit unsigned ones in place (re-sent as a new revision), history with status/totals/links, signed PDF, refresh status |
| — Checklist | `/admin/events/<id>/checklist` | Event-specific checklist editing |
| — Schedule & Notes | `/admin/events/<id>/schedule` | Event-day schedule grid + sectioned notes |
| Room Calendar | `/admin/calendar` | Reservation board; where events get rooms, coordinators, and Planning-stage pushes |
| Planner Assignments | `/admin/assignments` | Month calendar of every planner's assigned events (default), colored by planner with a legend of filter chips (click to show/hide a planner; counts are that month's workload), previous/next/Today arrows. One chip per event per day (not per room): clicking it opens an event summary pop-up listing every room booked with its time and held/booked status, with an **Open event** link top right when the reservation is tied to a portal event. A chip is faded only when every room is still held. `?month=YYYY-MM&planners=Name,Name` reproduces a view. A **Columns** toggle keeps the original one-column-per-planner workload comparison with its from/to filter (`?view=columns`) |
| Opportunities | `/admin/opportunities` | GHL pipeline (default tab) + Won contact list; below the nav rule. The Pipeline tab shows one stage at a time: a row of stage tabs with counts (`?stage=<stage id>`; the first stage is the default, and opportunities in stages since removed from the pipeline collect under an "Other" tab) above a full-width grid of that stage's cards, so a busy stage is read top-to-bottom on one screen instead of down a narrow column. Between the stage header and the cards, a **stage guide** panel explains "What's happened" (mostly automatic: draft event created, opportunity moved, contract signed…) and "What to do next" for that stage — the training text lives in `STAGE_GUIDES` in `src/app/admin/opportunities/page.tsx`, keyed by the GHL stage name, so renaming a stage in GHL needs a matching key. Each card carries the conversations/notes/tasks buttons for its contact — same drawers as the event page. Note/open-task badges read from the local `ghl_contact_badges` cache (instant at 100–250 cards); stale rows refresh after each view via paced background sweeps, and opening a drawer freshens its contact's row exactly |
| Companies | `/admin/companies` | Company directory from the Salesforce archive: contacts, booking history, live booking stats; dollar values admin-only |
| Settings | `/admin/settings` | Checklist + schedule templates |
| Admin → Users | `/admin/system/users` | Create/delete portal users, set roles, reset passwords (Mailgun email) |
| Admin → Reports | `/admin/system/reports` | Timeframe-filtered event stats and charts, plus Booked business from the Salesforce archive. **Unlisted** (2026-08-31): no nav entry — direct URL only, still admin-role-gated |
| Admin → Integration Logs | `/admin/system/integration-logs` | Every GHL↔app exchange, success or failure |
| Admin → SF Migration | `/admin/system/sf-migration` | Review staged Salesforce contacts: pull, search, dupe view, approve/exclude, GHL payload preview |

### Client (`/e/<token>`, no login)

| Screen | Route | What it's for |
| --- | --- | --- |
| Portal overview | `/e/<token>` | Summary, arrival details, checklist, **contracts (embedded PandaDoc signing)**, documents/payment, facilitator, vendors, uploads, planner contact |
| Event schedule | `/e/<token>/schedule` | Event-day schedule and notes |

---

## 4. Data and sync reference

### Where data lives

- **Supabase (Postgres)** — events (with a `ghl_snapshot` JSON mirror of the
  opportunity), checklist items/templates, schedule, vendors, uploads
  metadata, reservations/rooms, integration logs, portal users.
- **Supabase Storage** — client-uploaded files and archived signed
  contracts (private; planners get short-lived signed URLs).
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
| Inquiry webhook | GHL → app | Creates draft event; app writes event id back |
| Admin event page load | GHL → app | Opportunity snapshot refresh (name, date, planner, links, counts, value) |
| Event summary save | app → GHL | Guest/pass/bin counts, Value |
| Facilitator save (admin or client portal) | app → GHL | Facilitator name/email/phone custom fields + `facilitator`-tagged contact upsert (one-way; GHL never writes back). "Same as current contact" saves instead read the primary GHL contact and skip the upsert |
| Conversations drawer open | GHL → app | Contact's conversations + message history, read live (never stored) |
| Conversations drawer reply | app → GHL | Email/SMS sent via the GHL Conversations API; threads into the same GHL conversation (needs the write-conversations scope) |
| Conversations drawer snippet menu | GHL → app | Location snippets (`/locations/{id}/templates`), read live and cached 5 min per server process (never stored); merge tags rendered per contact/planner (`/api/ghl/contacts/[contactId]/message-templates`) |
| Notes drawer open | GHL → app | Contact's GHL notes, read live (never stored); count shown as a badge on the notepad button |
| Notes drawer add | app → GHL | Note written to the GHL contact, attributed to the matching GHL user by email |
| Tasks drawer open | GHL → app | Contact's GHL tasks, read live (never stored); open-task count badges the tasks button |
| Opportunities pipeline view | GHL → app | Badge counts for the visible stage read from the local `ghl_contact_badges` cache; stale rows (>5 min) across the whole pipeline re-swept from GHL after the response, paced (60 contacts/view, concurrency 5) for the 140–250-card in-season pipeline (see roadmap "Expected volume") |
| Contracts tab "Save and re-send" (Edit) | app → PandaDoc | Document moved to draft, updated (name, tokens, pricing table), sent again; row gets `revision`+1, `revised_at/by`; `contract_update` log |
| Contracts tab "Create and send" | app → PandaDoc | Document created from the template (tokens + pricing table from line items), waited to draft, sent silently (or emailed) |
| Admin event page / Contracts tab load | PandaDoc → app | Open contracts re-read from PandaDoc (status, total); signed side effects run if newly completed |
| Portal "Review and sign" | app → PandaDoc | Embedded-signing session minted for the recipient (1-hour link) |
| Portal signer completion | PandaDoc → app | `POST /api/portal/<token>/contracts/<id>` `{action:"complete"}` re-reads the document and runs the signed actions (rooms booked, GHL Booked, PDF archived) |
| PandaDoc webhook | PandaDoc → app | `POST /api/pandadoc/webhook?signature=…` (HMAC-SHA256 with `PANDADOC_WEBHOOK_KEY`); each document in the delivery is re-read and synced — needs a public URL |
| Contract signed | app → GHL | Opportunity moved to the Booked stage (`opportunity_move_to_booked`) |
| Tasks drawer create / check off | app → GHL | Task created on the GHL contact (due date required by GHL, assignee defaults to the signed-in planner's GHL user) or completion toggled |
| Planner reassign / coordinator pick | app → GHL | Opportunity `assignedTo` |
| Reservation linked to event | app → GHL | Opportunity moved to Planning stage |
| Portal launch | app → GHL | Portal Link field |
| Event delete | app → GHL | Blanks Event Planning App ID + Portal Link |

**Degrade rules:** every GHL call fails quietly (logged, never blocking the
planner's primary action) *except* planner reassignment, which surfaces the
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
  `--only=contacts|accounts|opportunities` limits the run). Unchanged
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
  along in `raw`). Auth is the client-credentials flow against the
  "Contact Export" External Client App (read-only run-as user).
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

## 5. PandaDoc

**Proposals** still come from GHL's PandaDoc integration (Proposal Link
field, read-only in the app — see Step 2).

**Contracts** are the app's own PandaDoc integration (Step 4b + Step 6):

- **Account/API:** needs a PandaDoc plan with API access and an API key in
  `PANDADOC_API_KEY`. A sandbox key works against the same host for testing.
- **Template:** build a "Contract" template in PandaDoc with one recipient
  role for the client (any role containing "client"/"customer"/"signer" is
  picked, else the first), a **pricing table** (the first one receives the
  app's line items), and whichever tokens you want filled: `event.name`,
  `event.type`, `event.date`, `event.arrival_time`, `event.meeting_location`,
  `event.num_attendees`, `event.activity_passes`, `event.parking_passes`,
  `event.storage_bins`, `contact.name/email/phone`,
  `planner.name/email/phone`, `facilitator.name/email/phone`,
  `contract.name`, `contract.description`, `contract.subtotal`. Set its id as
  `PANDADOC_TEMPLATE_ID` for the default; planners can pick any template.
- **Whitewater's existing templates** (EA Group, Group w/ Catering, Final
  Payment, the wedding ones, …) were built for PandaDoc's Salesforce
  integration: two roles (*Client* and *Event Coordinator*), pricing tables
  named `PricingTable1`/`PricingTable2`, and tokens named `Client.FirstName`,
  `Client.LastName`, `Client.Email`, `Client.Phone`, `Account.Name`,
  `Date__c`. The app fills those names too (Account.Name blank — the event
  has no company field), so they work unchanged. Only the Client role is
  assigned; PandaDoc gives that recipient every signature field. Line
  items go into the template's pricing table whose Price column is visible
  (EA Group's `PricingTable2` is a menu of class options with hidden
  prices, and PandaDoc refuses to fill it); if PandaDoc rejects a table the
  app tries the template's next one. Row keys are each column's *merge
  name* (normally `Name`, `Description`, `Price`, `QTY`; the Final Payment
  template has them renamed) — lowercase keys are rejected.
- **Editing:** move-to-draft → update → send, all on the same document id
  (see Step 4b). PandaDoc refuses to update anything not in draft, and
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

## 6. Configuration quick reference

All in `.env.local` (see `src/lib/env.ts` for the full list):

| Variable | Breaks what when missing/invalid |
| --- | --- |
| `GHL_ACCESS_TOKEN` / `GHL_LOCATION_ID` | All GHL sync; planner dropdowns fall back to read-only; Opportunities page shows empty states |
| `GHL_WEBHOOK_SECRET` | Inquiry webhook rejects deliveries |
| `GHL_PIPELINE_ID` / `GHL_PLANNING_STAGE_ID` | Planning-stage moves; Opportunities pipeline board |
| `GHL_BOOKED_STAGE_ID` | Contract-signed move to the Booked stage (logged as a skipped warning when missing) |
| `PANDADOC_API_KEY` | Contracts tab can't create documents; portal shows no signing; template picker explains |
| `PANDADOC_TEMPLATE_ID` | No default template preselected (planners pick one per contract) |
| `PANDADOC_WEBHOOK_KEY` | Webhook deliveries rejected (401); signer completion + page refresh still work |
| Field id vars (`GHL_OPPORTUNITY_EVENT_FIELD_ID`, `GHL_PORTAL_LINK_FIELD_ID`, `GHL_DATE_OF_INTEREST_FIELD_ID`) | The respective field reads/writes |
| Supabase vars | Everything — auth, data, storage |
| `MAILGUN_API_KEY` | Password-reset emails |
| `SALESFORCE_DOMAIN` / `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` | Salesforce contact pulls (migration staging) |

A GHL **401** in the dev logs means the access token is expired/invalid —
planner pickers go read-only and pipeline views go empty until it's replaced.

**Private Integration scopes** the token needs beyond the basics (Settings →
Private Integrations in GHL): *write conversation messages* (drawer replies),
*view templates* / `locations/templates.readonly` (snippet menu). Each
missing scope surfaces as a labeled 401 message in the feature it gates.

---

## 7. Keeping this manual current

When you ship a feature, ask:

1. Does it add/change a **step in the event lifecycle**? → update section 2.
2. Does it add a **screen or route**? → update section 3.
3. Does it **read/write GHL**? → update section 4 here *and* the field table
   in [ghl-custom-fields.md](ghl-custom-fields.md).
4. Does it need **new env/config**? → update section 6.
5. Add a changelog row below and bump the _Last updated_ date at the top.

## Changelog

| Date | Change |
| --- | --- |
| 2026-09-11 | Opportunities → Pipeline: each stage tab now shows a two-column stage guide ("What's happened" / "What to do next") between the header and the cards, describing the automatic steps and the planner's next move for New Inquiry, Contacted, Planning, Proposal Sent, Booked, Lost, and Other. Keyed by GHL stage name (`STAGE_GUIDES`). |
| 2026-09-11 | Conversations drawer: the Email/SMS picker now defaults to the channel of the contact's most recent inbound message (first load only; DND still wins), and every thread message shows an envelope/phone/bubble icon for its channel. |
| 2026-09-11 | Conversations drawer honors GHL Do Not Disturb: the contact's `dnd` / `dndSettings` are read with the thread (`GET …/conversations` now returns `dnd`), a DND channel is removed from the Email/SMS picker with an explanatory notice (all-channel DND blocks sending entirely), and `POST …/conversations` refuses a DND channel with a 409. `GhlContactSummary` gained `dnd`. |
| 2026-09-11 | Planner Assignments gained a month calendar (now the default view) at the client's request: every planner's events on one grid, color per planner (the Room Calendar still colors by room), legend chips that filter by planner and show monthly counts, month arrows + Today, multi-day events on each day they cover. A day shows one chip per event rather than one per room; clicking opens an event summary pop-up (all rooms with times and held/booked status, "Open event" link top right for event-linked reservations), so a four-room booking is one tile. Chips fade only when every room is held. URL-driven (`?month=&planners=`), no client state. The original planner columns remain behind a Calendar/Columns toggle (`?view=columns`). |
| 2026-09-11 | Opportunities → Pipeline redesigned from a column-per-stage board to stage tabs: a row of stage tabs with counts (and the stage total for admins) above a full-width card grid for the selected stage (`?stage=<id>`, first stage by default, "Other" for orphaned stages). No more sideways scrolling or long narrow columns in season. Badge reads cover just the visible stage; the stale sweep still covers the whole pipeline. |
| 2026-09-11 | Removed "Use email template" from the conversations drawer: GHL email-builder templates are marketing designs, not customer correspondence. The drawer now only offers "Insert snippet"; the `emailTemplateId` send path, the `/emails/builder` read, and the `emails/builder.readonly` scope requirement are gone. |
| 2026-09-11 | Fix: "Insert snippet" in the conversations drawer showed no snippets. The GHL `/locations/{id}/templates` read was passing `originId=<location id>`, which GHL treats as a filter on the snippet's origin record and answered with an empty list; the parameter is dropped. Snippet merge tags also gained `{{contact.company_name}}` (used in every email snippet's subject), read from the GHL contact's company name. |
| 2026-09-08 | PandaDoc contracts: new **Contracts** tab on the admin event page (create from a PandaDoc template with description/terms, line items + prices, recipient; full history with status, totals, PandaDoc link, signed PDF, refresh) and a **Contracts** card in the client portal with embedded PandaDoc signing. New `event_contracts` table, `src/lib/pandadoc/*` client, `src/lib/admin/contracts.ts`, `/api/pandadoc/webhook` (signed), `/api/portal/[token]/contracts/[id]` (session/complete). On signature: held reservations → booked, GHL opportunity → Booked (`GHL_BOOKED_STAGE_ID`, new `moveOpportunityToBooked`), signed PDF archived to Storage, `contract_signed` integration log. Event summary lists contracts under Portal URL. Built before the PandaDoc API key existed — unverified against the live API. |
| 2026-09-08 | Conversations drawer (event page + Opportunities cards) gained GHL snippets and email templates: "Insert snippet" pastes a GHL Snippet for the current channel into the reply box with contact/user merge tags pre-filled server-side (`src/lib/ghl/message-templates.ts`, new `/api/ghl/contacts/[contactId]/message-templates` route, 5-minute cache); "Use email template" sends a GHL email-builder template by id (`templateId` on the Conversations send, `emailTemplateId` in the POST body) so GHL renders the design. Needs the `locations/templates.readonly` and `emails/builder.readonly` scopes on the Private Integration — each menu reports its own scope error. |
| 2026-08-31 | Primary contact on the event: page-load sync now also pulls the GHL contact's name/email/phone into `ghl_snapshot.contact`, shown at the top of the Event facilitator card. New conversations drawer (speech-bubble button): full GHL email/SMS history for the contact, read live via the Conversations API, with reply-from-the-app (sends through GHL, threads into the same conversation; needs the Private Integration's write-conversations scope). New `/api/events/[eventId]/conversations` route backs it. Notes drawer beside it (notepad button + red note-count badge): reads the contact's GHL notes live and adds new ones to GHL, attributed to the GHL user matching the planner's email (`/api/events/[eventId]/notes`). Tasks drawer completes the trio: read, create, and check off the contact's GHL tasks like GHL natively does; badge counts open tasks. The drawer trio also sits on every Opportunities board card, backed by contact-keyed routes (`/api/ghl/contacts/[contactId]/conversations`, `/notes`, `/tasks`) shared with the event page. |
| 2026-08-11 | Initial manual. Covers inquiry→launch lifecycle, planner reassignment on the event page, staff-planner-only pickers, and the new Opportunities page (pipeline board + Won tab). |
| 2026-08-14 | Salesforce → GHL contact migration staging: read-only Salesforce pulls into `sf_contacts` via `scripts/sf-pull.ts`, new `SALESFORCE_*` env vars. Review screen and GHL push still to come. |
| 2026-08-31 | Salesforce staging expanded to Accounts (`sf_accounts`) and Opportunities (`sf_opportunities`) per client request; `sf_pull_runs` is per-object (`sf_object`, `records_seen`/`records_upserted`). These tables double as the permanent pre-GHL booking-history archive; no plan to push them wholesale into GHL. |
| 2026-08-31 | Reports gained a "Booked business" section: won events / won value / top companies from the Salesforce archive, on the same timeframe filter (`sf_booked_business_report` SQL function). Salesforce stopped carrying dollar amounts ~Oct 2024 (proposals moved to PandaDoc), so recent won events report $0 — the section says so. GHL cutover checklist started in roadmap.md. |
| 2026-08-31 | Event facilitator workflow: new Facilitator card on the admin event page and client portal (client submissions flagged needs review), synced to three new GHL opportunity fields (`facilitator_name/email/phone`) plus a `facilitator`-tagged GHL contact upsert so staff can message them from Conversations. App-authoritative — GHL never writes facilitator info back. Default checklist template gained a "Provide your event facilitator's contact info" section; `facilitator.*` merge tags added. Both cards have a "Same as current contact" checkbox that copies the primary GHL contact's details on save (no tagged-contact upsert in that case). |
| 2026-08-31 | Companies "Last event" fixed to mean the most recent PAST won event — it previously took max over all won opportunities, so future bookings (real "Booked" 2027 events, not bad data) displayed as the last event. The view now also exposes `next_event_date` (soonest upcoming won event): shown as a "Next event" stat on company pages and as a green "Next …" fallback in the directory list when a company has no past events yet. |
| 2026-08-31 | New Companies directory (`/admin/companies`, in the sales nav group): searchable company list + per-company detail (contacts, full booking history, duplicate-name callout). Booking stats computed live from `sf_opportunities` via the `sf_company_directory` view — "Booked" stage = won/upcoming, "Event Occured" = won/past; the Salesforce roll-ups only counted "Booked". Won value and per-opportunity amounts are admin-only. |
