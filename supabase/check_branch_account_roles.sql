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
            else 'OK' end as account_check
from public.branches b
left join public.profiles p on p.id=b.manager_user_id
where b.archived_at is null
order by b.name;
