-- Simple lifecycle actions requested for the President portal. Preserves existing data.
-- Apply after 202611020001_revert_noman_operations.sql.
begin;
alter table public.bookings add column if not exists archived_at timestamptz;
alter table public.traders add column if not exists archived_at timestamptz, add column if not exists updated_at timestamptz not null default now();
create trigger traders_updated_at before update on public.traders for each row execute procedure public.set_updated_at();
alter table public.vehicles add column if not exists volume_capacity_m3 numeric(12,3) check(volume_capacity_m3 > 0);
create or replace function public.is_management_user() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and account_enabled and role in ('president','vice_president')); $$;
create or replace function public.is_president_user() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and account_enabled and role='president'); $$;
create function public.operations_access(p_branch uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_enabled and (p.role in ('president','vice_president') or (p.role='branch_manager' and p_branch is not null and p.branch_id=p_branch and exists(select 1 from public.branches b where b.id=p_branch and b.archived_at is null))));
$$;
create function public.driver_booking_access(p_driver uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.drivers d join public.profiles p on p.id=d.user_id where d.id=p_driver and p.id=auth.uid() and p.role='driver' and p.account_enabled and d.archived_at is null); $$;
revoke all on function public.is_management_user(),public.is_president_user(),public.operations_access(uuid),public.driver_booking_access(uuid) from public,anon;
grant execute on function public.is_management_user(),public.is_president_user(),public.operations_access(uuid),public.driver_booking_access(uuid) to authenticated;
-- Retain existing policies, including site-specific restrictions. Mandatory
-- restrictive scope guards below prevent permissive policies widening access.
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_president_user());
create policy branches_read on public.branches for select to authenticated using(public.operations_access(id));
create policy owners_read on public.vehicle_owners for select to authenticated using(public.operations_access(branch_id));
create policy vehicles_read on public.vehicles for select to authenticated using(public.operations_access(branch_id) or exists(select 1 from public.bookings b where b.vehicle_id=vehicles.id and public.driver_booking_access(b.driver_id)));
create policy drivers_read on public.drivers for select to authenticated using(public.operations_access(branch_id) or public.driver_booking_access(id));
create policy traders_read on public.traders for select to authenticated using(public.operations_access(branch_id));
create policy bookings_read on public.bookings for select to authenticated using(public.operations_access(branch_id) or public.driver_booking_access(driver_id));
create policy profiles_scope_guard on public.profiles as restrictive for select to authenticated using(id=auth.uid() or public.is_president_user());
create policy branches_scope_guard on public.branches as restrictive for select to authenticated using(public.operations_access(id));
create policy owners_scope_guard on public.vehicle_owners as restrictive for select to authenticated using(public.operations_access(branch_id));
create policy vehicles_scope_guard on public.vehicles as restrictive for select to authenticated using(public.operations_access(branch_id) or exists(select 1 from public.bookings b where b.vehicle_id=vehicles.id and public.driver_booking_access(b.driver_id)));
create policy drivers_scope_guard on public.drivers as restrictive for select to authenticated using(public.operations_access(branch_id) or public.driver_booking_access(id));
create policy traders_scope_guard on public.traders as restrictive for select to authenticated using(public.operations_access(branch_id));
create policy bookings_scope_guard on public.bookings as restrictive for select to authenticated using(public.operations_access(branch_id) or public.driver_booking_access(driver_id));
revoke all on public.profiles,public.branches,public.vehicle_owners,public.vehicles,public.drivers,public.traders,public.bookings,public.vehicle_documents from public,anon,authenticated;
grant select on public.profiles,public.branches,public.vehicle_owners,public.vehicles,public.drivers,public.traders,public.vehicle_documents to authenticated;
-- Historical financial columns are retained, but are not exposed in operational
-- browser/driver reads. Financial access belongs to the separate finance APIs.
grant select(archived_at,id,booking_number,trader_id,vehicle_id,driver_id,service_type,origin,destination,goods,quantity,departure_date,created_by,created_at,booking_date,trader_first_name,trader_last_name,trader_address,trader_phone,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,weight_tons,volume_m3,branch_id,status,arrival_date,updated_at) on public.bookings to authenticated;
revoke all on sequence public.bookings_booking_number_seq from public,anon,authenticated;
create function public.save_fleet_record(p_kind text,p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; prior uuid; record_id uuid:=coalesce(p_id,gen_random_uuid()); stamp timestamptz;
 owner uuid; linked uuid; existing_driver uuid; archived timestamptz; payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor public.profiles;
begin
 select * into actor from public.profiles where id=auth.uid() and account_enabled;
 if not found or actor.role not in ('president','vice_president','branch_manager') then raise exception 'ACCESS_DENIED'; end if;
 if p_kind is null or p_kind not in ('vehicle','owner','driver') then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'fleet:'||p_kind,payload); if prior is not null then return prior; end if;
 bid:=nullif(p_data->>'branch_id','')::uuid;
 if actor.role='branch_manager' then bid:=actor.branch_id; end if;
 if not public.operations_access(bid) or (bid is not null and not exists(select 1 from public.branches where id=bid and archived_at is null)) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is not null then
  if p_kind='vehicle' then select updated_at,branch_id into stamp,bid from public.vehicles where id=p_id for update;
  elsif p_kind='owner' then select updated_at,branch_id into stamp,bid from public.vehicle_owners where id=p_id for update;
  else select updated_at,branch_id into stamp,bid from public.drivers where id=p_id for update; end if;
  if not found or not public.operations_access(bid) then raise exception 'ACCESS_DENIED'; end if;
  if p_expected is null or stamp<>p_expected then raise exception 'STALE_RECORD'; end if;
  if nullif(p_data->>'branch_id','')::uuid is distinct from bid then raise exception 'ACCESS_DENIED'; end if;
 end if;
 archived:=case when coalesce((p_data->>'archived')::boolean,false) then now() else null end;
 if p_kind in ('owner','driver') then
  perform pg_advisory_xact_lock(hashtextextended(p_kind||coalesce(bid::text,'central')||lower(trim(p_data->>'full_name'))||regexp_replace(p_data->>'phone','\s','','g'),4));
  if p_id is null and ((p_kind='owner' and exists(select 1 from public.vehicle_owners where branch_id is not distinct from bid and lower(trim(full_name))=lower(trim(p_data->>'full_name')) and regexp_replace(phone,'\s','','g')=regexp_replace(p_data->>'phone','\s','','g'))) or (p_kind='driver' and exists(select 1 from public.drivers where branch_id is not distinct from bid and lower(trim(full_name))=lower(trim(p_data->>'full_name')) and regexp_replace(phone,'\s','','g')=regexp_replace(p_data->>'phone','\s','','g')))) then raise exception 'DUPLICATE_RECORD'; end if;
 end if;
 if archived is not null or p_data->>'status' in ('inactive','under_repair','assigned','on_trip') then
  if exists(select 1 from public.bookings where status in ('confirmed','in_transit') and ((p_kind='vehicle' and vehicle_id=record_id) or (p_kind='driver' and driver_id=record_id))) then raise exception 'RECORD_IN_USE'; end if;
 end if;
 if p_kind='owner' then
  if coalesce(trim(p_data->>'full_name'),'')='' or coalesce(trim(p_data->>'phone'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
  if archived is not null and (exists(select 1 from public.vehicles where owner_id=record_id and archived_at is null) or exists(select 1 from public.drivers where owner_id=record_id and archived_at is null)) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.vehicle_owners(id,full_name,father_name,phone,national_id,address,notes,province,branch_id,archived_at,created_by)
  values(record_id,trim(p_data->>'full_name'),trim(p_data->>'father_name'),trim(p_data->>'phone'),nullif(trim(p_data->>'national_id'),''),trim(p_data->>'address'),trim(p_data->>'notes'),trim(p_data->>'province'),bid,archived,auth.uid())
  on conflict(id) do update set full_name=excluded.full_name,father_name=excluded.father_name,phone=excluded.phone,national_id=excluded.national_id,address=excluded.address,notes=excluded.notes,province=excluded.province,archived_at=excluded.archived_at;
  if p_id is null and coalesce((p_data->>'owner_is_driver')::boolean,false) then
   perform pg_advisory_xact_lock(hashtextextended('driver'||coalesce(bid::text,'central')||lower(trim(p_data->>'full_name'))||regexp_replace(p_data->>'phone','\s','','g'),4));
   select id into existing_driver from public.drivers where branch_id is not distinct from bid and lower(trim(full_name))=lower(trim(p_data->>'full_name')) and regexp_replace(phone,'\s','','g')=regexp_replace(p_data->>'phone','\s','','g') order by created_at limit 1 for update;
   if existing_driver is not null then
    if exists(select 1 from public.drivers where id=existing_driver and (owner_id is not null or archived_at is not null)) then raise exception 'DUPLICATE_RECORD'; end if;
    update public.drivers set owner_id=record_id where id=existing_driver;
   else
    insert into public.drivers(owner_id,full_name,father_name,phone,national_id,address,license_number,license_expiry,branch_id,created_by)
    values(record_id,trim(p_data->>'full_name'),trim(p_data->>'father_name'),trim(p_data->>'phone'),nullif(trim(p_data->>'national_id'),''),trim(p_data->>'address'),trim(p_data->>'license_number'),nullif(p_data->>'license_expiry','')::date,bid,auth.uid());
   end if;
  end if;
 elsif p_kind='vehicle' then
  owner:=nullif(p_data->>'owner_id','')::uuid;
  perform 1 from public.vehicle_owners where id=owner for update;
  if not exists(select 1 from public.vehicle_owners where id=owner and archived_at is null and branch_id is not distinct from bid) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if coalesce(trim(p_data->>'plate_number'),'')='' or coalesce(trim(p_data->>'vehicle_type'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
  if nullif(p_data->>'capacity_tons','')::numeric<=0 or p_data->>'capacity_tons' in ('NaN','Infinity','-Infinity') or nullif(p_data->>'volume_capacity_m3','')::numeric<=0 or p_data->>'volume_capacity_m3' in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_CAPACITY'; end if;
  if exists(select 1 from public.bookings where vehicle_id=record_id and status in ('confirmed','in_transit') and (volume_m3>coalesce(nullif(p_data->>'volume_capacity_m3','')::numeric,0) or weight_tons>coalesce(nullif(p_data->>'capacity_tons','')::numeric,0) or nullif(p_data->>'permit_expiry','')::date<coalesce(arrival_date,departure_date,booking_date))) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.vehicles(id,owner_id,plate_number,foreign_plate_number,vin_number,vehicle_type,capacity_tons,volume_capacity_m3,model_year,color,status,permit_number,permit_expiry,notes,branch_id,archived_at,created_by)
  values(record_id,owner,upper(regexp_replace(trim(p_data->>'plate_number'),'\s','','g')),upper(trim(p_data->>'foreign_plate_number')),trim(p_data->>'vin_number'),trim(p_data->>'vehicle_type'),nullif(p_data->>'capacity_tons','')::numeric,nullif(p_data->>'volume_capacity_m3','')::numeric,nullif(p_data->>'model_year','')::integer,trim(p_data->>'color'),coalesce(nullif(p_data->>'status',''),'available')::public.vehicle_status,trim(p_data->>'permit_number'),nullif(p_data->>'permit_expiry','')::date,trim(p_data->>'notes'),bid,archived,auth.uid())
  on conflict(id) do update set owner_id=excluded.owner_id,plate_number=excluded.plate_number,foreign_plate_number=excluded.foreign_plate_number,vin_number=excluded.vin_number,vehicle_type=excluded.vehicle_type,capacity_tons=excluded.capacity_tons,volume_capacity_m3=excluded.volume_capacity_m3,model_year=excluded.model_year,color=excluded.color,status=excluded.status,permit_number=excluded.permit_number,permit_expiry=excluded.permit_expiry,notes=excluded.notes,archived_at=excluded.archived_at;
 else
  if coalesce(trim(p_data->>'full_name'),'')='' or coalesce(trim(p_data->>'phone'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
  linked:=nullif(p_data->>'user_id','')::uuid;
  if p_id is not null and not public.is_president_user() then
   if linked is distinct from (select user_id from public.drivers where id=p_id) then raise exception 'ACCESS_DENIED'; end if;
  elsif linked is not null and (not public.is_president_user() or not exists(select 1 from public.profiles where id=linked and role='driver' and account_enabled and branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
  if exists(select 1 from public.bookings where driver_id=record_id and status in ('confirmed','in_transit') and nullif(p_data->>'license_expiry','')::date<coalesce(arrival_date,departure_date,booking_date)) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.drivers(id,full_name,father_name,phone,national_id,license_number,license_expiry,address,status,branch_id,user_id,archived_at,created_by)
  values(record_id,trim(p_data->>'full_name'),trim(p_data->>'father_name'),trim(p_data->>'phone'),nullif(trim(p_data->>'national_id'),''),trim(p_data->>'license_number'),nullif(p_data->>'license_expiry','')::date,trim(p_data->>'address'),coalesce(nullif(p_data->>'status',''),'available')::public.driver_status,bid,linked,archived,auth.uid())
  on conflict(id) do update set full_name=excluded.full_name,father_name=excluded.father_name,phone=excluded.phone,national_id=excluded.national_id,license_number=excluded.license_number,license_expiry=excluded.license_expiry,address=excluded.address,status=excluded.status,user_id=excluded.user_id,archived_at=excluded.archived_at;
 end if;
 if p_kind='driver' then update public.profiles set full_name=trim(p_data->>'full_name'),phone=trim(p_data->>'phone') where id=(select user_id from public.drivers where id=record_id); end if;
 if p_kind='driver' and (archived is not null or p_data->>'status'='inactive') then update public.profiles set account_enabled=false where id=(select user_id from public.drivers where id=record_id); end if;
 perform pedram_private.remember(p_request,'fleet:'||p_kind,payload,record_id); return record_id;
end; $$;
create function public.save_booking_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; trader uuid; vehicle public.vehicles; driver public.drivers; old public.bookings; prior uuid;
 result uuid:=coalesce(p_id,gen_random_uuid()); day date; starts date; ends date; weight numeric; volume numeric;
 payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor_role public.app_role;
begin
 select p.role into actor_role from public.profiles p where id=auth.uid() and account_enabled;
 if actor_role is null or actor_role not in ('president','vice_president','branch_manager') then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'booking',payload); if prior is not null then return prior; end if;
 bid:=nullif(p_data->>'branch_id','')::uuid;
 if actor_role='branch_manager' then select branch_id into bid from public.profiles where id=auth.uid(); end if;
 if not public.operations_access(bid) or (bid is not null and not exists(select 1 from public.branches where id=bid and archived_at is null)) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is not null then
  select * into old from public.bookings where id=p_id for update;
  if not found or not public.operations_access(old.branch_id) or bid is distinct from old.branch_id then raise exception 'ACCESS_DENIED'; end if;
  if p_expected is null or old.updated_at<>p_expected then raise exception 'STALE_RECORD'; end if;
  if old.status<>'confirmed' or old.archived_at is not null then raise exception 'RECORD_LOCKED'; end if;
 end if;
 if exists(select 1 from unnest(array['trader_first_name','trader_phone','trader_address','sender_name','sender_phone','sender_address','receiver_name','receiver_phone','receiver_address','origin','destination','goods']) key where coalesce(trim(p_data->>key),'')='') or p_data->>'service_type' not in ('arrangement','managed') or p_data->>'service_type' is null then raise exception 'REQUIRED_FIELDS'; end if;
 day:=nullif(p_data->>'booking_date','')::date; starts:=nullif(p_data->>'departure_date','')::date; ends:=nullif(p_data->>'arrival_date','')::date;
 if day is null or starts is null or ends is null or starts<day or ends<starts then raise exception 'INVALID_DATES'; end if;
 weight:=nullif(p_data->>'weight_tons','')::numeric; volume:=nullif(p_data->>'volume_m3','')::numeric;
 if (weight is null and volume is null) or weight<=0 or volume<=0 or weight<>round(weight,3) or volume<>round(volume,3) or weight::text in ('NaN','Infinity','-Infinity') or volume::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_MEASUREMENT'; end if;
 -- Row locks serialize conflicting reservations, even with different request IDs.
 perform 1 from public.vehicles where id=nullif(p_data->>'vehicle_id','')::uuid for update;
 perform 1 from public.drivers where id=nullif(p_data->>'driver_id','')::uuid for update;
 select * into vehicle from public.vehicles where id=nullif(p_data->>'vehicle_id','')::uuid;
 select * into driver from public.drivers where id=nullif(p_data->>'driver_id','')::uuid;
 if vehicle.id is null or driver.id is null or (vehicle.branch_id is not null and vehicle.branch_id is distinct from bid) or (driver.branch_id is not null and driver.branch_id is distinct from bid) or vehicle.archived_at is not null or driver.archived_at is not null or vehicle.status in ('inactive','under_repair','on_trip','assigned') or driver.status<>'available' or not exists(select 1 from public.vehicle_owners where id=vehicle.owner_id and archived_at is null) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 if vehicle.permit_expiry<ends or driver.license_expiry<ends then raise exception 'DOCUMENT_EXPIRED'; end if;
 if weight is not null and vehicle.capacity_tons is null then raise exception 'CAPACITY_REQUIRED'; end if;
 if volume is not null and vehicle.volume_capacity_m3 is null then raise exception 'VOLUME_CAPACITY_REQUIRED'; end if;
 if volume>vehicle.volume_capacity_m3 then raise exception 'CAPACITY_EXCEEDED'; end if;
 if weight>vehicle.capacity_tons then raise exception 'CAPACITY_EXCEEDED'; end if;
 if exists(select 1 from public.bookings b where b.id<>result and b.status in ('confirmed','in_transit') and (b.vehicle_id=vehicle.id or b.driver_id=driver.id) and coalesce(b.departure_date,b.booking_date)<=ends and coalesce(b.arrival_date,b.departure_date,b.booking_date)>=starts) then raise exception 'RESOURCE_CONFLICT'; end if;
 trader:=nullif(p_data->>'trader_id','')::uuid;
 if trader is not null then
  if not exists(select 1 from public.traders t where t.id=trader and t.archived_at is null and (t.branch_id is null or t.branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('trader:'||lower(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))))||regexp_replace(p_data->>'trader_phone','[^0-9]','','g'),7));
  select id into trader from public.traders t where (t.branch_id is null or t.branch_id is not distinct from bid) and t.archived_at is null and lower(trim(t.full_name))=lower(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),'')))) and regexp_replace(t.phone,'[^0-9]','','g')=regexp_replace(p_data->>'trader_phone','[^0-9]','','g') order by created_at limit 1;
  if trader is null then
   if exists(select 1 from public.traders t where lower(trim(t.full_name))=lower(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),'')))) and regexp_replace(t.phone,'[^0-9]','','g')=regexp_replace(p_data->>'trader_phone','[^0-9]','','g')) then raise exception 'DUPLICATE_RECORD'; end if;
   insert into public.traders(full_name,first_name,last_name,phone,address,branch_id) values(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))),trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),bid) returning id into trader;
  end if;
 end if;
 insert into public.bookings(id,trader_id,vehicle_id,driver_id,branch_id,booking_date,departure_date,arrival_date,service_type,trader_first_name,trader_last_name,trader_phone,trader_address,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,goods,weight_tons,volume_m3,origin,destination,created_by)
 values(result,trader,vehicle.id,driver.id,bid,day,starts,ends,p_data->>'service_type',trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),coalesce((p_data->>'sender_is_trader')::boolean,false),case when (p_data->>'sender_is_trader')::boolean then trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))) else trim(p_data->>'sender_name') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_phone') else trim(p_data->>'sender_phone') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_address') else trim(p_data->>'sender_address') end,trim(p_data->>'receiver_name'),trim(p_data->>'receiver_phone'),trim(p_data->>'receiver_address'),trim(p_data->>'goods'),weight,volume,trim(p_data->>'origin'),trim(p_data->>'destination'),auth.uid())
 on conflict(id) do update set trader_id=excluded.trader_id,vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,booking_date=excluded.booking_date,departure_date=excluded.departure_date,arrival_date=excluded.arrival_date,service_type=excluded.service_type,trader_first_name=excluded.trader_first_name,trader_last_name=excluded.trader_last_name,trader_phone=excluded.trader_phone,trader_address=excluded.trader_address,sender_is_trader=excluded.sender_is_trader,sender_name=excluded.sender_name,sender_phone=excluded.sender_phone,sender_address=excluded.sender_address,receiver_name=excluded.receiver_name,receiver_phone=excluded.receiver_phone,receiver_address=excluded.receiver_address,goods=excluded.goods,weight_tons=excluded.weight_tons,volume_m3=excluded.volume_m3,origin=excluded.origin,destination=excluded.destination;
 perform pedram_private.remember(p_request,'booking',payload,result); return result;
