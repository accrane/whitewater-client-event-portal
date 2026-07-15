-- Timeline-style schedule tiles for the client-facing schedule: repeatable
-- cards with a title, short description, and an optional rich-text note
-- (HTML from the admin WYSIWYG, may embed inline images as data URLs).

create table event_schedule_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  description text not null default '',
  note_html text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_event_schedule_items_updated_at
before update on event_schedule_items
for each row execute function set_updated_at();

create index event_schedule_items_event_sort_idx on event_schedule_items (
  event_id,
  sort_order
);

alter table event_schedule_items enable row level security;
