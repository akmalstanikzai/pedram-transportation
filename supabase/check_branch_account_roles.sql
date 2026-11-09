-- Read-only diagnosis. Run in the trusted Supabase SQL Editor.
-- Every registered branch manager should have role=branch_manager and
-- assigned_branch_id matching registered_branch_id.
select b.name as branch_name,
       b.id as registered_branch_id,
       p.id as manager_user_id,
       p.full_name,
       p.username,
       p.role,
       p.branch_id as assigned_branch_id,
       p.account_enabled,
       case when p.id is null then 'NO_LINKED_ACCOUNT'
            when p.role <> 'branch_manager' then 'WRONG_ROLE'
            when p.branch_id is distinct from b.id then 'WRONG_BRANCH'
            when not p.account_enabled then 'ACCOUNT_DISABLED'
            else 'OK' end as account_check
from public.branches b
left join public.profiles p on p.id=b.manager_user_id
where b.archived_at is null
order by b.name;

-- Counts for the branch portal, assuming the manager account check is OK.
-- Eligible resources here meet the scope/status rules for a booking dated today.
with current_day as (select (now() at time zone 'Asia/Kabul')::date as day)
select b.name as branch_name,
       (select count(*) from public.vehicle_owners o where o.archived_at is null
         and (o.branch_id is null or o.branch_id=b.id)) as visible_owners,
       (select count(*) from public.vehicles v where v.archived_at is null
         and (v.branch_id is null or v.branch_id=b.id)) as visible_vehicles,
       (select count(*) from public.drivers d where d.archived_at is null
         and (d.branch_id is null or d.branch_id=b.id)) as visible_drivers,
       (select count(*) from public.vehicles v join public.vehicle_owners o on o.id=v.owner_id
         where v.archived_at is null and v.status='available'
          and (v.branch_id is null or v.branch_id=b.id)
          and o.archived_at is null and (o.branch_id is null or o.branch_id=b.id)
          and (v.permit_expiry is null or v.permit_expiry>=today.day)) as eligible_vehicles,
       (select count(*) from public.drivers d where d.archived_at is null and d.status='available'
         and (d.branch_id is null or d.branch_id=b.id)
         and (d.license_expiry is null or d.license_expiry>=today.day)) as eligible_drivers
from public.branches b cross join current_day today
where b.archived_at is null
order by b.name;
