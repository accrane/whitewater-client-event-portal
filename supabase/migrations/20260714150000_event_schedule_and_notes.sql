-- Event day schedule (template-seeded, planner-editable) and sectioned event notes.
-- Times are stored as minutes from midnight on the event day, so the grid math
-- is simple and timezone-independent.

create table event_schedule_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  size integer check (size is null or size > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index event_schedule_groups_event_sort_idx on event_schedule_groups (
  event_id,
  sort_order
);

create table event_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  -- Null group = the block spans all groups (e.g. Lunch, Rafting).
  group_id uuid references event_schedule_groups(id) on delete cascade,
  label text not null,
  start_minutes integer not null check (start_minutes >= 0 and start_minutes < 1440),
  end_minutes integer not null check (end_minutes > 0 and end_minutes <= 1440),
  color text not null default 'plain'
    check (color in ('green', 'purple', 'yellow', 'blue', 'plain')),
  created_at timestamptz not null default now(),
  constraint event_schedule_blocks_end_after_start check (end_minutes > start_minutes)
);

create index event_schedule_blocks_event_start_idx on event_schedule_blocks (
  event_id,
  start_minutes
);

create table event_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  content text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_event_notes_updated_at
before update on event_notes
for each row execute function set_updated_at();

create index event_notes_event_sort_idx on event_notes (event_id, sort_order);

alter table event_schedule_groups enable row level security;
alter table event_schedule_blocks enable row level security;
alter table event_notes enable row level security;
