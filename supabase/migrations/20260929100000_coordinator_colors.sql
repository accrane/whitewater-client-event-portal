-- One color per coordinator (GHL user), handed out the first time the portal
-- shows them and kept from then on, so the Opportunities cards and the
-- Coordinator Assignments calendar color someone the same way everywhere and
-- a new hire never shifts anyone else's color. Picking rules live in
-- src/lib/admin/coordinator-color-rules.ts.

create table coordinator_colors (
  ghl_user_id text primary key,
  color text not null,
  created_at timestamptz not null default now()
);

-- Two coordinators never share a color; a racing insert of the same color
-- fails and the portal picks again.
create unique index coordinator_colors_color_unique_idx
  on coordinator_colors (lower(color));

alter table coordinator_colors enable row level security;