end; $$;
create or replace function public.create_booking_record(p_data jsonb) returns uuid language sql security invoker set search_path='' as $$ select public.save_booking_record(null,(p_data->>'request_id')::uuid,p_data); $$;
create function public.change_booking_status(p_id uuid,p_status text,p_request uuid,p_expected timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.bookings; prior uuid; payload jsonb:=jsonb_build_object('id',p_id,'status',p_status);
begin
 select * into b from public.bookings where id=p_id for update;
 if not found or not public.operations_access(b.branch_id) then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'booking-status',payload); if prior is not null then return prior; end if;
 if b.updated_at<>p_expected or p_expected is null then raise exception 'STALE_RECORD'; end if;
 if b.archived_at is not null then raise exception 'RECORD_LOCKED'; end if;
 if p_status='in_transit' and (
   exists(select 1 from public.vehicles v where v.id=b.vehicle_id and (v.archived_at is not null or v.status<>'available' or v.permit_expiry<greatest((now() at time zone 'Asia/Kabul')::date,coalesce(b.arrival_date,b.departure_date,b.booking_date)))) or
   exists(select 1 from public.drivers d where d.id=b.driver_id and (d.archived_at is not null or d.status<>'available' or d.license_expiry<greatest((now() at time zone 'Asia/Kabul')::date,coalesce(b.arrival_date,b.departure_date,b.booking_date))))
 ) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 if not ((b.status='confirmed' and p_status in ('in_transit','cancelled')) or (b.status='in_transit' and p_status in ('completed','cancelled'))) then raise exception 'INVALID_TRANSITION'; end if;
 update public.bookings set status=p_status where id=p_id;
 perform pedram_private.remember(p_request,'booking-status',payload,p_id); return p_id;
