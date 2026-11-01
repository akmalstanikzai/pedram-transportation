-- Read-only: paste into the intended project's Supabase SQL Editor.
-- "Ready" means the listed schema markers exist, not a complete permission audit.
-- Apply only missing migrations, in filename order. Do not rerun ready migrations.
with checks(migration, markers) as (values
 ('202611010001_branch_cashbooks.sql', array[
   to_regclass('public.cashbook_accounts') is not null,
   to_regclass('public.cashbook_entries') is not null]),
 ('202611010002_simplify_cashbook.sql', array[
   to_regprocedure('public.cashbook_simple_post(uuid,jsonb)') is not null]),
 ('202611010003_operations_security.sql', array[
   exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='archived_at'),
   exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='status'),
   to_regprocedure('public.save_fleet_record(text,uuid,uuid,jsonb,timestamp with time zone)') is not null,
   to_regprocedure('public.save_booking_record(uuid,uuid,jsonb,timestamp with time zone)') is not null]),
 ('202611010004_workspace_tools.sql', array[
   to_regprocedure('public.workspace_alerts(integer)') is not null,
   to_regprocedure('public.search_workspace(text,text,integer)') is not null,
   to_regprocedure('public.update_my_profile(text,text)') is not null])
)
select migration, case
 when true = all(markers) then 'Ready - do not rerun'
 when false = all(markers) then 'Missing - apply this migration in order'
 else 'Partial - ask your collaborator to reconcile this migration before continuing'
 end as status
from checks order by migration;
