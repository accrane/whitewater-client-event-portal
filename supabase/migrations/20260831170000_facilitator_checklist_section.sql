-- Adds a "Provide your event facilitator" section to the client checklist
-- template, backing the new facilitator workflow (client submits the on-site
-- contact through the portal; the app mirrors it to GHL facilitator fields
-- and a tagged GHL contact). Template-only: existing events keep their
-- current checklists; the section lands on events when a planner applies the
-- template. Planners can delete it per event when no separate facilitator
-- exists.

insert into checklist_template_sections (title, content_html, sort_order)
select
  'Provide your event facilitator''s contact info',
  '<p>If someone besides you will run point on event day — a facilitator, on-site lead, or day-of coordinator — we need their contact info so our team can coordinate with them directly.</p><p>In the <strong>Event facilitator</strong> card below on this page, either tick <strong>Same as our current contact</strong> (if the person we''ve been working with will also run the event day) or enter the facilitator''s name, email, and phone. Then mark this item ready for review.</p>',
  coalesce((select max(sort_order) + 1 from checklist_template_sections), 0)
where not exists (
  select 1
  from checklist_template_sections
  where title = 'Provide your event facilitator''s contact info'
);
