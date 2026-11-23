begin;

alter table public.bookings
  add column handoff_location text,
  add column handoff_date date,
  add column onward_vehicle_id uuid references public.vehicles(id),
  add column onward_driver_id uuid references public.drivers(id),
  add column journey_started_at timestamptz,
  add column handoff_confirmed_at timestamptz,
  add column handoff_confirmed_by uuid references public.profiles(id),
  add column onward_driver_accepted_at timestamptz,
  add column onward_driver_delivered_at timestamptz,
  add constraint bookings_handoff_fields check (
    (handoff_location is null and handoff_date is null and onward_vehicle_id is null and onward_driver_id is null)
    or (handoff_location is not null and length(trim(handoff_location)) between 1 and 200
      and handoff_date is not null and departure_date is not null and arrival_date is not null
      and handoff_date between departure_date and arrival_date
      and onward_vehicle_id is not null and onward_vehicle_id <> vehicle_id
      and onward_driver_id is not null and onward_driver_id <> driver_id)
  ),
  add constraint bookings_handoff_confirmation check (
    (handoff_confirmed_at is null and handoff_confirmed_by is null)
    or (handoff_date is not null and handoff_confirmed_at is not null and handoff_confirmed_by is not null)
  );

create index bookings_onward_driver_idx on public.bookings(onward_driver_id) where onward_driver_id is not null;
create index bookings_onward_vehicle_idx on public.bookings(onward_vehicle_id) where onward_vehicle_id is not null;

grant select (handoff_location,handoff_date,onward_vehicle_id,onward_driver_id,handoff_confirmed_at,
  onward_driver_accepted_at,onward_driver_delivered_at) on public.bookings to authenticated;

-- Each reservation uses its own resource pair and date range. Legacy bookings
-- continue to appear as a single leg.
create view pedram_private.booking_legs as
select b.id,b.branch_id,b.booking_number,b.booking_date,b.archived_at,b.deleted_at,b.weight_tons,b.volume_m3,
       leg.number as leg,leg.vehicle_id,leg.driver_id,leg.origin,leg.destination,
       leg.departure_date,leg.arrival_date,leg.status,
       leg.accepted_at,leg.delivered_at
from public.bookings b
cross join lateral (
  values
    (1,b.vehicle_id,b.driver_id,b.origin,coalesce(b.handoff_location,b.destination),
     least(coalesce(b.departure_date,b.booking_date),(b.journey_started_at at time zone 'Asia/Kabul')::date),
     coalesce(b.handoff_date,b.arrival_date,b.departure_date,b.booking_date),
     case when b.handoff_confirmed_at is not null then 'completed' else b.status end,
     b.driver_accepted_at,b.driver_delivered_at),
    (2,b.onward_vehicle_id,b.onward_driver_id,b.handoff_location,b.destination,
     case when b.handoff_confirmed_at is null then b.handoff_date
       else least(b.handoff_date,(b.handoff_confirmed_at at time zone 'Asia/Kabul')::date) end,
     coalesce(b.arrival_date,b.handoff_date),
     case when b.status='in_transit' and b.handoff_confirmed_at is null then 'confirmed' else b.status end,
     b.onward_driver_accepted_at,b.onward_driver_delivered_at)
) as leg(number,vehicle_id,driver_id,origin,destination,departure_date,arrival_date,status,accepted_at,delivered_at)
where b.archived_at is null and b.deleted_at is null and (leg.number=1 or b.handoff_date is not null);

revoke all on pedram_private.booking_legs from public,anon,authenticated;

create function pedram_private.check_booking_leg(p_booking uuid,p_branch uuid,p_vehicle uuid,p_driver uuid,
  p_start date,p_end date,p_weight numeric,p_volume numeric)
