begin;

lock table public.bookings, public.cashbook_entries, public.trader_charges in share row exclusive mode;

create table if not exists pedram_private.driver_booking_commissions (
 booking_id uuid primary key references public.bookings(id),
 legacy_charge_id uuid unique references public.trader_charges(id),
 legacy_amount numeric(14,2),
 check ((legacy_charge_id is null and legacy_amount is null) or
        (legacy_charge_id is not null and legacy_amount is not null and legacy_amount > 0))
);
revoke all on pedram_private.driver_booking_commissions from public,anon,authenticated;

-- Match only the automatically generated commission invoice. Keep its ID,
-- original amount and every existing cash receipt, including reversals.
insert into pedram_private.driver_booking_commissions(booking_id,legacy_charge_id,legacy_amount)
select b.id,c.id,c.amount
from public.bookings b join public.trader_charges c
 on c.booking_id=b.id and c.trader_id=b.trader_id and c.currency=b.commission_currency
where b.service_type='arrangement' and b.driver_id is not null and c.voided_at is null
 and c.amount=b.commission_amount
 and c.description in ('Booking #'||b.booking_number||' total due','Booking #'||b.booking_number||' commission')
on conflict (booking_id) do nothing;

create index if not exists cashbook_booking_commission_idx on public.cashbook_entries(booking_id)
 where booking_id is not null;

create or replace view pedram_private.driver_commission_balances as
select b.id as booking_id,b.driver_id,b.booking_number,b.booking_date,b.branch_id,b.commission_currency as currency,
 coalesce(c.legacy_amount,b.commission_amount) as total,
 least(coalesce(c.legacy_amount,0),greatest(payments.trader_paid,0)) as trader_paid,
 payments.driver_paid as paid
from pedram_private.driver_booking_commissions c
join public.bookings b on b.id=c.booking_id
cross join lateral (
 select
  coalesce(sum(case e.direction when 'in' then e.amount else -e.amount end)
   filter (where e.trader_id=b.trader_id and e.driver_id is null),0) as trader_paid,
  coalesce(sum(case e.direction when 'in' then e.amount else -e.amount end)
   filter (where e.driver_id=b.driver_id and e.trader_id is null),0) as driver_paid
 from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
 where e.booking_id=b.id and a.currency=b.commission_currency and not e.is_transfer
) payments;
revoke all on pedram_private.driver_commission_balances from public,anon,authenticated;

-- The trader keeps only the portion their linked receipts actually covered.
-- A fully transferred trader charge stays in the history as voided.
update public.trader_charges c
set amount=case when f.trader_paid>0 then f.trader_paid else m.legacy_amount end,
    voided_at=case when f.trader_paid=0 then coalesce(c.voided_at,now()) end
from pedram_private.driver_booking_commissions m
join pedram_private.driver_commission_balances f on f.booking_id=m.booking_id
where c.id=m.legacy_charge_id;

create or replace function public.receive_driver_booking_commission(
 p_request uuid,p_booking uuid,p_driver uuid,p_amount numeric,p_date date,p_description text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 b public.bookings; balance pedram_private.driver_commission_balances;
 prior uuid; label text;
 input jsonb:=jsonb_build_object('booking',p_booking,'driver',p_driver,'amount',p_amount,'date',p_date,'description',p_description);
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'driver-commission-payment',input);
 if prior is not null then return prior; end if;

 select * into b from public.bookings where id=p_booking for update;
 if not found or p_driver is null or p_driver is distinct from b.driver_id then
  raise exception 'BOOKING_PAYMENT_UNAVAILABLE';
 end if;
 select * into balance from pedram_private.driver_commission_balances where booking_id=p_booking;
 if not found then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
    or p_amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
 if p_amount>balance.total-balance.trader_paid-balance.paid then raise exception 'DRIVER_COMMISSION_EXCEEDS_BALANCE'; end if;
 label:='Booking #'||b.booking_number||' driver commission';
 if nullif(btrim(p_description),'') is not null then label:=label||' · '||btrim(p_description); end if;

 -- The shared posting function allocates the receipt and validates the cash
 -- account and date. Attach the booking and driver inside the same transaction.
 perform pedram_private.cashbook_simple_post(p_request,jsonb_build_object(
  'branch_id',b.branch_id,'currency',b.commission_currency,'direction','in','amount',p_amount,
  'date',p_date,'description',label,'driver_commission_booking_id',b.id,'commission_driver_id',p_driver
 ));
 update public.cashbook_entries set booking_id=b.id,driver_id=p_driver where operation_id=p_request;
 perform pedram_private.remember(p_request,'driver-commission-payment',input,p_request);
 return p_request;
