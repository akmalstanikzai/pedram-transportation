-- Run in the live project's SQL Editor before reconciling migration history.
-- Shows schema and migration metadata only. It does not modify the database.
select
  to_regclass('public.employees') is not null as employees_present,
  to_regprocedure('public.employee_payroll_month(integer,integer)') is not null as payroll_rpc_present,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'gross_weight_kg'
  ) as gross_weight_present,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'empty_weight_kg'
  ) as empty_weight_present,
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.vehicles') and conname = 'vehicles_gross_empty_weights_check'
  ) as vehicle_weights_constraint_present,
  coalesce(
    pg_get_functiondef(to_regprocedure('public.save_vehicle_record(uuid,uuid,jsonb,timestamp with time zone)'))
      like '%gross_weight_kg%', false
  ) as vehicle_weight_save_present,
  to_regprocedure('public.get_fleet_identifiers(text,uuid[])') is not null as fleet_identifier_rpc_present,
  (
    not has_column_privilege('authenticated', 'public.drivers', 'national_id', 'select')
    and not has_column_privilege('authenticated', 'public.drivers', 'license_number', 'select')
    and not has_column_privilege('authenticated', 'public.vehicle_owners', 'national_id', 'select')
  ) as fleet_identifiers_protected,
  case
    when to_regclass('supabase_migrations.schema_migrations') is not null then
      query_to_xml(
        $history$
          select version, to_jsonb(m)->>'name' as name
          from supabase_migrations.schema_migrations m
          where version like '20261112%' or version like '20261123%'
          order by version
        $history$, false, false, ''
      )::text
  end as relevant_migration_history;