returns void language plpgsql set search_path='' as $$
declare vehicle public.vehicles; driver public.drivers;
begin
  select * into vehicle from public.vehicles where id=p_vehicle;
  select * into driver from public.drivers where id=p_driver;
  if vehicle.id is null or driver.id is null or vehicle.archived_at is not null or driver.archived_at is not null
    or (vehicle.branch_id is not null and vehicle.branch_id is distinct from p_branch)
    or (driver.branch_id is not null and driver.branch_id is distinct from p_branch)
    or vehicle.status<>'available' or driver.status<>'available'
    or (vehicle.owner_id is not null and not exists(
      select 1 from public.vehicle_owners o where o.id=vehicle.owner_id and o.archived_at is null
        and (o.branch_id is null or o.branch_id is not distinct from p_branch)
    ))
  then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if vehicle.permit_expiry<p_end or driver.license_expiry<p_end then raise exception 'DOCUMENT_EXPIRED'; end if;
  if p_weight is not null and vehicle.capacity_tons is null then raise exception 'CAPACITY_REQUIRED'; end if;
  if p_volume is not null and vehicle.volume_capacity_m3 is null then raise exception 'VOLUME_CAPACITY_REQUIRED'; end if;
  if p_weight>vehicle.capacity_tons or p_volume>vehicle.volume_capacity_m3 then raise exception 'CAPACITY_EXCEEDED'; end if;
  if exists (
    select 1 from pedram_private.booking_legs l
    where l.id<>p_booking and (l.vehicle_id=p_vehicle or l.driver_id=p_driver)
      and l.status in ('confirmed','in_transit') and l.departure_date<=p_end
      and (l.status='in_transit' or l.arrival_date>=p_start)
  ) then raise exception 'RESOURCE_CONFLICT'; end if;
end;
$$;

revoke all on function pedram_private.check_booking_leg(uuid,uuid,uuid,uuid,date,date,numeric,numeric) from public,anon,authenticated;


create or replace function public.save_booking_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; trader uuid; old public.bookings; prior uuid;
 first_vehicle uuid; first_driver uuid; second_vehicle uuid; second_driver uuid; transfer_day date; transfer_place text;
 result uuid:=coalesce(p_id,gen_random_uuid()); day date; starts date; ends date; weight numeric; volume numeric;
 payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor_role public.app_role; amount_due numeric; received_now numeric; extra_total numeric; charge_id uuid;