end; $$;
create function public.save_branch_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null,p_manager uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior uuid; result uuid:=coalesce(p_id,gen_random_uuid()); b public.branches; manager uuid; payload jsonb:=jsonb_build_object('id',p_id,'data',p_data,'manager',p_manager);
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'branch',payload); if prior is not null then return prior; end if;
 if coalesce(trim(p_data->>'name'),'')='' or coalesce(trim(p_data->>'province'),'')='' or coalesce(trim(p_data->>'city'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_data->>'name'))||lower(trim(p_data->>'province'))||lower(trim(p_data->>'city')),5));
 if exists(select 1 from public.branches where id<>result and lower(trim(name))=lower(trim(p_data->>'name')) and lower(trim(province))=lower(trim(p_data->>'province')) and lower(trim(city))=lower(trim(p_data->>'city'))) then raise exception 'DUPLICATE_RECORD'; end if;
 if p_id is not null then
  select * into b from public.branches where id=p_id for update;
  if not found or p_expected is null or p_expected<>b.updated_at then raise exception 'STALE_RECORD'; end if;
 end if;
 manager:=coalesce(p_manager,nullif(p_data->>'manager_user_id','')::uuid);
 if manager is not null then
  perform 1 from public.profiles where id=manager for update;
  if not exists(select 1 from public.profiles where id=manager and role='branch_manager') then raise exception 'ACCESS_DENIED'; end if;
  if exists(select 1 from public.branches where manager_user_id=manager and id<>result and archived_at is null) then raise exception 'MANAGER_ASSIGNED'; end if;
 end if;
 if coalesce((p_data->>'archived')::boolean,false) and exists(select 1 from public.bookings where branch_id=result and status in ('confirmed','in_transit')) then raise exception 'RECORD_IN_USE'; end if;
 insert into public.branches(id,name,province,city,address,phone,manager_user_id,archived_at,creation_request,created_by)
 values(result,trim(p_data->>'name'),trim(p_data->>'province'),trim(p_data->>'city'),trim(p_data->>'address'),trim(p_data->>'phone'),manager,case when coalesce((p_data->>'archived')::boolean,false) then now() else null end,p_request,auth.uid())
 on conflict(id) do update set name=excluded.name,province=excluded.province,city=excluded.city,address=excluded.address,phone=excluded.phone,manager_user_id=excluded.manager_user_id,archived_at=excluded.archived_at;
 if b.manager_user_id is not null and b.manager_user_id is distinct from manager then update public.profiles set branch_id=null,account_enabled=false where id=b.manager_user_id; end if;
 if manager is not null then
  update public.profiles set branch_id=result,account_enabled=not coalesce((p_data->>'archived')::boolean,false) and coalesce((p_data->>'manager_enabled')::boolean,true),full_name=coalesce(nullif(trim(p_data->>'manager_name'),''),full_name),phone=coalesce(nullif(trim(p_data->>'manager_phone'),''),phone),father_name=coalesce(p_data->>'father_name',father_name),national_id=coalesce(p_data->>'national_id',national_id),address=coalesce(p_data->>'manager_address',address) where id=manager;
 end if;
 perform pedram_private.remember(p_request,'branch',payload,result); return result;
