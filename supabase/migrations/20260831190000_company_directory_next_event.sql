-- "Last event" on the Companies directory was max(event_date) over ALL won
-- opportunities, so companies with 2027 bookings showed a future "last
-- event". The dates are real future bookings ("Booked" = won, upcoming), not
-- bad data — split the stat instead: last_event_date is now the most recent
-- PAST won event, and next_event_date is the soonest upcoming one.

drop view sf_company_directory;

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
    o.next_event_date,
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
      max(event_date) filter (where is_won and event_date <= current_date)
        as last_event_date,
      min(event_date) filter (where is_won and event_date > current_date)
        as next_event_date
    from sf_opportunities
    where account_id is not null
    group by account_id
  ) o on o.account_id = a.sf_id;
