begin;

alter table public.drivers
 add column if not exists first_name text,
 add column if not exists surname text,
 add column if not exists phone_secondary text,
 add column if not exists province text,
 add column if not exists district text,
 add column if not exists village text;

-- Continue using the existing authorized, retry-safe Fleet save and employment
-- flow. Removed form fields and all historical documents remain stored.
create or replace function public.save_driver_employment(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
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
  previous_company=case when p_data ? 'previous_company' then nullif(trim(p_data->>'previous_company'),'') else previous_company end,
  destination_company=case when leaving then trim(p_data->>'destination_company') else destination_company end,
  left_company_at=case when leaving then (now() at time zone 'Asia/Kabul')::date else left_company_at end,
  first_name=coalesce(p_data->>'first_name',first_name),
  surname=coalesce(p_data->>'surname',surname),
  phone_secondary=coalesce(p_data->>'phone_secondary',phone_secondary),
  province=coalesce(p_data->>'province',province),
  district=coalesce(p_data->>'district',district),
  village=coalesce(p_data->>'village',village)
 where id=result and (
  leaving or (p_data ? 'previous_company' and previous_company is distinct from nullif(trim(p_data->>'previous_company'),'')) or
  (first_name,surname,phone_secondary,province,district,village) is distinct from
  (coalesce(p_data->>'first_name',first_name),coalesce(p_data->>'surname',surname),coalesce(p_data->>'phone_secondary',phone_secondary),coalesce(p_data->>'province',province),coalesce(p_data->>'district',district),coalesce(p_data->>'village',village))
 );
 return result;
end; $$;

-- Extend only the driver's permitted document types. Match tokens rather
-- than exact indentation/line endings from a Dashboard SQL Editor copy.
do $$
declare definition text; matched_guard text[];
 guard_pattern text := $pattern$
 p_kind \s* = \s* 'driver' \s+ and \s+ p_type \s+ not \s+ in \s* [(] [^)]* [)]
 $pattern$;
begin
 definition:=pg_get_functiondef('public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date)'::regprocedure);
 matched_guard:=regexp_match(definition,guard_pattern,'ix');
 if matched_guard is null then raise exception 'Driver document type guard was not recognized'; end if;
 if position('''other''' in matched_guard[1])=0 then
  execute replace(definition,matched_guard[1],left(matched_guard[1],length(matched_guard[1])-1)||',''other'')');
 end if;
end; $$;

commit;