begin
 select p.role into actor_role from public.profiles p where id=auth.uid() and account_enabled;
 if actor_role is null or actor_role not in ('president','branch_manager') then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'booking',payload); if prior is not null then return prior; end if;
 bid:=nullif(p_data->>'branch_id','')::uuid;
 if actor_role='branch_manager' then select branch_id into bid from public.profiles where id=auth.uid(); end if;
 if not public.operations_access(bid) or (bid is not null and not exists(select 1 from public.branches where id=bid and archived_at is null)) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is not null then
  select * into old from public.bookings where id=p_id for update;
  if not found or not public.operations_access(old.branch_id) or bid is distinct from old.branch_id then raise exception 'ACCESS_DENIED'; end if;
  if p_expected is null or old.updated_at<>p_expected then raise exception 'STALE_RECORD'; end if;
  if old.commission_amount is not null and (nullif(p_data->>'commission_amount','')::numeric is distinct from old.commission_amount or p_data->>'commission_currency' is distinct from old.commission_currency) then raise exception 'RECORD_LOCKED'; end if;
  if old.status<>'confirmed' or old.archived_at is not null or old.deleted_at is not null then raise exception 'RECORD_LOCKED'; end if;
 end if;
 if p_data->>'service_type'='managed' and exists(select 1 from unnest(array['sender_name','sender_phone','sender_address','receiver_name','receiver_phone','receiver_address']) key where coalesce(trim(p_data->>key),'')='') then raise exception 'REQUIRED_FIELDS'; end if;
 if exists(select 1 from unnest(array['trader_first_name','trader_phone','trader_address','origin','destination','goods']) key where coalesce(trim(p_data->>key),'')='') or p_data->>'service_type' not in ('arrangement','managed') or p_data->>'service_type' is null then raise exception 'REQUIRED_FIELDS'; end if;
 if nullif(p_data->>'commission_amount','')::numeric is null or nullif(p_data->>'commission_amount','')::numeric<=0 or nullif(p_data->>'commission_amount','')::numeric<>round(nullif(p_data->>'commission_amount','')::numeric,2) or p_data->>'commission_currency' not in ('AFN','USD','PKR','IRR') then raise exception 'INVALID_AMOUNT'; end if;
 if jsonb_typeof(coalesce(p_data->'other_expenses','[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_data->'other_expenses','[]'::jsonb)) x where nullif(trim(x->>'description'),'') is null or nullif(x->>'amount','')::numeric is null or nullif(x->>'amount','')::numeric<=0 or nullif(x->>'amount','')::numeric<>round(nullif(x->>'amount','')::numeric,2)) then raise exception 'INVALID_AMOUNT'; end if;
 if p_data->>'service_type'='managed' and (nullif(p_data->>'freight_amount','')::numeric is null or nullif(p_data->>'carrier_cost','')::numeric is null or nullif(p_data->>'freight_amount','')::numeric<0 or nullif(p_data->>'carrier_cost','')::numeric<0) then raise exception 'REQUIRED_FIELDS'; end if;
 day:=nullif(p_data->>'booking_date','')::date;
 starts:=coalesce(nullif(p_data->>'departure_date','')::date,old.departure_date,day);
 ends:=coalesce(nullif(p_data->>'arrival_date','')::date,old.arrival_date,starts);
 if day is null or starts is null or ends is null or not (isfinite(day) and isfinite(starts) and isfinite(ends))
    or starts<day or ends<starts then raise exception 'INVALID_DATES'; end if;
 first_vehicle:=nullif(p_data->>'vehicle_id','')::uuid;
 first_driver:=nullif(p_data->>'driver_id','')::uuid;
 if p_data ?| array['handoff_location','handoff_date','onward_vehicle_id','onward_driver_id'] then
   transfer_day:=nullif(p_data->>'handoff_date','')::date;
   transfer_place:=nullif(trim(p_data->>'handoff_location'),'');
   second_vehicle:=nullif(p_data->>'onward_vehicle_id','')::uuid;
   second_driver:=nullif(p_data->>'onward_driver_id','')::uuid;
 else
   transfer_day:=old.handoff_date; transfer_place:=old.handoff_location;
   second_vehicle:=old.onward_vehicle_id; second_driver:=old.onward_driver_id;
 end if;
 if num_nonnulls(transfer_day,transfer_place,second_vehicle,second_driver)>0 and (
   num_nonnulls(transfer_day,transfer_place,second_vehicle,second_driver)<>4
   or not isfinite(transfer_day) or transfer_day not between starts and ends
   or length(transfer_place)>200 or first_vehicle=second_vehicle or first_driver=second_driver
 ) then raise exception 'INVALID_HANDOFF'; end if;
 weight:=case when p_data->>'quantity_unit'='tons' then nullif(p_data->>'quantity_amount','')::numeric end; volume:=case when p_data->>'quantity_unit'='m3' then nullif(p_data->>'quantity_amount','')::numeric end;
 if p_data->>'quantity_unit' not in ('tons','pieces','m3') or nullif(p_data->>'quantity_amount','')::numeric is null or nullif(p_data->>'quantity_amount','')::numeric<=0 or nullif(p_data->>'quantity_amount','')::numeric<>round(nullif(p_data->>'quantity_amount','')::numeric,3) or (p_data->>'quantity_unit'='pieces' and nullif(p_data->>'quantity_amount','')::numeric<>trunc(nullif(p_data->>'quantity_amount','')::numeric)) then raise exception 'INVALID_MEASUREMENT'; end if;
 -- All booking writes lock fleet records in the same order before checking conflicts.
 perform 1 from public.vehicles where id in (first_vehicle,second_vehicle,old.vehicle_id,old.onward_vehicle_id) order by id for update;
 perform 1 from public.drivers where id in (first_driver,second_driver,old.driver_id,old.onward_driver_id) order by id for update;
 perform pedram_private.check_booking_leg(result,bid,first_vehicle,first_driver,starts,coalesce(transfer_day,ends),weight,volume);
 if transfer_day is not null then
   perform pedram_private.check_booking_leg(result,bid,second_vehicle,second_driver,transfer_day,ends,weight,volume);
 end if;
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
 if p_id is not null and old.trader_id is distinct from trader then raise exception 'RECORD_LOCKED'; end if;
 insert into public.bookings(id,trader_id,vehicle_id,driver_id,branch_id,booking_date,departure_date,arrival_date,service_type,trader_first_name,trader_last_name,trader_phone,trader_address,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,goods,weight_tons,volume_m3,quantity,quantity_unit,quantity_amount,receiver_is_trader,origin,destination,commission_amount,commission_currency,freight_amount,carrier_cost,other_expenses,handoff_location,handoff_date,onward_vehicle_id,onward_driver_id,created_by)
 values(result,trader,first_vehicle,first_driver,bid,day,starts,ends,p_data->>'service_type',trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),coalesce((p_data->>'sender_is_trader')::boolean,false),case when (p_data->>'sender_is_trader')::boolean then trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))) else trim(p_data->>'sender_name') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_phone') else trim(p_data->>'sender_phone') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_address') else trim(p_data->>'sender_address') end,trim(p_data->>'receiver_name'),trim(p_data->>'receiver_phone'),trim(p_data->>'receiver_address'),trim(p_data->>'goods'),weight,volume,concat(p_data->>'quantity_amount',' ',p_data->>'quantity_unit'),p_data->>'quantity_unit',nullif(p_data->>'quantity_amount','')::numeric,coalesce((p_data->>'receiver_is_trader')::boolean,false),trim(p_data->>'origin'),trim(p_data->>'destination'),nullif(p_data->>'commission_amount','')::numeric,p_data->>'commission_currency',nullif(p_data->>'freight_amount','')::numeric,nullif(p_data->>'carrier_cost','')::numeric,coalesce(p_data->'other_expenses','[]'::jsonb),transfer_place,transfer_day,second_vehicle,second_driver,auth.uid())
 on conflict(id) do update set trader_id=excluded.trader_id,vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,booking_date=excluded.booking_date,departure_date=excluded.departure_date,arrival_date=excluded.arrival_date,service_type=excluded.service_type,trader_first_name=excluded.trader_first_name,trader_last_name=excluded.trader_last_name,trader_phone=excluded.trader_phone,trader_address=excluded.trader_address,sender_is_trader=excluded.sender_is_trader,sender_name=excluded.sender_name,sender_phone=excluded.sender_phone,sender_address=excluded.sender_address,receiver_name=excluded.receiver_name,receiver_phone=excluded.receiver_phone,receiver_address=excluded.receiver_address,goods=excluded.goods,weight_tons=excluded.weight_tons,volume_m3=excluded.volume_m3,quantity=excluded.quantity,quantity_unit=excluded.quantity_unit,quantity_amount=excluded.quantity_amount,receiver_is_trader=excluded.receiver_is_trader,origin=excluded.origin,destination=excluded.destination,commission_amount=excluded.commission_amount,commission_currency=excluded.commission_currency,freight_amount=excluded.freight_amount,carrier_cost=excluded.carrier_cost,other_expenses=excluded.other_expenses,
  handoff_location=excluded.handoff_location,handoff_date=excluded.handoff_date,
  onward_vehicle_id=excluded.onward_vehicle_id,onward_driver_id=excluded.onward_driver_id;
 select coalesce(sum((expense->>'amount')::numeric),0) into extra_total
 from jsonb_array_elements(coalesce(p_data->'other_expenses','[]'::jsonb)) expense;
 amount_due:=nullif(p_data->>'commission_amount','')::numeric;
 if p_data->>'service_type'='managed' then
  amount_due:=amount_due+nullif(p_data->>'freight_amount','')::numeric+nullif(p_data->>'carrier_cost','')::numeric+extra_total;
 end if;
 if amount_due>999999999999.99 or amount_due::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_AMOUNT'; end if;
 received_now:=coalesce(nullif(p_data->>'received_now','')::numeric,0);
 if received_now<0 or received_now<>round(received_now,2) or received_now>amount_due or received_now::text in ('NaN','Infinity','-Infinity') or (p_id is not null and received_now<>0) then raise exception 'INVALID_AMOUNT'; end if;
 select c.id into charge_id from public.trader_charges c where c.booking_id=result and c.voided_at is null for update;
 if charge_id is null then
  insert into public.trader_charges(trader_id,booking_id,branch_id,charge_date,description,currency,amount)
  values(trader,result,bid,day,'Booking #'||(select booking_number from public.bookings where id=result)||' total due',p_data->>'commission_currency',amount_due);
 else
  update public.trader_charges set amount=amount_due,description='Booking #'||(select booking_number from public.bookings where id=result)||' total due'
  where id=charge_id;
 end if;
 if received_now>0 then
  perform public.cashbook_simple_post(gen_random_uuid(),jsonb_build_object('branch_id',bid,'currency',p_data->>'commission_currency','direction','in','amount',received_now,'date',(now() at time zone 'Asia/Kabul')::date,'description','Booking #'||(select booking_number from public.bookings where id=result)||' payment received','trader_id',trader,'booking_id',result));
 end if;
 perform pedram_private.remember(p_request,'booking',payload,result); return result;
