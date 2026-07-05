-- Client Event Portal initial schema
-- MVP scope: portal events, checklist templates/items, vendors, uploads, and integration logs.

create extension if not exists pgcrypto;

create type portal_event_status as enum (
  'draft',
  'launched',
  'expired',
  'archived'
);

create type checklist_item_status as enum (
  'not_completed',
  'needs_review',
  'completed',
  'not_applicable'
);

create type upload_status as enum (
  'uploaded',
  'needs_review'
);

create type integration_direction as enum (
  'GHL_TO_PORTAL',
  'PORTAL_TO_GHL'
);

create type integration_status as enum (
  'success',
  'warning',
  'error'
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table events (
  id uuid primary key default gen_random_uuid(),
  ghl_location_id text not null,
  ghl_event_record_id text not null unique,
  ghl_contact_id text,
  ghl_opportunity_id text,
  status portal_event_status not null default 'draft',
  client_portal_token_hash text unique,
  client_portal_url text,
  public_expires_at timestamptz,
  expired_at timestamptz,
  launched_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  last_synced_at timestamptz,
  last_sync_status integration_status,
  last_sync_error text,
  ghl_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_launch_requires_url check (
    status <> 'launched' or client_portal_url is not null
  )
);

create trigger set_events_updated_at
before update on events
for each row execute function set_updated_at();

create index events_status_event_date_idx on events (
  status,
  ((ghl_snapshot ->> 'eventDate'))
);
create index events_ghl_contact_id_idx on events (ghl_contact_id);
create index events_launched_at_idx on events (launched_at desc);

create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_checklist_templates_updated_at
before update on checklist_templates
for each row execute function set_updated_at();

create index checklist_templates_active_idx on checklist_templates (is_active, event_type);

create table checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  title text not null,
  description text,
  item_type text not null,
  required boolean not null default false,
  client_visible boolean not null default true,
  client_completable boolean not null default false,
  completion_mode text not null default 'manual_admin',
  due_offset_days integer,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index checklist_template_items_template_sort_idx on checklist_template_items (
  template_id,
  sort_order
);

create table event_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  source_template_item_id uuid references checklist_template_items(id) on delete set null,
  title text not null,
  description text,
  item_type text not null,
  required boolean not null default false,
  client_visible boolean not null default true,
  client_completable boolean not null default false,
  completion_mode text not null,
  status checklist_item_status not null default 'not_completed',
  due_offset_days integer,
  due_date_override date,
  completed_at timestamptz,
  completed_by text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_checklist_completed_fields check (
    (status = 'completed' and completed_at is not null)
    or status <> 'completed'
  )
);

create trigger set_event_checklist_items_updated_at
before update on event_checklist_items
for each row execute function set_updated_at();

create index event_checklist_items_event_sort_idx on event_checklist_items (
  event_id,
  sort_order
);
create index event_checklist_items_event_status_idx on event_checklist_items (
  event_id,
  status
);
create index event_checklist_items_required_outstanding_idx on event_checklist_items (
  event_id,
  required,
  status
) where required = true;

create table vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  vendor_type text,
  company_name text,
  contact_name text,
  email text,
  phone text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_vendors_updated_at
before update on vendors
for each row execute function set_updated_at();

create index vendors_event_idx on vendors (event_id);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  checklist_item_id uuid references event_checklist_items(id) on delete set null,
  file_name text not null,
  file_mime_type text not null,
  file_size_bytes integer not null check (file_size_bytes > 0),
  storage_bucket text not null,
  storage_path text not null,
  status upload_status not null default 'uploaded',
  uploaded_by text not null default 'client',
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint uploads_allowed_actor check (uploaded_by in ('client', 'admin', 'system')),
  constraint uploads_max_mvp_size check (file_size_bytes <= 26214400),
  constraint uploads_allowed_mvp_mime check (
    file_mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif'
    )
  )
);

create unique index uploads_storage_location_unique_idx on uploads (
  storage_bucket,
  storage_path
);
create index uploads_event_uploaded_at_idx on uploads (event_id, uploaded_at desc);
create index uploads_vendor_idx on uploads (vendor_id) where vendor_id is not null;
create index uploads_checklist_item_idx on uploads (checklist_item_id) where checklist_item_id is not null;

create table integration_logs (
  id uuid primary key default gen_random_uuid(),
  direction integration_direction not null,
  event_type text not null,
  ghl_location_id text,
  ghl_event_record_id text,
  portal_event_id uuid references events(id) on delete set null,
  status integration_status not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index integration_logs_created_at_idx on integration_logs (created_at desc);
create index integration_logs_status_created_at_idx on integration_logs (status, created_at desc);
create index integration_logs_portal_event_idx on integration_logs (portal_event_id) where portal_event_id is not null;
create index integration_logs_ghl_event_idx on integration_logs (ghl_event_record_id) where ghl_event_record_id is not null;

-- RLS is enabled now so tables are not accidentally exposed through Supabase APIs.
-- Application policies will be added when admin auth and public token access are implemented.
alter table events enable row level security;
alter table checklist_templates enable row level security;
alter table checklist_template_items enable row level security;
alter table event_checklist_items enable row level security;
alter table vendors enable row level security;
alter table uploads enable row level security;
alter table integration_logs enable row level security;
