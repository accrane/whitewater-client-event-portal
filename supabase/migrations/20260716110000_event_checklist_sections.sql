-- Per-event copies of the FAQ-style checklist sections. "Apply template" on an
-- event copies checklist_template_sections rows here, so per-event edits never
-- affect the template. Shown on the client portal's Action checklist section.

create table event_checklist_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  content_html text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_event_checklist_sections_updated_at
before update on event_checklist_sections
for each row execute function set_updated_at();

create index event_checklist_sections_event_sort_idx on event_checklist_sections (
  event_id,
  sort_order
);

alter table event_checklist_sections enable row level security;
