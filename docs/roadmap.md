# Project Roadmap

_Last updated: 2026-07-15_

This file tracks planned work beyond the current milestone. For the preview-phase
deferral list, see [client-event-portal-preview-handoff.md](client-event-portal-preview-handoff.md).

## Client portal

### Shipped

- **Standalone schedule route** (2026-07-14) — `/e/[token]/schedule` is the
  dedicated client-facing page for the event-day schedule grid and sectioned
  event notes. The portal overview page no longer shows them; both pages share
  a top navigation (Overview | Event Schedule). Planners build the schedule
  and notes at `/admin/events/[eventId]/schedule`, seeded from the standard
  whitewater day template.

## Room booking calendar (merged from ww-booking-cal)

The standalone `ww-booking-cal` app (room scheduling board for event planners) is
being merged into this portal under the admin area.

### In progress

- Port the calendar UI (resource grid, reservation modals, filters) into the
  admin section of this app.
- Migrate rooms / reservations / coordinators from better-sqlite3 to Supabase.
- Schema is designed ahead for the items below: `reservations` carries nullable
  links to a portal event and a planner, plus a `source` field
  (`manual` vs `ghl`), so neither future item requires a schema migration.

### Planned

- **Planner Assignments view** (renamed from "planner workload") — shipped
  2026-07-14 at `/admin/assignments`: one column per planner with upcoming
  assigned events as room-colored cards (held = faded/dashed, booked = solid),
  so a manager can spot planners who are overloaded.

### Shipped

- **GHL inquiry workflow** (2026-07-15) — replaces the same-day "proposal sent
  auto-booking" design (removed; preserved in git history). The app now drives
  GHL pipeline movement instead of GHL driving the calendar:
  1. Gravity Forms inquiry → GHL contact + opportunity in the Inquiry stage
     (GHL-side).
  2. A GHL workflow webhook posts the opportunity to
     `POST /api/ghl/opportunities/inquiry` (`x-portal-webhook-secret` header
     must match `GHL_WEBHOOK_SECRET`); the app creates a draft portal event,
     idempotent on `events.ghl_opportunity_id`.
  3. The app writes the portal event id back onto the opportunity custom
     field `GHL_OPPORTUNITY_EVENT_FIELD_ID` (retried on duplicate webhook
     deliveries until it succeeds; outcome recorded in `events.last_sync_*`).
  4. A planner creates the calendar block and picks the event in the
     reservation modal's "Linked Event" select
     (`GET /api/calendar/portal-events` feeds the options).
  5. Linking the event moves the GHL opportunity into the Planning stage
     (`GHL_PIPELINE_ID` + `GHL_PLANNING_STAGE_ID`), which GHL workflows use
     to start internal tasks and notifications.
  - All inbound and outbound steps log to `integration_logs`
    (`GHL_TO_PORTAL` / `PORTAL_TO_GHL`); outbound GHL calls degrade to logged
    warnings when GHL env vars are not configured.
  - `POST /api/ghl/events/create-draft` (MVP, keyed on
    `ghl_event_record_id`) remains but is superseded by the inquiry webhook;
    remove it once the GHL workflows are finalized.