end; $$;
-- Service role only: the Edge Function verifies the caller, and this function
-- rechecks the actor before atomically provisioning the branch/profile pairing.
create function public.provision_branch(p_actor uuid,p_request uuid,p_manager uuid,p_data jsonb,p_username text,p_branch uuid default null,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; prior public.branches;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='president' and account_enabled) then raise exception 'ACCESS_DENIED'; end if;
 select * into prior from public.branches where creation_request=p_request;
 if found then if prior.created_by<>p_actor then raise exception 'ACCESS_DENIED'; end if; return prior.id; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.profiles set role='branch_manager',username=p_username where id=p_manager;
 if not found then raise exception 'PROFILE_MISSING'; end if;
 result:=public.save_branch_record(p_branch,p_request,p_data,p_expected,p_manager);
 return result;
end; $$;
revoke all on function public.provision_branch(uuid,uuid,uuid,jsonb,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.provision_branch(uuid,uuid,uuid,jsonb,text,uuid,timestamptz) to service_role;
-- Auth and Postgres cannot share a transaction. Admin-only app metadata lets
-- the same request recover its Auth user after an Edge/network interruption.
create function public.find_branch_provisioning_account(p_actor uuid,p_request uuid,p_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='president' and account_enabled) then raise exception 'ACCESS_DENIED'; end if;
 select id into result from auth.users where lower(email)=lower(p_email) and raw_app_meta_data->>'pedram_provisioning_request'=p_request::text and raw_app_meta_data->>'pedram_provisioning_actor'=p_actor::text;
 return result;
end; $$;
revoke all on function public.find_branch_provisioning_account(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.find_branch_provisioning_account(uuid,uuid,text) to service_role;
create function public.document_path_access(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vehicle_documents d left join public.vehicles v on v.id=d.vehicle_id left join public.vehicle_owners o on o.id=d.owner_id left join public.drivers r on r.id=d.driver_id where d.storage_path=p_path and public.operations_access(coalesce(v.branch_id,o.branch_id,r.branch_id)));
$$;
create policy documents_read on public.vehicle_documents for select to authenticated using(public.document_path_access(storage_path));
create policy documents_scope_guard on public.vehicle_documents as restrictive for select to authenticated using(public.document_path_access(storage_path));
create function public.reserve_fleet_document(p_id uuid,p_kind text,p_parent uuid,p_type text,p_name text,p_mime text,p_size integer,p_expires date default null) returns text
language plpgsql security definer set search_path='' as $$
declare bid uuid; path text; ext text:=lower(reverse(split_part(reverse(p_name),'.',1))); prior public.vehicle_documents;
begin
 if p_kind='vehicle' then select branch_id into bid from public.vehicles where id=p_parent and archived_at is null;
 elsif p_kind='owner' then select branch_id into bid from public.vehicle_owners where id=p_parent and archived_at is null;
 elsif p_kind='driver' then select branch_id into bid from public.drivers where id=p_parent and archived_at is null;
 else raise exception 'ACCESS_DENIED'; end if;
 if not found or not public.operations_access(bid) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is null or p_size is null or p_size<=0 or p_size>20971520 or length(p_name)>255 or ext not in ('pdf','png','jpg','jpeg','webp','heic','heif','tif','tiff') or p_mime is distinct from (case ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'webp' then 'image/webp' when 'heic' then 'image/heic' when 'heif' then 'image/heif' else 'image/tiff' end) then raise exception 'INVALID_FILE'; end if;
 if (p_kind='vehicle' and p_type not in ('photos','permit','card','booklet','international')) or (p_kind='owner' and p_type<>'identity') or (p_kind='driver' and p_type not in ('identity','licence','health','contract')) or p_type is null then raise exception 'INVALID_FILE'; end if;
 path:=p_kind||'/'||p_parent||'/'||p_type||'/'||p_id||'.'||ext;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,3));
 select * into prior from public.vehicle_documents where id=p_id;
 if found then
  if prior.storage_path<>path or prior.file_name<>p_name or prior.mime_type<>p_mime or prior.file_size<>p_size or prior.state='deleting' then raise exception 'REQUEST_CONFLICT'; end if;
  return path;
 end if;
 insert into public.vehicle_documents(id,vehicle_id,owner_id,driver_id,document_type,file_name,storage_path,mime_type,file_size,expires_on,state,uploaded_by)
 values(p_id,case when p_kind='vehicle' then p_parent end,case when p_kind='owner' then p_parent end,case when p_kind='driver' then p_parent end,p_type,p_name,path,p_mime,p_size,p_expires,'pending',auth.uid());
 return path;
