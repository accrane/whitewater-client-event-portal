-- Who wrote last in each GHL contact's conversation, behind the Opportunities
-- card badges "Client waiting", "Quiet" and "Not contacted". Each board view
-- reads GHL's conversation list once (only the conversations that changed
-- since the newest last_message_at here) and records, per contact, the
-- newest message a person wrote and whose it was. When an automated message
-- came after that person's message, the list can't say whose it was, so
-- needs_check is set and a look at the message history settles it after the
-- page has been sent (src/lib/ghl/conversation-activity.ts). One row per
-- contact with a conversation the portal has seen.

create table ghl_conversation_activity (
  ghl_contact_id text primary key,
  ghl_conversation_id text,
  -- Newest message of any kind, as the list reported it: the sync's
  -- high-water mark. Left null by history look-ups.
  last_message_at timestamptz,
  -- GHL's own "newest message a person wrote" time (lastManualMessageDate)
  -- as the list last reported it; a change means someone wrote again.
  last_manual_at timestamptz,
  -- Newest message a person wrote: the client (inbound) or someone on staff
  -- (outbound, from the portal or GHL). Null when no one has.
  last_human_at timestamptz,
  last_human_direction text
    check (last_human_direction in ('inbound', 'outbound')),
  -- Newest automated (workflow) message, for the badge details.
  last_automated_at timestamptz,
  -- True until the row's last_human_* is known to be current.
  needs_check boolean not null default true,
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index ghl_conversation_activity_last_message_idx
  on ghl_conversation_activity (last_message_at desc nulls last);

alter table ghl_conversation_activity enable row level security;
