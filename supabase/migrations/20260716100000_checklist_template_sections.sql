-- Editable template for the client checklist: FAQ-style sections, each a
-- title with rich-text content describing what the client needs to do.
-- Mirrors schedule_template_items; distinct from the legacy form-style
-- checklist_templates / checklist_template_items tables.

create table checklist_template_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_html text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_checklist_template_sections_updated_at
before update on checklist_template_sections
for each row execute function set_updated_at();

create index checklist_template_sections_sort_idx on checklist_template_sections (
  sort_order
);

alter table checklist_template_sections enable row level security;
