-- Rooms book on a contract's first payment, not on signature. A signed
-- contract still moves the GHL opportunity to Booked, resumes follow-ups and
-- archives the PDF; the event's held rooms flip to booked only once the
-- contract is paid — PandaDoc reporting it document.paid, or a coordinator
-- marking it "Paying by check" for a client who pays outside PandaDoc. The
-- rooms step runs once per contract and records rooms_booked_at
-- (signedContractStepsToRun in src/lib/contracts/shared.ts).

alter table event_contracts
  add column pay_by_check_at timestamptz,
  add column pay_by_check_by text,
  add column rooms_booked_at timestamptz;

-- Contracts signed before this change already booked their rooms at
-- signature, so a later payment must not book them again. One whose rooms
-- step failed and is still queued is left to book on payment instead.
update event_contracts
set rooms_booked_at = signed_actions_applied_at
where status = 'completed'
  and signed_actions_applied_at is not null
  and not ('reservations' = any (signed_actions_pending));
