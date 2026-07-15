-- Room booking calendar (merged from ww-booking-cal)
-- Rooms, coordinators, and reservations for the planner scheduling board.
-- Reservations carry nullable links to a portal event and a coordinator plus a
-- source field so the planned GHL "proposal sent" auto-booking and the planner
-- workload view need no schema migration (see docs/roadmap.md).

create extension if not exists btree_gist;

create type reservation_status as enum (
  'held',
  'booked'
);

create type reservation_source as enum (
  'manual',
  'ghl'
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null,
  description text,
  capacity integer check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_rooms_updated_at
before update on rooms
for each row execute function set_updated_at();

create table coordinators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness (the original SQLite schema used COLLATE NOCASE).
create unique index coordinators_name_unique_idx on coordinators (lower(name));

create table reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  title text not null,
  status reservation_status not null default 'held',
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  notes text,
  client_name text,
  salesperson_name text,
  coordinator_id uuid references coordinators(id) on delete set null,
  coordinator_name text,
  event_id uuid references events(id) on delete set null,
  source reservation_source not null default 'manual',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_end_after_start check (end_datetime > start_datetime),
  -- Hard backstop against double-booking a room, even under concurrent writes.
  constraint reservations_no_room_overlap exclude using gist (
    room_id with =,
    tstzrange(start_datetime, end_datetime) with &&
  )
);

create trigger set_reservations_updated_at
before update on reservations
for each row execute function set_updated_at();

create index reservations_room_idx on reservations (room_id);
create index reservations_datetime_idx on reservations (start_datetime, end_datetime);
create index reservations_coordinator_idx on reservations (coordinator_id) where coordinator_id is not null;
create index reservations_event_idx on reservations (event_id) where event_id is not null;

alter table rooms enable row level security;
alter table coordinators enable row level security;
alter table reservations enable row level security;

-- Rooms are required reference data for the calendar; seed the venue list.
insert into rooms (name, color) values
  ('Big Drop', '#3B82F6'),
  ('North Conference', '#10B981'),
  ('Room A', '#F59E0B'),
  ('Room B', '#8B5CF6'),
  ('Room C', '#EF4444'),
  ('Room D', '#EC4899'),
  ('Room E', '#14B8A6'),
  ('Overlook Barn', '#F97316'),
  ('Adventure Pavilion', '#6366F1'),
  ('Old Stage', '#84CC16'),
  ('Biergarten', '#A855F7'),
  ('Trail Center', '#06B6D4'),
  ('Ridge Pavilion', '#D946EF'),
  ('South Ridge Pavilion', '#0EA5E9'),
  ('Yurt', '#F43F5E'),
  ('Basecamp Classroom', '#22C55E')
on conflict (name) do nothing;