end; $$;
create function public.complete_fleet_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.vehicle_documents;
begin
 select * into d from public.vehicle_documents where id=p_id for update;
 if not found or not public.document_path_access(d.storage_path) or d.state='deleting' then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from storage.objects where bucket_id='fleet-documents' and name=d.storage_path) then raise exception 'INVALID_FILE'; end if;
 update public.vehicle_documents set state='ready' where id=p_id;
end; $$;
create function public.remove_fleet_document(p_id uuid,p_finish boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare d public.vehicle_documents;
begin
 select * into d from public.vehicle_documents where id=p_id for update;
 if not found then return; end if;
 if not public.document_path_access(d.storage_path) then raise exception 'ACCESS_DENIED'; end if;
 if p_finish then
  if exists(select 1 from storage.objects where bucket_id='fleet-documents' and name=d.storage_path) then raise exception 'RECORD_IN_USE'; end if;
  delete from public.vehicle_documents where id=p_id;
 else update public.vehicle_documents set state='deleting' where id=p_id; end if;
end; $$;
create function public.set_fleet_document_expiry(p_id uuid,p_expires date) returns void language plpgsql security definer set search_path='' as $$
declare d public.vehicle_documents;
begin
 select * into d from public.vehicle_documents where id=p_id for update;
 if not found or not public.document_path_access(d.storage_path) or d.state<>'ready' then raise exception 'ACCESS_DENIED'; end if;
 update public.vehicle_documents set expires_on=p_expires where id=p_id;
end; $$;
-- Recover associations for legacy uploads. Their original filenames cannot be recovered.
insert into public.vehicle_documents(vehicle_id,owner_id,driver_id,document_type,file_name,storage_path,mime_type,file_size,state,uploaded_by)
select v.id,o.id,d.id,split_part(s.name,'/',3),split_part(s.name,'/',4),s.name,s.metadata->>'mimetype',nullif(s.metadata->>'size','')::integer,'ready',coalesce(v.created_by,o.created_by,d.created_by)
from storage.objects s
left join public.vehicles v on split_part(s.name,'/',1)='vehicle' and v.id::text=split_part(s.name,'/',2)
left join public.vehicle_owners o on split_part(s.name,'/',1)='owner' and o.id::text=split_part(s.name,'/',2)
left join public.drivers d on split_part(s.name,'/',1)='driver' and d.id::text=split_part(s.name,'/',2)
where s.bucket_id='fleet-documents' and num_nonnulls(v.id,o.id,d.id)=1 and split_part(s.name,'/',4)<>'' on conflict(storage_path) do nothing;
update storage.buckets set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf','image/png','image/jpeg','image/webp','image/heic','image/heif','image/tiff'] where id='fleet-documents';
drop policy if exists "Management can read fleet documents" on storage.objects;
drop policy if exists "Management can upload fleet documents" on storage.objects;
create policy fleet_objects_read on storage.objects for select to authenticated using(bucket_id='fleet-documents' and public.document_path_access(name));
create policy fleet_objects_insert on storage.objects for insert to authenticated with check(bucket_id='fleet-documents' and public.document_path_access(name) and exists(select 1 from public.vehicle_documents d where d.storage_path=name and d.state='pending'));
create policy fleet_objects_delete on storage.objects for delete to authenticated using(bucket_id='fleet-documents' and public.document_path_access(name) and exists(select 1 from public.vehicle_documents d where d.storage_path=name and d.state='deleting'));
create policy fleet_objects_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'fleet-documents' or public.document_path_access(name));
create policy fleet_objects_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'fleet-documents' or (public.document_path_access(name) and exists(select 1 from public.vehicle_documents d where d.storage_path=name and d.state='pending')));
create policy fleet_objects_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'fleet-documents' or (public.document_path_access(name) and exists(select 1 from public.vehicle_documents d where d.storage_path=name and d.state='deleting')));
create policy fleet_objects_no_overwrite on storage.objects as restrictive for update to authenticated using(bucket_id<>'fleet-documents') with check(bucket_id<>'fleet-documents');
create policy fleet_objects_no_anonymous_access on storage.objects as restrictive for all to anon using(bucket_id<>'fleet-documents') with check(bucket_id<>'fleet-documents');
revoke all on function public.document_path_access(text),public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz),public.save_booking_record(uuid,uuid,jsonb,timestamptz),public.create_booking_record(jsonb),public.change_booking_status(uuid,text,uuid,timestamptz),public.save_branch_record(uuid,uuid,jsonb,timestamptz,uuid),public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date),public.complete_fleet_document(uuid),public.remove_fleet_document(uuid,boolean) from public,anon;
grant execute on function public.document_path_access(text),public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz),public.save_booking_record(uuid,uuid,jsonb,timestamptz),public.create_booking_record(jsonb),public.change_booking_status(uuid,text,uuid,timestamptz),public.save_branch_record(uuid,uuid,jsonb,timestamptz,uuid),public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date),public.complete_fleet_document(uuid),public.remove_fleet_document(uuid,boolean) to authenticated;
revoke all on function public.set_fleet_document_expiry(uuid,date) from public,anon;
grant execute on function public.set_fleet_document_expiry(uuid,date) to authenticated;

