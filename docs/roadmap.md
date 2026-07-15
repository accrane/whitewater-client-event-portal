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

- **GHL calendar integration** (2026-07-15) — two shared-secret webhooks drive
  the room calendar from GoHighLevel workflows:
  - `POST /api/ghl/reservations/proposal-sent` places a **held** block on the
    room calendar (`source = 'ghl'`, linked via
    `reservations.ghl_event_record_id`). Idempotent on retried deliveries;
    unknown room values are logged to `integration_logs` and rejected with 422.
    GHL venue values that differ from portal room names are translated by the
    editable map in `src/lib/ghl/room-mapping.ts` (case-insensitive exact-name
    fallback).
  - `POST /api/ghl/events/create-draft` (existing) now also links the earlier
    hold to the draft portal event it creates and promotes it to **booked**,
    since the proposal is signed and the deposit paid.
  - Both require the `x-portal-webhook-secret` header matching
    `GHL_WEBHOOK_SECRET`.
