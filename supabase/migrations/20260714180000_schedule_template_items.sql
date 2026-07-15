-- Editable skeleton template for the timeline schedule. "Apply template" on an
-- event copies these rows into event_schedule_items, so per-event edits and
-- added tiles never affect the template itself.

create table schedule_template_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  note_html text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_schedule_template_items_updated_at
before update on schedule_template_items
for each row execute function set_updated_at();

create index schedule_template_items_sort_idx on schedule_template_items (
  sort_order
);

alter table schedule_template_items enable row level security;

-- Seed with the previously hardcoded starter tiles.
insert into schedule_template_items (title, description, sort_order)
values
  (
    'Arrival',
    'Guests arrive, park, and meet at the designated meeting location.',
    0
  ),
  (
    'Orientation',
    'Welcome talk and land orientation covering the day''s plan and safety.',
    1
  ),
  (
    'Activities',
    'Groups rotate through their scheduled whitewater and land activities.',
    2
  ),
  (
    'Departure',
    'Gear return, wrap-up, and dismissal from the center.',
    3
  );
