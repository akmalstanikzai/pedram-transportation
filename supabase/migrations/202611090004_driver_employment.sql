begin;
alter table public.drivers
 add column if not exists previous_company text,
 add column if not exists destination_company text,
 add column if not exists left_company_at date;

create function public.save_driver_employment(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; prior public.drivers; leaving boolean;
begin
 if p_id is not null then
  select * into prior from public.drivers where id=p_id;
  if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 end if;
 leaving:=p_id is not null and prior.archived_at is null and coalesce((p_data->>'archived')::boolean,false);
 if leaving and nullif(trim(p_data->>'destination_company'),'') is null then raise exception 'REQUIRED_FIELDS'; end if;
 result:=public.save_fleet_record('driver',p_id,p_request,p_data,p_expected);
 update public.drivers set
  previous_company=nullif(trim(p_data->>'previous_company'),''),
  destination_company=case when leaving then trim(p_data->>'destination_company') else destination_company end,
  left_company_at=case when leaving then (now() at time zone 'Asia/Kabul')::date else left_company_at end
 where id=result and (previous_company is distinct from nullif(trim(p_data->>'previous_company'),'') or leaving);
 return result;
end; $$;
revoke all on function public.save_driver_employment(uuid,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_driver_employment(uuid,uuid,jsonb,timestamptz) to authenticated;
commit;