create function public.save_trader_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid:=coalesce(p_id,gen_random_uuid()); prior uuid; old public.traders;
 v_first text:=trim(p_data->>'first_name'); v_last text:=trim(p_data->>'last_name');
 v_phone text:=trim(p_data->>'phone'); v_name text; fingerprint jsonb:=jsonb_build_object('id',p_id,'data',p_data);
begin
 if not public.is_management_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'trader',fingerprint); if prior is not null then return prior; end if;
 if coalesce(v_first,'')='' or coalesce(v_phone,'')='' then raise exception 'REQUIRED_FIELDS'; end if;
 v_name:=trim(concat_ws(' ',v_first,nullif(v_last,'')));
 perform pg_advisory_xact_lock(hashtextextended('trader:'||lower(v_name)||regexp_replace(v_phone,'[^0-9]','','g'),7));
 if exists(select 1 from public.traders t where t.id<>result and lower(trim(t.full_name))=lower(v_name) and regexp_replace(t.phone,'[^0-9]','','g')=regexp_replace(v_phone,'[^0-9]','','g')) then raise exception 'DUPLICATE_RECORD'; end if;
 if p_id is not null then
  select * into old from public.traders where id=p_id for update;
  if not found or p_expected is null or old.updated_at<>p_expected then raise exception 'STALE_RECORD'; end if;
 end if;
 if coalesce((p_data->>'archived')::boolean,false) and exists(select 1 from public.bookings where trader_id=result and status in ('confirmed','in_transit') and archived_at is null) then raise exception 'RECORD_IN_USE'; end if;
 insert into public.traders(id,full_name,first_name,last_name,phone,address,archived_at)
 values(result,v_name,v_first,v_last,v_phone,trim(p_data->>'address'),case when coalesce((p_data->>'archived')::boolean,false) then now() else null end)
 on conflict(id) do update set full_name=excluded.full_name,first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,address=excluded.address,archived_at=excluded.archived_at;
 perform pedram_private.remember(p_request,'trader',fingerprint,result); return result;
