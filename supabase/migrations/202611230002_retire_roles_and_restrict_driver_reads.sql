begin;

-- Keep account identities and linked history. Existing holders of the retired
-- roles cannot sign in until a President deliberately assigns access again.
update public.profiles set account_enabled = false
where role in ('vice_president', 'departmental_manager');

-- Update the installed routines in place so their existing grants and unrelated
-- version-specific behavior are retained.
do $$
declare routine regprocedure; definition text;
begin
  foreach routine in array array[
    'public.is_management_user()'::regprocedure,
    'public.operations_access(uuid)'::regprocedure,
    'public.cashbook_access(uuid)'::regprocedure,
    'public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)'::regprocedure,
    'public.save_booking_record(uuid,uuid,jsonb,timestamptz)'::regprocedure,
    'pedram_private.save_trader_record(uuid,uuid,jsonb,timestamptz)'::regprocedure
  ] loop
    definition := pg_get_functiondef(routine);
    execute regexp_replace(definition, ',[[:space:]]*''vice_president''', '', 'g');
  end loop;
end;
$$;

alter type public.app_role rename to app_role_retired;
create type public.app_role as enum ('president','branch_manager','driver','trader');
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type public.app_role using
  (case when role::text in ('vice_president','departmental_manager') then 'driver' else role::text end)::public.app_role;
alter table public.profiles alter column role set default 'driver';
drop type public.app_role_retired;

-- Drivers use the portal RPC and never receive raw booking rows from PostgREST.
alter policy bookings_read on public.bookings using (public.operations_access(branch_id));
alter policy bookings_scope_guard on public.bookings using (public.operations_access(branch_id));
alter policy vehicles_read on public.vehicles using (public.registry_read_access(branch_id));
alter policy vehicles_scope_guard on public.vehicles using (public.registry_read_access(branch_id));

commit;
