-- Cached note/open-task counts per GHL contact, backing the badge dots on
-- the Opportunities board (and anywhere else contact drawers appear).
-- Sized for the real pipeline: the Salesforce archive shows 140-250
-- opportunities open at once in season, so per-view GHL lookups don't scale;
-- instead board views read these rows instantly and stale rows are refreshed
-- in paced background sweeps (see src/lib/ghl/badge-cache.ts). Rows are also
-- freshened for free whenever someone opens a notes/tasks drawer.

create table ghl_contact_badges (
  ghl_contact_id text primary key,
  note_count integer not null default 0,
  open_task_count integer not null default 0,
  refreshed_at timestamptz not null default now()
);

create index ghl_contact_badges_refreshed_idx on ghl_contact_badges (refreshed_at);

alter table ghl_contact_badges enable row level security;
