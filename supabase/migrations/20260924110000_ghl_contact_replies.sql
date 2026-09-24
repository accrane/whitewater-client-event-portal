-- Latest inbound message per GHL contact, pushed by a GHL workflow
-- ("Customer Replied" trigger → Webhook action → POST /api/ghl/replies) so the
-- Opportunities board can flag new client replies without polling GHL. A card
-- shows "New reply" while last_inbound_at is newer than seen_at; seen_at is
-- stamped when someone opens that contact's conversations in the portal.
-- One row per contact that has ever replied (src/lib/ghl/replies.ts).

create table ghl_contact_replies (
  ghl_contact_id text primary key,
  last_inbound_at timestamptz not null default now(),
  seen_at timestamptz
);

alter table ghl_contact_replies enable row level security;
