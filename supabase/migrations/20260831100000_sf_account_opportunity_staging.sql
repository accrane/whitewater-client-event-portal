-- Expand the Salesforce → GHL staging middleman (docs/ecosystem-manual.md §4)
-- with Accounts and Opportunities, so the app preserves the client's full
-- booking history (companies, contacts per company, past opportunities,
-- booking roll-ups) beyond the Salesforce cutover. Same pattern as
-- sf_contacts: flattened source fields + full raw record + content hash.

create table sf_accounts (
  sf_id text primary key,

  name text,
  type text,
  phone text,
  website text,
  industry text,
  account_source text,
  billing_street text,
  billing_city text,
  billing_state text,
  billing_postal_code text,
  billing_country text,
  description text,
  owner_id text,
  owner_name text,
  -- Salesforce roll-up summaries over the account's opportunities. Snapshot
  -- values; the app recomputes live equivalents from sf_opportunities.
  number_of_booked_opportunities numeric,
  last_booking_date date,
  sf_created_at timestamptz,
  sf_modified_at timestamptz,

  raw jsonb not null,
  content_hash text not null,
  first_pulled_at timestamptz not null default now(),
  pulled_at timestamptz not null default now()
);

create index sf_accounts_name_idx on sf_accounts (lower(name));
create index sf_accounts_last_booking_idx on sf_accounts (last_booking_date);

alter table sf_accounts enable row level security;

create table sf_opportunities (
  sf_id text primary key,

  name text,
  account_id text,
  -- Primary contact (Opportunity.ContactId); often null on older records.
  contact_id text,
  stage_name text,
  amount numeric,
  total_amount numeric,
  close_date date,
  -- Date__c, labeled "Date of Event" in their org
  event_date date,
  head_count numeric,
  opportunity_type text,
  lead_source text,
  is_closed boolean,
  is_won boolean,
  owner_id text,
  owner_name text,
  sf_created_at timestamptz,
  sf_modified_at timestamptz,

  raw jsonb not null,
  content_hash text not null,
  first_pulled_at timestamptz not null default now(),
  pulled_at timestamptz not null default now()
);

create index sf_opportunities_account_idx on sf_opportunities (account_id);
create index sf_opportunities_contact_idx on sf_opportunities (contact_id);
create index sf_opportunities_event_date_idx on sf_opportunities (event_date);
create index sf_opportunities_stage_idx on sf_opportunities (stage_name);

alter table sf_opportunities enable row level security;

-- Pull runs are now per-object; every existing row was a contact pull.
-- Seen/upserted counts renamed to match.
alter table sf_pull_runs
  add column sf_object text not null default 'contact'
    check (sf_object in ('contact', 'account', 'opportunity'));
alter table sf_pull_runs rename column contacts_seen to records_seen;
alter table sf_pull_runs rename column contacts_upserted to records_upserted;
