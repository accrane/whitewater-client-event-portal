-- Templates with a PandaDoc approval workflow park a sent document in
-- document.waiting_approval until someone approves it in PandaDoc; the
-- client can't sign until then. Track that as its own app status so the
-- portal doesn't offer signing and the planner sees what's blocking it.
alter table event_contracts drop constraint event_contracts_status_check;
alter table event_contracts add constraint event_contracts_status_check
  check (status in ('draft', 'creating', 'approval', 'sent', 'viewed', 'completed', 'declined', 'voided', 'error'));
