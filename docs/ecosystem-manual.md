# Whitewater Event Ecosystem Manual

_Last updated: 2026-08-14. This is a **living training manual** for the whole
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
- **Checklist** — apply a checklist template, then tailor items per event
  (client-visible vs internal, required vs optional).
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
- open proposal/contract/invoice/payment links ("Documents and payment");
- view the event-day schedule at `/e/<token>/schedule`.

**Automatic:**
- Client submissions (checklist completions, uploads, vendors) are flagged
  **needs review** for planners and surface on the admin dashboard work
  queue and the event page.
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
| Dashboard | `/admin` | Work queue: items needing review, quick stats |
| Events | `/admin/events` | All portal events; open one to work it |
| Event detail | `/admin/events/<id>` | Summary, planner, room bookings, launch, review queues |
| — Checklist | `/admin/events/<id>/checklist` | Event-specific checklist editing |
| — Schedule & Notes | `/admin/events/<id>/schedule` | Event-day schedule grid + sectioned notes |
| Room Calendar | `/admin/calendar` | Reservation board; where events get rooms, coordinators, and Planning-stage pushes |
| Planner Assignments | `/admin/assignments` | One column per staff planner with their upcoming events |
| Opportunities | `/admin/opportunities` | GHL pipeline board (default tab) + Won contact list; below the nav rule |
| Settings | `/admin/settings` | Checklist + schedule templates |
| Admin → Users | `/admin/system/users` | Create/delete portal users, set roles, reset passwords (Mailgun email) |
| Admin → Reports | `/admin/system/reports` | Timeframe-filtered event stats and charts |
| Admin → Integration Logs | `/admin/system/integration-logs` | Every GHL↔app exchange, success or failure |
| Admin → SF Migration | `/admin/system/sf-migration` | Review staged Salesforce contacts: pull, search, dupe view, approve/exclude, GHL payload preview |

### Client (`/e/<token>`, no login)

| Screen | Route | What it's for |
| --- | --- | --- |
| Portal overview | `/e/<token>` | Summary, arrival details, checklist, documents/payment, vendors, uploads, planner contact |
| Event schedule | `/e/<token>/schedule` | Event-day schedule and notes |

---

## 4. Data and sync reference

### Where data lives

- **Supabase (Postgres)** — events (with a `ghl_snapshot` JSON mirror of the
  opportunity), checklist items/templates, schedule, vendors, uploads
  metadata, reservations/rooms, integration logs, portal users.
- **Supabase Storage** — client-uploaded files (private; planners get
  short-lived signed URLs).
- **GHL** — contacts, opportunities, pipeline stages, custom fields (see
  [ghl-custom-fields.md](ghl-custom-fields.md) for the full field map).

### When syncs happen

| Trigger | Direction | What moves |
| --- | --- | --- |
| Inquiry webhook | GHL → app | Creates draft event; app writes event id back |
| Admin event page load | GHL → app | Opportunity snapshot refresh (name, date, planner, links, counts, value) |
| Event summary save | app → GHL | Guest/pass/bin counts, Value |
| Planner reassign / coordinator pick | app → GHL | Opportunity `assignedTo` |
| Reservation linked to event | app → GHL | Opportunity moved to Planning stage |
| Portal launch | app → GHL | Portal Link field |
| Event delete | app → GHL | Blanks Event Planning App ID + Portal Link |

**Degrade rules:** every GHL call fails quietly (logged, never blocking the
planner's primary action) *except* planner reassignment, which surfaces the
error because a silent failure would revert on the next sync. All exchanges
land in **integration_logs** (`GHL_TO_PORTAL` / `PORTAL_TO_GHL`) — that page
is the first stop when "something didn't sync."

### Salesforce contact migration (staging)

The sales team is migrating from Salesforce to GHL. The app is the
**middleman**: contacts are pulled read-only from Salesforce into the
`sf_contacts` staging table, reviewed/mapped there, then pushed to GHL —
never Salesforce → GHL directly. One-way sync; Salesforce stays the source
of truth until cutover.

- **Pull:** `npx tsx --env-file=.env.local scripts/sf-pull.ts` (incremental
  from the last run's watermark; `--full` re-pulls everything). Unchanged
  contacts are hash-skipped, so re-runs are cheap. Runs are logged in
  `sf_pull_runs`.
- **Scope:** Contacts only, with `Account.Name` and `Owner.Name` flattened
  in. Auth is the client-credentials flow against the "Contact Export"
  External Client App (read-only run-as user).
- **Push to GHL:** not built yet — `sf_contacts.push_status` tracks each
  contact through `staged → approved/excluded → pushed`.
- **Review screen:** `/admin/system/sf-migration` (admin-only) — pulls,
  search/status/dupe filters, per-contact approve/exclude, and a preview of
  the exact GHL payload (`src/lib/salesforce/ghl-mapping.ts` is the single
  source of truth for the field mapping).

### Email

The app sends **only password-reset emails**, via Mailgun
(`mg.whitewater.org`). All client-facing email/SMS is GHL's job.

---

## 5. PandaDoc

**Today:** PandaDoc is integrated through GHL. Sending a proposal populates
the opportunity's Proposal Link field; the app mirrors that link to the admin
event page and the client portal. The app never talks to PandaDoc directly.

**Planned:** deeper integration (contracts, payment status, signature
webhooks) is on the horizon. When it lands, document it here: what triggers
document creation, which fields sync, and what the client sees.

---

## 6. Configuration quick reference

All in `.env.local` (see `src/lib/env.ts` for the full list):

| Variable | Breaks what when missing/invalid |
| --- | --- |
| `GHL_ACCESS_TOKEN` / `GHL_LOCATION_ID` | All GHL sync; planner dropdowns fall back to read-only; Opportunities page shows empty states |
| `GHL_WEBHOOK_SECRET` | Inquiry webhook rejects deliveries |
| `GHL_PIPELINE_ID` / `GHL_PLANNING_STAGE_ID` | Planning-stage moves; Opportunities pipeline board |
| Field id vars (`GHL_OPPORTUNITY_EVENT_FIELD_ID`, `GHL_PORTAL_LINK_FIELD_ID`, `GHL_DATE_OF_INTEREST_FIELD_ID`) | The respective field reads/writes |
| Supabase vars | Everything — auth, data, storage |
| `MAILGUN_API_KEY` | Password-reset emails |
| `SALESFORCE_DOMAIN` / `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` | Salesforce contact pulls (migration staging) |

A GHL **401** in the dev logs means the access token is expired/invalid —
planner pickers go read-only and pipeline views go empty until it's replaced.

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
| 2026-08-11 | Initial manual. Covers inquiry→launch lifecycle, planner reassignment on the event page, staff-planner-only pickers, and the new Opportunities page (pipeline board + Won tab). |
| 2026-08-14 | Salesforce → GHL contact migration staging: read-only Salesforce pulls into `sf_contacts` via `scripts/sf-pull.ts`, new `SALESFORCE_*` env vars. Review screen and GHL push still to come. |