end; $$;

-- A correction to a driver's receipt must fit the remaining commission.
-- A correction or reversal of a historical trader receipt recalculates the
-- historical allocation so a reverse never reopens debt on the trader.
create or replace function pedram_private.sync_driver_commission_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 balance pedram_private.driver_commission_balances; legacy_charge uuid;
 original_amount numeric; previous_trader_paid numeric;
begin
 perform 1 from public.bookings b join pedram_private.driver_booking_commissions m on m.booking_id=b.id
 where b.id=new.booking_id for update of b;
 if not found then return new; end if;
 select * into balance from pedram_private.driver_commission_balances where booking_id=new.booking_id;

 if new.driver_id=balance.driver_id and new.trader_id is null and tg_op='UPDATE' then
  if balance.paid>balance.total-balance.trader_paid then raise exception 'DRIVER_COMMISSION_EXCEEDS_BALANCE'; end if;
 elsif new.trader_id is not null and new.driver_id is null then
  select m.legacy_charge_id,m.legacy_amount,case when c.voided_at is null then c.amount else 0 end
  into legacy_charge,original_amount,previous_trader_paid
  from pedram_private.driver_booking_commissions m join public.trader_charges c on c.id=m.legacy_charge_id
  where m.booking_id=new.booking_id;
  if not found then return new; end if;
  if balance.trader_paid>previous_trader_paid and balance.paid>balance.total-balance.trader_paid then
   raise exception 'DRIVER_COMMISSION_EXCEEDS_BALANCE';
  end if;
  update public.trader_charges
  set amount=case when balance.trader_paid>0 then balance.trader_paid else original_amount end,
      voided_at=case when balance.trader_paid=0 then coalesce(voided_at,now()) end
  where id=legacy_charge;
 end if;
 return new;
end; $$;

drop trigger if exists sync_driver_commission_receipt on public.cashbook_entries;
create trigger sync_driver_commission_receipt after insert or update of amount on public.cashbook_entries
for each row when (new.booking_id is not null and not new.is_transfer)
execute function pedram_private.sync_driver_commission_receipt();
revoke all on function pedram_private.sync_driver_commission_receipt() from public,anon,authenticated;

-- Block the former trader payment path for these bookings. Existing request
-- retries still return their original receipt.
do $$
begin
 if to_regprocedure('pedram_private.cashbook_post_before_driver_commissions(uuid,jsonb)') is null then
  alter function public.cashbook_simple_post(uuid,jsonb) rename to cashbook_post_before_driver_commissions;
  alter function public.cashbook_post_before_driver_commissions(uuid,jsonb) set schema pedram_private;
 end if;
end; $$;
revoke all on function pedram_private.cashbook_post_before_driver_commissions(uuid,jsonb) from public,anon,authenticated;

create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare booking uuid:=nullif(p_data->>'booking_id','')::uuid;
begin
 if booking is not null and not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from pedram_private.driver_booking_commissions m where m.booking_id=booking)
    and not exists(select 1 from public.cashbook_operations o
     where o.id=p_request and o.created_by=auth.uid() and o.request_payload=p_data) then
  raise exception 'BOOKING_PAYMENT_UNAVAILABLE';
 end if;
 return pedram_private.cashbook_post_before_driver_commissions(p_request,p_data);
end; $$;

create or replace function public.add_trader_charge(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from pedram_private.driver_booking_commissions m where m.booking_id=nullif(p_data->>'booking_id','')::uuid) then
  raise exception 'BOOKING_PAYMENT_UNAVAILABLE';
 end if;
 return pedram_private.add_trader_charge(p_request,p_data);
end; $$;

