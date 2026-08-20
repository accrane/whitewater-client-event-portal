-- Contacts whose email is shared with at least one other staged contact —
-- GHL dedupes on email, so these need review before pushing.
-- security_invoker so the view goes through sf_contacts RLS (service role
-- only); without it the view would leak staging data to the anon role.
create view sf_contact_duplicates
  with (security_invoker = true) as
  select c.*
  from sf_contacts c
  join (
    select lower(email) as email_key
    from sf_contacts
    where email is not null
    group by lower(email)
    having count(*) > 1
  ) d on lower(c.email) = d.email_key;
