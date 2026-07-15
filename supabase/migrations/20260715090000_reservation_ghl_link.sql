-- Link calendar reservations to their originating GHL event record so the
-- "proposal sent" webhook can dedupe retried deliveries and the signed+deposit
-- webhook can attach the hold to the portal event it creates.

alter table reservations add column ghl_event_record_id text;

create unique index reservations_ghl_event_record_unique_idx
  on reservations (ghl_event_record_id)
  where ghl_event_record_id is not null;
