-- Staging middleman for the Salesforce → GHL contact migration
-- (docs/ecosystem-manual.md §4). Contacts are pulled here from Salesforce,
-- reviewed and mapped in the admin portal, then pushed to GHL. One-way sync:
-- Salesforce is the source of truth until cutover.

create table sf_contacts (
  sf_id text primary key,

  -- Source fields (flattened from the Contact record + relationships)
  first_name text,
  last_name text,
  email text,
  phone text,
  title text,
  account_id text,
  account_name text,
  mailing_street text,
  mailing_city text,
  mailing_state text,
  mailing_postal_code text,
  mailing_country text,
  lead_source text,
  description text,
  owner_id text,
  owner_name text,
  sf_created_at timestamptz,
  sf_modified_at timestamptz,

  -- Full source record, for fields not flattened above
  raw jsonb not null,

  -- Pull bookkeeping. content_hash covers the mapped source fields so
  -- re-syncs can skip contacts that haven't changed.
  content_hash text not null,
  first_pulled_at timestamptz not null default now(),
  pulled_at timestamptz not null default now(),

  -- Push state, filled in as contacts move through review → GHL
  push_status text not null default 'staged'
    check (push_status in ('staged', 'approved', 'excluded', 'pushed', 'error')),
  ghl_contact_id text,
  ghl_payload jsonb,
  pushed_at timestamptz,
  pushed_hash text,
  push_error text,
  excluded_reason text
);

create index sf_contacts_email_idx on sf_contacts (lower(email));
create index sf_contacts_push_status_idx on sf_contacts (push_status);
create index sf_contacts_sf_modified_idx on sf_contacts (sf_modified_at);

-- Admin-only staging data, accessed exclusively through the service role.
alter table sf_contacts enable row level security;

-- Single-row watermark/log of pull runs, so re-syncs know where to resume.
create table sf_pull_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Max Contact SystemModstamp seen; next incremental pull starts here.
  watermark timestamptz,
  contacts_seen integer not null default 0,
  contacts_upserted integer not null default 0,
  mode text not null check (mode in ('full', 'incremental')),
  error text
);

alter table sf_pull_runs enable row level security;
