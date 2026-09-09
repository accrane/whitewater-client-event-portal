-- PandaDoc contracts created from the admin event page's Contracts tab.
-- One event can carry several contracts (initial agreement, an event-order
-- change, a 50% deposit, ...), and every one stays on the event forever:
-- status and totals mirror PandaDoc (refreshed on page load, from the
-- embedded signer's completion event, and by the PandaDoc webhook), while
-- the line items the planner typed are the app's own record of what was
-- sent. Signed PDFs are copied into Supabase storage so the executed
-- contract survives independently of PandaDoc.

alter type integration_direction add value if not exists 'PANDADOC_TO_PORTAL';
alter type integration_direction add value if not exists 'PORTAL_TO_PANDADOC';

create table event_contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  -- Free-form description/terms the planner adds; sent as a document token.
  description text,
  -- [{ name, description, quantity, unit_price }] as typed in the app.
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  -- App-level lifecycle. pandadoc_status keeps PandaDoc's raw value.
  status text not null default 'draft'
    check (status in ('draft', 'creating', 'sent', 'viewed', 'completed', 'declined', 'voided', 'error')),
  pandadoc_document_id text unique,
  pandadoc_template_id text,
  pandadoc_status text,
  -- Staff link into the PandaDoc app (clients sign inside the portal).
  pandadoc_url text,
  recipient_name text,
  recipient_email text,
  -- Grand total as computed by PandaDoc once the document exists.
  grand_total numeric(12, 2),
  sent_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  -- Set once the signed-contract side effects (rooms booked, GHL stage,
  -- PDF archived) have run, so webhook + sync + signer can't double-apply.
  signed_actions_applied_at timestamptz,
  signed_pdf_bucket text,
  signed_pdf_path text,
  last_error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_contracts_event_idx on event_contracts (event_id, created_at desc);

create trigger set_event_contracts_updated_at
before update on event_contracts
for each row execute function set_updated_at();

alter table event_contracts enable row level security;
