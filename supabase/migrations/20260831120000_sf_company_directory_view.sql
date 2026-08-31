-- Directory view behind /admin/companies: one row per staged Salesforce
-- account with live stats computed from sf_contacts/sf_opportunities —
-- deliberately NOT the account's frozen roll-up snapshot columns.
-- Their org's stages: "Booked" = won, event upcoming; "Event Occured" =
-- won, event happened. Both count as won business; the Salesforce
-- Number_of_Booked_Opportunities__c roll-up only counted "Booked".
-- security_invoker so the view goes through the tables' RLS (service role
-- only); without it the view would leak staging data to the anon role.
create view sf_company_directory
  with (security_invoker = true) as
  select
    a.sf_id,
    a.name,
    a.type,
    a.owner_name,
    a.billing_city,
    a.billing_state,
    a.phone,
    a.website,
    coalesce(c.contact_count, 0) as contact_count,
    coalesce(o.opportunity_count, 0) as opportunity_count,
    coalesce(o.won_count, 0) as won_count,
    coalesce(o.upcoming_booked_count, 0) as upcoming_booked_count,
    o.last_event_date,
    (count(*) over (partition by lower(a.name))) > 1 as has_name_dupes
  from sf_accounts a
  left join (
    select account_id, count(*) as contact_count
    from sf_contacts
    where account_id is not null
    group by account_id
  ) c on c.account_id = a.sf_id
  left join (
    select
      account_id,
      count(*) as opportunity_count,
      count(*) filter (where is_won) as won_count,
      count(*) filter (where stage_name = 'Booked') as upcoming_booked_count,
      max(event_date) filter (where is_won) as last_event_date
    from sf_opportunities
    where account_id is not null
    group by account_id
  ) o on o.account_id = a.sf_id;
