begin;
-- Keep previously recorded commission cash receipts. Their collection cannot be
-- inferred from booking data, so historical cashbook entries are not reversed.
-- Convert the generated commission charge into the full booking receivable.
update public.trader_charges c
set booking_id=b.id,
    amount=b.commission_amount+case when b.service_type='managed' then coalesce(b.freight_amount,0)+coalesce(b.carrier_cost,0)+coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(b.other_expenses) x),0) else 0 end,
    description='Booking #'||b.booking_number||' total due'
from public.bookings b
where c.booking_id is null and c.trader_id=b.trader_id and c.branch_id is not distinct from b.branch_id
  and c.description='Booking #'||b.booking_number||' commission' and c.currency=b.commission_currency and c.amount=b.commission_amount and c.voided_at is null
  and not exists(select 1 from public.trader_charges linked where linked.booking_id=b.id);
insert into public.trader_charges(trader_id,booking_id,branch_id,charge_date,description,currency,amount,created_by)
select b.trader_id,b.id,b.branch_id,b.booking_date,'Booking #'||b.booking_number||' total due',b.commission_currency,
 b.commission_amount+case when b.service_type='managed' then coalesce(b.freight_amount,0)+coalesce(b.carrier_cost,0)+coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(b.other_expenses) x),0) else 0 end,b.created_by
from public.bookings b
where b.commission_amount is not null and b.trader_id is not null
  and not exists(select 1 from public.trader_charges c where c.booking_id=b.id)
  and not exists(select 1 from public.trader_charges c where c.trader_id=b.trader_id and c.description='Booking #'||b.booking_number||' commission' and c.currency=b.commission_currency);