create or replace function public.save_booking_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; trader uuid; old public.bookings; prior uuid;
 first_vehicle uuid; first_driver uuid; second_vehicle uuid; second_driver uuid; transfer_day date; transfer_place text;
 result uuid:=coalesce(p_id,gen_random_uuid()); day date; starts date; ends date; weight numeric; volume numeric;
 payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor_role public.app_role; amount_due numeric; received_now numeric; extra_total numeric; charge_id uuid;
 driver_billed boolean;
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
 driver_billed:=case when p_id is null then p_data->>'service_type'='arrangement'
  else exists(select 1 from pedram_private.driver_booking_commissions where booking_id=p_id) end;
 if p_id is not null and old.service_type is distinct from p_data->>'service_type' and old.commission_amount is not null then
  raise exception 'BOOKING_TYPE_LOCKED';
 end if;
 if p_data->>'service_type'='managed' and exists(select 1 from unnest(array['sender_name','sender_phone','sender_address','receiver_name','receiver_phone','receiver_address']) key where coalesce(trim(p_data->>key),'')='') then raise exception 'REQUIRED_FIELDS'; end if;
 if exists(select 1 from unnest(array['trader_first_name','trader_phone','trader_address','origin','destination','goods']) key where coalesce(trim(p_data->>key),'')='') or p_data->>'service_type' not in ('arrangement','managed') or p_data->>'service_type' is null then raise exception 'REQUIRED_FIELDS'; end if;
 if nullif(p_data->>'commission_amount','')::numeric is null or nullif(p_data->>'commission_amount','')::numeric<=0 or nullif(p_data->>'commission_amount','')::numeric<>round(nullif(p_data->>'commission_amount','')::numeric,2) or coalesce(p_data->>'commission_currency','') not in ('AFN','USD','PKR','IRR') then raise exception 'INVALID_AMOUNT'; end if;
 if jsonb_typeof(coalesce(p_data->'other_expenses','[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_data->'other_expenses','[]'::jsonb)) x where nullif(trim(x->>'description'),'') is null or nullif(x->>'amount','')::numeric is null or nullif(x->>'amount','')::numeric<=0 or nullif(x->>'amount','')::numeric<>round(nullif(x->>'amount','')::numeric,2)) then raise exception 'INVALID_AMOUNT'; end if;
 if p_data->>'service_type'='managed' and (nullif(p_data->>'freight_amount','')::numeric is null or nullif(p_data->>'carrier_cost','')::numeric is null or nullif(p_data->>'freight_amount','')::numeric<0 or nullif(p_data->>'carrier_cost','')::numeric<0) then raise exception 'REQUIRED_FIELDS'; end if;
 day:=nullif(p_data->>'booking_date','')::date;
 starts:=coalesce(nullif(p_data->>'departure_date','')::date,old.departure_date,day);
 ends:=coalesce(nullif(p_data->>'arrival_date','')::date,old.arrival_date,starts);
 if day is null or starts is null or ends is null or not (isfinite(day) and isfinite(starts) and isfinite(ends))
    or starts<day or ends<starts then raise exception 'INVALID_DATES'; end if;
 first_vehicle:=nullif(p_data->>'vehicle_id','')::uuid;
 first_driver:=nullif(p_data->>'driver_id','')::uuid;
 if p_id is not null and driver_billed and first_driver is distinct from old.driver_id and exists (
   select 1 from pedram_private.driver_commission_balances where booking_id=p_id and paid>0
 ) then raise exception 'COMMISSION_DRIVER_LOCKED'; end if;
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
 if driver_billed then
  if p_id is null then insert into pedram_private.driver_booking_commissions(booking_id) values(result); end if;
  if received_now>0 then
   perform public.receive_driver_booking_commission(gen_random_uuid(),result,first_driver,received_now,(now() at time zone 'Asia/Kabul')::date);
  end if;
  perform pedram_private.remember(p_request,'booking',payload,result);
  return result;
 end if;
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
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'date',b.booking_date,'origin',b.origin,'destination',b.destination,'goods',b.goods,'quantity',b.quantity,'status',b.status,'currency',b.commission_currency,'commission',case when m.booking_id is null then b.commission_amount end,'freight',b.freight_amount,'vehicle_cost',b.carrier_cost,'other_expenses',b.other_expenses) order by b.booking_date,b.booking_number) from public.bookings b left join pedram_private.driver_booking_commissions m on m.booking_id=b.id where b.trader_id=t.id and b.deleted_at is null),'[]'::jsonb)
 );
