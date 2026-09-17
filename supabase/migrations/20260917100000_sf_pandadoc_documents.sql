-- PandaDoc documents from the Salesforce archive (docs/developer-notes.md §2).
-- Their org runs the PandaDoc managed package, which keeps one
-- pandadoc__PandaDocDocument__c row per document, linked to its Opportunity
-- and carrying the PandaDoc document UUID. Staging them lets the booking
-- history link each past event to its contract(s) in PandaDoc.
--
-- Deliberately NOT stored: the package's InputJSON payload. It embeds each
-- recipient's tokenized shared_link (opens the document without a login);
-- the pull lifts the total and sent/completed dates out of it and drops it.

create table sf_pandadoc_documents (
  sf_id text primary key,

  name text,
  opportunity_id text,
  account_id text,
  -- PandaDoc document id; the app link is app.pandadoc.com/a/#/documents/{uuid}
  pandadoc_uuid text,
  -- PandaDoc's own status string, e.g. document.completed / document.paid
  status text,
  template_name text,
  total numeric,
  date_sent timestamptz,
  date_completed timestamptz,
  -- pandadoc__Is_Deleted__c: removed in PandaDoc, so the link would be dead
  is_deleted boolean,
  sf_created_at timestamptz,
  sf_modified_at timestamptz,

  raw jsonb not null,
  content_hash text not null,
  first_pulled_at timestamptz not null default now(),
  pulled_at timestamptz not null default now()
);

create index sf_pandadoc_documents_opportunity_idx
  on sf_pandadoc_documents (opportunity_id);

alter table sf_pandadoc_documents enable row level security;

alter table sf_pull_runs
  drop constraint sf_pull_runs_sf_object_check;
alter table sf_pull_runs
  add constraint sf_pull_runs_sf_object_check
    check (sf_object in ('contact', 'account', 'opportunity', 'pandadoc_document'));