create or replace function public.save_booking_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; trader uuid; vehicle public.vehicles; driver public.drivers; old public.bookings; prior uuid;
 result uuid:=coalesce(p_id,gen_random_uuid()); day date; starts date; ends date; weight numeric; volume numeric;
 payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor_role public.app_role; amount_due numeric; received_now numeric; extra_total numeric; charge_id uuid;
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
  if old.commission_amount is not null and (nullif(p_data->>'commission_amount','')::numeric is distinct from old.commission_amount or p_data->>'commission_currency' is distinct from old.commission_currency) then raise exception 'RECORD_LOCKED'; end if;
  if old.status<>'confirmed' or old.archived_at is not null then raise exception 'RECORD_LOCKED'; end if;
 end if;
 if p_data->>'service_type'='managed' and exists(select 1 from unnest(array['sender_name','sender_phone','sender_address','receiver_name','receiver_phone','receiver_address']) key where coalesce(trim(p_data->>key),'')='') then raise exception 'REQUIRED_FIELDS'; end if;
 if exists(select 1 from unnest(array['trader_first_name','trader_phone','trader_address','origin','destination','goods']) key where coalesce(trim(p_data->>key),'')='') or p_data->>'service_type' not in ('arrangement','managed') or p_data->>'service_type' is null then raise exception 'REQUIRED_FIELDS'; end if;
 if nullif(p_data->>'commission_amount','')::numeric is null or nullif(p_data->>'commission_amount','')::numeric<=0 or nullif(p_data->>'commission_amount','')::numeric<>round(nullif(p_data->>'commission_amount','')::numeric,2) or p_data->>'commission_currency' not in ('AFN','USD','PKR','IRR') then raise exception 'INVALID_AMOUNT'; end if;
 if jsonb_typeof(coalesce(p_data->'other_expenses','[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_data->'other_expenses','[]'::jsonb)) x where nullif(trim(x->>'description'),'') is null or nullif(x->>'amount','')::numeric is null or nullif(x->>'amount','')::numeric<=0 or nullif(x->>'amount','')::numeric<>round(nullif(x->>'amount','')::numeric,2)) then raise exception 'INVALID_AMOUNT'; end if;
 if p_data->>'service_type'='managed' and (nullif(p_data->>'freight_amount','')::numeric is null or nullif(p_data->>'carrier_cost','')::numeric is null or nullif(p_data->>'freight_amount','')::numeric<0 or nullif(p_data->>'carrier_cost','')::numeric<0) then raise exception 'REQUIRED_FIELDS'; end if;
 day:=nullif(p_data->>'booking_date','')::date; starts:=day; ends:=day;
 if day is null or starts is null or ends is null or starts<day or ends<starts then raise exception 'INVALID_DATES'; end if;
 weight:=case when p_data->>'quantity_unit'='tons' then nullif(p_data->>'quantity_amount','')::numeric end; volume:=case when p_data->>'quantity_unit'='m3' then nullif(p_data->>'quantity_amount','')::numeric end;
 if p_data->>'quantity_unit' not in ('tons','pieces','m3') or nullif(p_data->>'quantity_amount','')::numeric is null or nullif(p_data->>'quantity_amount','')::numeric<=0 or nullif(p_data->>'quantity_amount','')::numeric<>round(nullif(p_data->>'quantity_amount','')::numeric,3) or (p_data->>'quantity_unit'='pieces' and nullif(p_data->>'quantity_amount','')::numeric<>trunc(nullif(p_data->>'quantity_amount','')::numeric)) then raise exception 'INVALID_MEASUREMENT'; end if;
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
 if p_id is not null and old.trader_id is distinct from trader then raise exception 'RECORD_LOCKED'; end if;
 insert into public.bookings(id,trader_id,vehicle_id,driver_id,branch_id,booking_date,departure_date,arrival_date,service_type,trader_first_name,trader_last_name,trader_phone,trader_address,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,goods,weight_tons,volume_m3,quantity,quantity_unit,quantity_amount,receiver_is_trader,origin,destination,commission_amount,commission_currency,freight_amount,carrier_cost,other_expenses,created_by)
 values(result,trader,vehicle.id,driver.id,bid,day,starts,ends,p_data->>'service_type',trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),coalesce((p_data->>'sender_is_trader')::boolean,false),case when (p_data->>'sender_is_trader')::boolean then trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))) else trim(p_data->>'sender_name') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_phone') else trim(p_data->>'sender_phone') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_address') else trim(p_data->>'sender_address') end,trim(p_data->>'receiver_name'),trim(p_data->>'receiver_phone'),trim(p_data->>'receiver_address'),trim(p_data->>'goods'),weight,volume,concat(p_data->>'quantity_amount',' ',p_data->>'quantity_unit'),p_data->>'quantity_unit',nullif(p_data->>'quantity_amount','')::numeric,coalesce((p_data->>'receiver_is_trader')::boolean,false),trim(p_data->>'origin'),trim(p_data->>'destination'),nullif(p_data->>'commission_amount','')::numeric,p_data->>'commission_currency',nullif(p_data->>'freight_amount','')::numeric,nullif(p_data->>'carrier_cost','')::numeric,coalesce(p_data->'other_expenses','[]'::jsonb),auth.uid())
 on conflict(id) do update set trader_id=excluded.trader_id,vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,booking_date=excluded.booking_date,departure_date=excluded.departure_date,arrival_date=excluded.arrival_date,service_type=excluded.service_type,trader_first_name=excluded.trader_first_name,trader_last_name=excluded.trader_last_name,trader_phone=excluded.trader_phone,trader_address=excluded.trader_address,sender_is_trader=excluded.sender_is_trader,sender_name=excluded.sender_name,sender_phone=excluded.sender_phone,sender_address=excluded.sender_address,receiver_name=excluded.receiver_name,receiver_phone=excluded.receiver_phone,receiver_address=excluded.receiver_address,goods=excluded.goods,weight_tons=excluded.weight_tons,volume_m3=excluded.volume_m3,quantity=excluded.quantity,quantity_unit=excluded.quantity_unit,quantity_amount=excluded.quantity_amount,receiver_is_trader=excluded.receiver_is_trader,origin=excluded.origin,destination=excluded.destination,commission_amount=excluded.commission_amount,commission_currency=excluded.commission_currency,freight_amount=excluded.freight_amount,carrier_cost=excluded.carrier_cost,other_expenses=excluded.other_expenses;
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

