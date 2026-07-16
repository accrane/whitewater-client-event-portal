-- Review workflow for client checklist sections: clients mark a section ready
-- from the portal, then the planner either checks it off as complete or
-- reopens it for the client to look at again.

create type checklist_section_status as enum (
  'open',
  'ready_for_review',
  'complete'
);

alter table event_checklist_sections
add column status checklist_section_status not null default 'open';