end; $$;

create or replace function pedram_private.reset_driver_booking_reports() returns trigger
language plpgsql set search_path='' as $$
declare state_columns text[] := array['updated_at','status','archived_at','deleted_at','journey_started_at',
  'driver_accepted_at','driver_delivered_at','onward_driver_accepted_at','onward_driver_delivered_at',
  'handoff_confirmed_at','handoff_confirmed_by'];
begin
  if (to_jsonb(new)-state_columns) is distinct from (to_jsonb(old)-state_columns) then
    new.driver_accepted_at:=null;
    new.driver_delivered_at:=null;
    new.onward_driver_accepted_at:=null;
    new.onward_driver_delivered_at:=null;
  end if;
  return new;
end; $$;

create or replace function public.change_booking_status(p_id uuid,p_status text,p_request uuid,p_expected timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings; prior uuid; leg pedram_private.booking_legs;
  today date := (now() at time zone 'Asia/Kabul')::date;
  payload jsonb := jsonb_build_object('id',p_id,'status',p_status);
begin
  select * into b from public.bookings where id=p_id for update;
  if not found or not public.operations_access(b.branch_id) then raise exception 'ACCESS_DENIED'; end if;
  prior:=pedram_private.request_result(p_request,'booking-status',payload);
  if prior is not null then return prior; end if;
  if b.updated_at is distinct from p_expected then raise exception 'STALE_RECORD'; end if;
  if b.archived_at is not null or b.deleted_at is not null then raise exception 'RECORD_LOCKED'; end if;

  if p_status is null or not (
    (b.status='confirmed' and p_status in ('in_transit','cancelled'))
    or (b.status='in_transit' and p_status in ('completed','cancelled'))
    or (b.status='in_transit' and p_status='handoff' and b.handoff_date is not null and b.handoff_confirmed_at is null)
  ) then raise exception 'INVALID_TRANSITION'; end if;
  if p_status='completed' and b.handoff_date is not null and b.handoff_confirmed_at is null then
    raise exception 'HANDOFF_REQUIRED';
  end if;

  if p_status in ('in_transit','handoff') then
    select * into leg from pedram_private.booking_legs where id=p_id and booking_legs.leg=
      case when p_status='handoff' then 2 else 1 end;
    perform 1 from public.vehicles where id=leg.vehicle_id for update;
    perform 1 from public.drivers where id=leg.driver_id for update;
    perform pedram_private.check_booking_leg(b.id,b.branch_id,leg.vehicle_id,leg.driver_id,
      today,greatest(today,leg.arrival_date),b.weight_tons,b.volume_m3);
  end if;

  if p_status='handoff' then
    update public.bookings set handoff_confirmed_at=now(),handoff_confirmed_by=auth.uid() where id=p_id;
  elsif p_status='in_transit' then
    update public.bookings set status=p_status,journey_started_at=now() where id=p_id;
  else
    update public.bookings set status=p_status where id=p_id;
  end if;
  perform pedram_private.remember(p_request,'booking-status',payload,p_id);
  return p_id;
end; $$;

create or replace function public.get_driver_portal() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.drivers; jobs jsonb;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='driver' and p.account_enabled) then
    raise exception 'ACCESS_DENIED';
  end if;
  select * into d from public.drivers where user_id=auth.uid() and public.driver_booking_access(id);
  if not found then return jsonb_build_object('driver',null,'bookings','[]'::jsonb); end if;

  with assigned as (
    select l.* from pedram_private.booking_legs l where l.driver_id=d.id and l.status in ('confirmed','in_transit')
    union all
    (select l.* from pedram_private.booking_legs l where l.driver_id=d.id and l.status in ('completed','cancelled')
     order by l.departure_date desc,l.id limit 20)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',l.id,'leg',l.leg,'has_handoff',b.handoff_date is not null,'booking_number',l.booking_number,
      'status',l.status,'updated_at',b.updated_at,'departure_date',l.departure_date,'arrival_date',l.arrival_date,
      'origin',l.origin,'destination',l.destination,'goods',b.goods,'quantity',b.quantity,
      'weight_tons',b.weight_tons,'volume_m3',b.volume_m3,
      'sender_name',case when l.leg=1 then b.sender_name end,
      'sender_phone',case when l.leg=1 then b.sender_phone end,
      'sender_address',case when l.leg=1 then b.sender_address else b.handoff_location end,
      'receiver_name',case when l.leg=2 or b.handoff_date is null then b.receiver_name end,
      'receiver_phone',case when l.leg=2 or b.handoff_date is null then b.receiver_phone end,
      'receiver_address',case when l.leg=2 or b.handoff_date is null then b.receiver_address else b.handoff_location end,
      'driver_accepted_at',l.accepted_at,'driver_delivered_at',l.delivered_at,
      'awaiting_handoff',l.leg=2 and l.status='confirmed',
      'vehicle',case when v.id is not null then jsonb_build_object('plate_number',v.plate_number,
        'foreign_plate_number',v.foreign_plate_number,'vehicle_type',v.vehicle_type,'color',v.color) end,
      'branch',jsonb_build_object('name',coalesce(br.name,'Head office'),
        'phone',coalesce(nullif(br.phone,''),nullif(manager.phone,'')))
    ) order by case l.status when 'in_transit' then 0 when 'confirmed' then 1 else 2 end,l.departure_date,l.id
  ),'[]'::jsonb) into jobs
  from assigned l join public.bookings b on b.id=l.id
  left join public.vehicles v on v.id=l.vehicle_id
  left join public.branches br on br.id=l.branch_id
  left join public.profiles manager on manager.id=br.manager_user_id;

  return jsonb_build_object('driver',jsonb_build_object('full_name',d.full_name,'phone',d.phone,
    'license_number',d.license_number,'license_expiry',d.license_expiry),'bookings',jobs);
