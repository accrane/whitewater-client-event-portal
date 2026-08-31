-- Aggregates behind the Reports page's "Booked business" section, computed
-- over the Salesforce archive in one round trip. Won opportunities are
-- filtered by event date within [range_start, range_end); undated won
-- opportunities only count in the all-time (null/null) view, matching the
-- portal-event report semantics.
create or replace function sf_booked_business_report(
  range_start date default null,
  range_end date default null
)
returns jsonb
language sql
stable
as $$
  with won as (
    select
      o.account_id,
      o.event_date,
      coalesce(o.total_amount, o.amount, 0) as value
    from sf_opportunities o
    where o.is_won
      and (range_start is null or o.event_date >= range_start)
      and (range_end is null or o.event_date < range_end)
      and (
        o.event_date is not null
        or (range_start is null and range_end is null)
      )
  )
  select jsonb_build_object(
    'wonCount', (select count(*) from won),
    'wonValue', (select coalesce(sum(value), 0) from won),
    'valuedCount', (select count(*) from won where value > 0),
    'undatedWonCount', (
      select count(*) from sf_opportunities
      where is_won and event_date is null
    ),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'count', month_count,
        'value', month_value
      ) order by month)
      from (
        select
          date_trunc('month', event_date)::date as month,
          count(*) as month_count,
          sum(value) as month_value
        from won
        where event_date is not null
        group by 1
      ) months
    ), '[]'::jsonb),
    'topCompanies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sfId', account_sf_id,
        'name', account_name,
        'count', company_count,
        'value', company_value
      ) order by company_value desc)
      from (
        select
          a.sf_id as account_sf_id,
          coalesce(a.name, '(unnamed)') as account_name,
          count(*) as company_count,
          sum(w.value) as company_value
        from won w
        join sf_accounts a on a.sf_id = w.account_id
        group by a.sf_id, a.name
        order by sum(w.value) desc
        limit 10
      ) companies
    ), '[]'::jsonb)
  );
$$;

-- Staging data is service-role-only; keep the aggregate that way too.
revoke execute on function sf_booked_business_report(date, date)
  from anon, authenticated;
