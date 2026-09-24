-- One run of a contract's signed steps at a time. The PandaDoc webhook, the
-- portal signer and page-load retries can all reach the same contract within
-- seconds of signing; a run claims the contract by setting
-- signed_actions_running_until (only while it is empty or past) and clears it
-- when it finishes. A run that dies leaves the lease to expire, after which
-- the next sync picks the contract up (applySignedContractActions in
-- src/lib/admin/contracts.ts).

alter table event_contracts
  add column signed_actions_running_until timestamptz;
