-- Where an event's inquiry came from and whether it is on the fast track.
-- Website inquiries arrive via the GHL webhook ("form"); planners take
-- phone inquiries on the portal's New inquiry page ("phone"). Expedited
-- events (date inside two weeks, or ticked by the planner) skip the normal
-- contract-deadline rule and are badged throughout the admin.

alter table events
  add column inquiry_source text not null default 'form',
  add column expedited boolean not null default false;

alter table events
  add constraint events_inquiry_source_check
  check (inquiry_source in ('form', 'phone'));

create index events_expedited_idx on events (expedited) where expedited;
