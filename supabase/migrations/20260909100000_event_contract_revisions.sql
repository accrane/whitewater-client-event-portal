-- Contracts can be edited while unsigned: the same PandaDoc document is
-- moved back to draft, updated with the new name/terms/line items, and
-- re-sent. Track how many times that happened and by whom so the event
-- shows "revised" rather than silently overwriting what was sent.
alter table event_contracts
  add column revision integer not null default 1,
  add column revised_at timestamptz,
  add column revised_by text;