end; $$;

create function public.archive_booking_record(p_id uuid,p_archived boolean,p_expected timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 select * into b from public.bookings where id=p_id for update;
 if not found or not public.operations_access(b.branch_id) then raise exception 'ACCESS_DENIED'; end if;
 if p_expected is null or p_expected<>b.updated_at then raise exception 'STALE_RECORD'; end if;
 if b.status='in_transit' then raise exception 'RECORD_IN_USE'; end if;
 update public.bookings set archived_at=case when p_archived then now() else null end,
 status=case when p_archived and status='confirmed' then 'cancelled' else status end where id=p_id;
end; $$;

create function public.set_account_enabled(p_kind text,p_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_kind='branch' then
  select manager_user_id into account from public.branches where id=p_id and archived_at is null for update;
 elsif p_kind='driver' then
  select user_id into account from public.drivers where id=p_id and archived_at is null and (not p_enabled or status<>'inactive') for update;
 else raise exception 'ACCESS_DENIED'; end if;
 if account is null then raise exception 'ACCOUNT_MISSING'; end if;
 update public.profiles set account_enabled=p_enabled where id=account and role in ('branch_manager','driver');
end; $$;

-- Edge Function only. Never link an arbitrary existing authentication account.
create function public.link_driver_account(p_actor uuid,p_driver uuid,p_user uuid,p_request uuid,p_username text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.drivers;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='president' and account_enabled) then raise exception 'ACCESS_DENIED'; end if;
 select * into d from public.drivers where id=p_driver and archived_at is null and status<>'inactive' for update;
 if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 if d.user_id is not null then
  if d.user_id=p_user then return p_user; end if;
  raise exception 'ACCOUNT_ALREADY_LINKED';
 end if;
 if not exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'pedram_driver_request'=p_request::text and raw_app_meta_data->>'pedram_driver_actor'=p_actor::text and raw_app_meta_data->>'pedram_driver_id'=p_driver::text) then raise exception 'ACCESS_DENIED'; end if;
 update public.profiles set role='driver',full_name=d.full_name,phone=d.phone,branch_id=d.branch_id,username=p_username,account_enabled=true where id=p_user;
 if not found then raise exception 'PROFILE_MISSING'; end if;
 update public.drivers set user_id=p_user where id=p_driver;
 return p_user;
end; $$;
create function public.find_driver_account(p_actor uuid,p_driver uuid,p_request uuid,p_email text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='president' and account_enabled) then raise exception 'ACCESS_DENIED'; end if;
 return (select id from auth.users where lower(email)=lower(p_email) and raw_app_meta_data->>'pedram_driver_request'=p_request::text and raw_app_meta_data->>'pedram_driver_actor'=p_actor::text and raw_app_meta_data->>'pedram_driver_id'=p_driver::text);
end; $$;
revoke all on function public.save_trader_record(uuid,uuid,jsonb,timestamptz),public.archive_booking_record(uuid,boolean,timestamptz),public.set_account_enabled(text,uuid,boolean) from public,anon;
grant execute on function public.save_trader_record(uuid,uuid,jsonb,timestamptz),public.archive_booking_record(uuid,boolean,timestamptz),public.set_account_enabled(text,uuid,boolean) to authenticated;
revoke all on function public.link_driver_account(uuid,uuid,uuid,uuid,text),public.find_driver_account(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.link_driver_account(uuid,uuid,uuid,uuid,text),public.find_driver_account(uuid,uuid,uuid,text) to service_role;
commit;