create or replace function public.void_trader_charge(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.trader_charges;
begin
 select * into c from public.trader_charges where id=p_id for update;
 if not found or not public.cashbook_access(c.branch_id) then raise exception 'ACCESS_DENIED';end if;
 if c.booking_id is not null and exists(select 1 from public.bookings b where b.id=c.booking_id and b.commission_amount is not null) then raise exception 'RECORD_LOCKED';end if;
 update public.trader_charges set voided_at=coalesce(voided_at,now()) where id=p_id;
end; $$;

create or replace function public.booking_finance_rows() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'commission_amount',b.commission_amount,'commission_currency',b.commission_currency,
  'freight_amount',b.freight_amount,'carrier_cost',b.carrier_cost,'other_expenses',b.other_expenses,
  'charged',coalesce((select sum(c.amount) from public.trader_charges c where c.booking_id=b.id and c.voided_at is null),0),
  'paid',coalesce((select sum(case when e.direction='in' then e.amount else -e.amount end) from public.cashbook_entries e where e.booking_id=b.id and e.trader_id=b.trader_id),0))), '[]'::jsonb)
 from public.bookings b where public.operations_access(b.branch_id);
$$;

create or replace function public.trader_account_statement(p_trader uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join public.traders t on t.id=p_trader where p.id=auth.uid() and p.account_enabled and p.role in ('president','branch_manager') and public.registry_read_access(t.branch_id)) then raise exception 'ACCESS_DENIED';end if;
 return jsonb_build_object(
 'charges',coalesce((select jsonb_agg(to_jsonb(c) order by c.charge_date,c.created_at) from public.trader_charges c where c.trader_id=p_trader and public.cashbook_access(c.branch_id)),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,'currency',a.currency,'description',e.description,'booking_id',e.booking_id,'booking_number',bk.booking_number,'branch',coalesce(b.name,'Admin')) order by e.entry_date,o.receipt_number) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id left join public.branches b on b.id=a.branch_id left join public.bookings bk on bk.id=e.booking_id where e.trader_id=p_trader and not e.is_transfer and public.cashbook_access(a.branch_id)),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'date',b.booking_date,'branch_id',b.branch_id,'origin',b.origin,'destination',b.destination)) from public.bookings b where b.trader_id=p_trader and public.operations_access(b.branch_id)),'[]'::jsonb));
end; $$;

create or replace function public.trader_portal_statement() returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.traders;
begin
 select * into t from public.traders where user_id=auth.uid() and archived_at is null;
 if not found or not exists(select 1 from public.profiles where id=auth.uid() and role='trader' and account_enabled) then raise exception 'ACCESS_DENIED'; end if;
 return jsonb_build_object(
  'trader',jsonb_build_object('name',t.full_name,'phone',t.phone,'address',t.address),
  'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'booking_id',c.booking_id,'date',c.charge_date,'description',c.description,'currency',c.currency,'amount',c.amount,'voided_at',c.voided_at) order by c.charge_date,c.created_at) from public.trader_charges c where c.trader_id=t.id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'booking_id',e.booking_id,'date',e.entry_date,'description',e.description,'currency',a.currency,'amount',e.amount,'direction',e.direction) order by e.entry_date,o.receipt_number) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id where e.trader_id=t.id and not e.is_transfer),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'date',b.booking_date,'origin',b.origin,'destination',b.destination,'goods',b.goods,'quantity',b.quantity,'status',b.status,'currency',b.commission_currency,'commission',b.commission_amount,'freight',b.freight_amount,'vehicle_cost',b.carrier_cost,'other_expenses',b.other_expenses) order by b.booking_date,b.booking_number) from public.bookings b where b.trader_id=t.id and b.deleted_at is null),'[]'::jsonb)
 );
end; $$;
commit;
