begin;

-- Row policies still allow branches to read the shared booking directory.
-- Replace whole-table SELECT with grants for its operational columns.
revoke select on public.drivers, public.vehicle_owners from public, anon, authenticated;
revoke select (national_id, license_number) on public.drivers from public, anon, authenticated;
revoke select (national_id) on public.vehicle_owners from public, anon, authenticated;

grant select (
  id, owner_id, full_name, father_name, phone, license_expiry, address, status,
  created_by, created_at, updated_at, branch_id, archived_at, user_id,
  previous_company, destination_company, left_company_at, first_name, surname,
  phone_secondary, province, district, village
) on public.drivers to authenticated;
grant select (
  id, full_name, father_name, phone, address, notes, created_by, created_at,
  updated_at, province, branch_id, archived_at, first_name, surname, district, village
) on public.vehicle_owners to authenticated;

create or replace function public.get_fleet_identifiers(p_kind text, p_ids uuid[])
returns table(id uuid, national_id text, license_number text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
  if p_ids is null or cardinality(p_ids) > 250 then raise exception 'INVALID_FLEET_IDENTIFIERS_REQUEST'; end if;

  if p_kind = 'driver' then
    return query select d.id, d.national_id, d.license_number
    from public.drivers d where d.id = any(p_ids);
  elsif p_kind = 'owner' then
    return query select o.id, o.national_id, null::text
    from public.vehicle_owners o where o.id = any(p_ids);
  else
    raise exception 'INVALID_FLEET_IDENTIFIERS_REQUEST';
  end if;
end; $$;

revoke all on function public.get_fleet_identifiers(text,uuid[]) from public, anon;
grant execute on function public.get_fleet_identifiers(text,uuid[]) to authenticated;

-- Existing Fleet saves write the complete row. Branch edits should preserve
-- protected fields even when the client leaves them out or submits old values.
create or replace function pedram_private.protect_fleet_identifiers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_president_user() then return new; end if;

  new.national_id := case when tg_op = 'UPDATE' then old.national_id else null end;
  if tg_table_name = 'drivers' then
    new.license_number := case when tg_op = 'UPDATE' then old.license_number else null end;
  end if;
  return new;
end; $$;

revoke all on function pedram_private.protect_fleet_identifiers() from public, anon, authenticated;

drop trigger if exists protect_fleet_identifiers on public.drivers;
create trigger protect_fleet_identifiers before insert or update on public.drivers
for each row execute function pedram_private.protect_fleet_identifiers();

drop trigger if exists protect_fleet_identifiers on public.vehicle_owners;
create trigger protect_fleet_identifiers before insert or update on public.vehicle_owners
for each row execute function pedram_private.protect_fleet_identifiers();

notify pgrst, 'reload schema';
commit;
