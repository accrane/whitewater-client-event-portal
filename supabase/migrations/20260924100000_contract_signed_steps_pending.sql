-- Signed-contract follow-up steps still to do. Signing a contract books the
-- event's rooms, moves the GHL opportunity to Booked, resumes paused
-- follow-ups and archives the executed PDF (applySignedContractActions in
-- src/lib/admin/contracts.ts). A step that fails — GHL down, PandaDoc slow,
-- a misconfigured bucket — is listed here and retried on its own by the next
-- sync (the PandaDoc webhook, page views, Refresh status), and the event's
-- Contracts tab shows it as "Still to do". Steps: reservations, ghl_stage,
-- follow_ups, signed_pdf. Automatic retries stop once signed_actions_attempts
-- reaches 10; the webhook and Refresh status always try again.

alter table event_contracts
  add column signed_actions_pending text[] not null default '{}',
  add column signed_actions_attempts integer not null default 0;

-- Contracts signed before this change whose PDF never reached storage (every
-- archive so far failed on the bucket setting) get that one step queued.
update event_contracts
set signed_actions_pending = '{signed_pdf}'
where status = 'completed'
  and signed_actions_applied_at is not null
  and signed_pdf_path is null;
