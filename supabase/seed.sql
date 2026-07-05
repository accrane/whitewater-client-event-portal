-- Client Event Portal starter seed data
-- These checklist items are temporary placeholders for building and testing the MVP flow.
-- Replace them once real event templates/checklists are provided.

do $$
declare
  generic_template_id uuid;
begin
  select id into generic_template_id
  from checklist_templates
  where name = 'Generic Starter Event'
  limit 1;

  if generic_template_id is null then
    insert into checklist_templates (name, event_type, description, is_active)
    values (
      'Generic Starter Event',
      null,
      'Temporary starter checklist used while final event templates are being gathered.',
      true
    )
    returning id into generic_template_id;
  else
    update checklist_templates
    set
      event_type = null,
      description = 'Temporary starter checklist used while final event templates are being gathered.',
      is_active = true
    where id = generic_template_id;

    delete from checklist_template_items
    where template_id = generic_template_id;
  end if;

  insert into checklist_template_items (
    template_id,
    title,
    description,
    item_type,
    required,
    client_visible,
    client_completable,
    completion_mode,
    due_offset_days,
    sort_order,
    metadata
  )
  values
    (
      generic_template_id,
      'Confirm arrival details',
      'Placeholder task for the client to review the event date, arrival time, and meeting location shown in the portal.',
      'manual',
      true,
      true,
      true,
      'manual_client',
      30,
      10,
      '{"temporary": true}'::jsonb
    ),
    (
      generic_template_id,
      'Submit vendor information',
      'Placeholder task for entering optional vendor details. Exact vendor fields will be finalized after real templates are provided.',
      'vendor',
      false,
      true,
      false,
      'manual_admin',
      21,
      20,
      '{"temporary": true, "decision_deferred": "Completion behavior depends on final template content."}'::jsonb
    ),
    (
      generic_template_id,
      'Upload requested documents',
      'Placeholder upload task. Uploads move to Needs Review and require planner confirmation before completion.',
      'upload',
      true,
      true,
      false,
      'planner_confirmation',
      14,
      30,
      '{"temporary": true, "allowed_file_types": ["pdf", "jpg", "jpeg", "png", "heic", "heif"], "max_file_size_mb": 25}'::jsonb
    ),
    (
      generic_template_id,
      'Planner final review',
      'Internal placeholder task for planner review before the event. This should not be visible to the client.',
      'admin',
      true,
      false,
      false,
      'manual_admin',
      14,
      40,
      '{"temporary": true}'::jsonb
    );
end $$;
