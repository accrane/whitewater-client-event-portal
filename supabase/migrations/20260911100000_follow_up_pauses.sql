-- Portal-side record of "follow-ups paused" on a GHL contact. The pause
-- itself is a tag on the GHL contact (follow-ups-paused) that the chase
-- workflows check before each automated send; this table remembers who
-- paused, when, and why, so the dashboard can flag contacts paused too long
-- and the portal can lift the pause when the deal books or is lost. One
-- active (unresumed) pause per contact.

create table follow_up_pauses (
  id uuid primary key default gen_random_uuid(),
  ghl_contact_id text not null,
  ghl_opportunity_id text,
  contact_name text,
  paused_by text,
  reason text,
  paused_at timestamptz not null default now(),
  resumed_at timestamptz,
  resumed_by text,
  resumed_reason text
);

create unique index follow_up_pauses_active_idx
  on follow_up_pauses (ghl_contact_id)
  where resumed_at is null;

create index follow_up_pauses_paused_at_idx on follow_up_pauses (paused_at);

alter table follow_up_pauses enable row level security;