end; $$;

create function public.driver_booking_action(p_id uuid,p_action text,p_expected timestamptz,p_leg integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings; assignment pedram_private.booking_legs;
begin
  select * into b from public.bookings where id=p_id for update;
  select * into assignment from pedram_private.booking_legs where id=p_id and leg=p_leg;
  if not found or not public.driver_booking_access(assignment.driver_id) then raise exception 'ACCESS_DENIED'; end if;
  if p_action='accept' and assignment.status='confirmed' then
    if assignment.accepted_at is not null then return p_id; end if;
  elsif p_action='delivered' and assignment.status='in_transit' then
    if assignment.delivered_at is not null then return p_id; end if;
  else
    raise exception 'INVALID_TRANSITION';
  end if;
  if b.updated_at is distinct from p_expected then raise exception 'STALE_RECORD'; end if;
  update public.bookings set
    driver_accepted_at=case when p_leg=1 and p_action='accept' then now() else driver_accepted_at end,
    driver_delivered_at=case when p_leg=1 and p_action='delivered' then now() else driver_delivered_at end,
    onward_driver_accepted_at=case when p_leg=2 and p_action='accept' then now() else onward_driver_accepted_at end,
    onward_driver_delivered_at=case when p_leg=2 and p_action='delivered' then now() else onward_driver_delivered_at end
    where id=p_id;
  return p_id;
end; $$;

create or replace function public.driver_booking_action(p_id uuid,p_action text,p_expected timestamptz)
returns uuid language sql security definer set search_path='' as $$
  select public.driver_booking_action(p_id,p_action,p_expected,1);
$$;
revoke all on function public.driver_booking_action(uuid,text,timestamptz,integer) from public,anon;
grant execute on function public.driver_booking_action(uuid,text,timestamptz,integer) to authenticated;

create or replace function public.fleet_schedule(p_start date,p_days integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare last_day date;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and account_enabled and role in ('president','branch_manager'))
  then raise exception 'ACCESS_DENIED'; end if;
  if p_start is null or not isfinite(p_start) or p_days is null or p_days not between 1 and 31
  then raise exception 'INVALID_DATES'; end if;
  last_day:=p_start+p_days-1;
  return (
    with resources as (
      select id,'vehicle' as kind,plate_number as name,status::text as status,permit_expiry as expires
      from public.vehicles where archived_at is null and public.registry_read_access(branch_id)
      union all
      select id,'driver',full_name,status::text,license_expiry
      from public.drivers where archived_at is null and public.registry_read_access(branch_id)
    ), jobs as (
      select r.id as resource_id,r.kind,l.status,l.departure_date as starts,l.arrival_date as ends,
        case when public.operations_access(l.branch_id) then l.booking_number end as number,
        case when public.operations_access(l.branch_id) then l.origin end as origin,
        case when public.operations_access(l.branch_id) then l.destination end as destination
      from resources r join pedram_private.booking_legs l
        on r.id=case when r.kind='vehicle' then l.vehicle_id else l.driver_id end
      where l.status in ('confirmed','in_transit') and l.departure_date<=last_day
        and (l.status='in_transit' or l.arrival_date>=p_start)
    )
    select jsonb_build_object(
      'resources',coalesce((select jsonb_agg(to_jsonb(resources) order by name) from resources),'[]'::jsonb),
      'jobs',coalesce((select jsonb_agg(to_jsonb(jobs) order by starts) from jobs),'[]'::jsonb)
    )
  );
end; $$;

-- Keep existing Fleet edit and scope restrictions in step with reservations.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)'::regprocedure);
  definition:=replace(definition,'from public.bookings where status in','from pedram_private.booking_legs where status in');
  definition:=replace(definition,'from public.bookings where vehicle_id=record_id','from pedram_private.booking_legs where vehicle_id=record_id');
  definition:=replace(definition,'from public.bookings where driver_id=record_id','from pedram_private.booking_legs where driver_id=record_id');
  execute definition;

  definition:=pg_get_functiondef('public.set_fleet_branch_scope(text,uuid,uuid,timestamptz)'::regprocedure);
  definition:=replace(definition,'from public.bookings b where b.vehicle_id=p_id','from pedram_private.booking_legs b where b.vehicle_id=p_id');
  definition:=replace(definition,'from public.bookings b where b.driver_id=p_id','from pedram_private.booking_legs b where b.driver_id=p_id');
  execute definition;
end; $$;

commit;