end; $$;
create or replace function public.trader_account_statement(p_trader uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 return pedram_private.trader_account_statement(p_trader) || jsonb_build_object('bookings', coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',b.id,'number',b.booking_number,'date',b.booking_date,'branch_id',b.branch_id,
   'origin',b.origin,'destination',b.destination,'currency',b.commission_currency,
   'driver_commission',m.booking_id is not null,'archived',b.archived_at is not null,'deleted',b.deleted_at is not null
  ) order by b.booking_date desc,b.booking_number desc)
  from public.bookings b left join pedram_private.driver_booking_commissions m on m.booking_id=b.id where b.trader_id=p_trader
 ), '[]'::jsonb));
end; $$;

create or replace function public.booking_finance_rows()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',b.id,'commission_amount',b.commission_amount,'commission_currency',b.commission_currency,
  'freight_amount',b.freight_amount,'carrier_cost',b.carrier_cost,'other_expenses',b.other_expenses,
  'commission_driver_id',d.driver_id
 ) || case when public.is_president_user() then jsonb_build_object(
  'charged',case when d.booking_id is not null then d.total-d.trader_paid else
   coalesce((select sum(c.amount) from public.trader_charges c where c.booking_id=b.id and c.voided_at is null and c.currency=b.commission_currency),0) end,
  'paid',case when d.booking_id is not null then d.paid else
   coalesce((select sum(case when e.direction='in' then e.amount else -e.amount end)
    from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
    where e.booking_id=b.id and e.trader_id=b.trader_id and a.currency=b.commission_currency and not e.is_transfer),0) end
 ) else '{}'::jsonb end), '[]'::jsonb)
 from public.bookings b left join pedram_private.driver_commission_balances d on d.booking_id=b.id
 where public.operations_access(b.branch_id);
$$;

create or replace function public.driver_booking_commissions(p_driver uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare driver uuid; president boolean:=public.is_president_user();
begin
 if president then
  driver:=p_driver;
 else
  select d.id into driver from public.drivers d where d.user_id=auth.uid() and public.driver_booking_access(d.id);
  if driver is null or (p_driver is not null and driver<>p_driver) then raise exception 'ACCESS_DENIED'; end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'booking_id',f.booking_id,'booking_number',f.booking_number,'date',f.booking_date,
  'currency',f.currency,'charged',f.total-f.trader_paid,'paid',f.paid
 ) order by f.booking_date desc,f.booking_number desc)
 from pedram_private.driver_commission_balances f join public.bookings b on b.id=f.booking_id
 where f.driver_id=driver and (president or b.deleted_at is null)),'[]'::jsonb);
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
      'driver_commission',case when f.booking_id is not null then jsonb_build_object(
        'currency',f.currency,'charged',f.total-f.trader_paid,'paid',f.paid) end,
      'vehicle',case when v.id is not null then jsonb_build_object('plate_number',v.plate_number,
        'foreign_plate_number',v.foreign_plate_number,'vehicle_type',v.vehicle_type,'color',v.color) end,
      'branch',jsonb_build_object('name',coalesce(br.name,'Head office'),
        'phone',coalesce(nullif(br.phone,''),nullif(manager.phone,'')))
    ) order by case l.status when 'in_transit' then 0 when 'confirmed' then 1 else 2 end,l.departure_date,l.id
  ),'[]'::jsonb) into jobs
  from assigned l join public.bookings b on b.id=l.id
  left join pedram_private.driver_commission_balances f on f.booking_id=l.id and f.driver_id=d.id and l.leg=1
  left join public.vehicles v on v.id=l.vehicle_id
  left join public.branches br on br.id=l.branch_id
  left join public.profiles manager on manager.id=br.manager_user_id;

  return jsonb_build_object('driver',jsonb_build_object('full_name',d.full_name,'phone',d.phone,
    'license_number',d.license_number,'license_expiry',d.license_expiry),'bookings',jobs);
end; $$;

revoke all on function public.receive_driver_booking_commission(uuid,uuid,uuid,numeric,date,text),
 public.driver_booking_commissions(uuid), public.cashbook_simple_post(uuid,jsonb) from public,anon;
grant execute on function public.receive_driver_booking_commission(uuid,uuid,uuid,numeric,date,text),
 public.driver_booking_commissions(uuid), public.cashbook_simple_post(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
