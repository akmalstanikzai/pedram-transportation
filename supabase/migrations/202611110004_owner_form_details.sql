begin;

alter table public.vehicle_owners
 add column if not exists first_name text,
 add column if not exists surname text,
 add column if not exists district text,
 add column if not exists village text;

-- Reuse the installed Fleet save for authorization, scope, locking and retry
-- checks instead of matching or rewriting a hosted function's SQL text.
create or replace function public.save_owner_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 result:=public.save_fleet_record('owner',p_id,p_request,p_data,p_expected);
 update public.vehicle_owners set
  first_name=coalesce(p_data->>'first_name',first_name),
  surname=coalesce(p_data->>'surname',surname),
  district=coalesce(p_data->>'district',district),
  village=coalesce(p_data->>'village',village)
 where id=result and (first_name,surname,district,village) is distinct from
  (coalesce(p_data->>'first_name',first_name),coalesce(p_data->>'surname',surname),coalesce(p_data->>'district',district),coalesce(p_data->>'village',village));
 return result;
end; $$;

revoke all on function public.save_owner_record(uuid,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_owner_record(uuid,uuid,jsonb,timestamptz) to authenticated;

commit;
