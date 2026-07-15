-- GHL integration direction reversed (see docs/roadmap.md): events are now
-- created when a GHL inquiry opportunity fires a webhook, before any GHL
-- event record exists, and the app pushes state back to the opportunity.

-- Inquiry-created events have an opportunity but no event record yet.
alter table events alter column ghl_event_record_id drop not null;

-- Dedupe retried inquiry webhook deliveries on the opportunity id.
create unique index events_ghl_opportunity_unique_idx
  on events (ghl_opportunity_id)
  where ghl_opportunity_id is not null;

-- Calendar blocks are planner-created in this workflow; the GHL link that
-- supported auto-created holds is no longer used.
drop index if exists reservations_ghl_event_record_unique_idx;
alter table reservations drop column if exists ghl_event_record_id;
