begin;

create table pedram_private.managed_border_bookings (
 booking_id uuid primary key references public.bookings(id),
 border_location text not null check (char_length(border_location) between 1 and 200),
 foreign_plate text check (char_length(foreign_plate)<=100),
 foreign_driver text check (char_length(foreign_driver)<=200),
 foreign_mobile text check (char_length(foreign_mobile)<=80),
 afghan_waybill text check (char_length(afghan_waybill)<=100)
);

alter table public.trader_charges add column managed_charge_key text;
drop index public.trader_charges_booking_idx;
create unique index trader_charges_booking_idx on public.trader_charges(booking_id)
 where booking_id is not null and voided_at is null and managed_charge_key is null;
create unique index trader_charges_managed_booking_idx on public.trader_charges(booking_id,managed_charge_key)
 where managed_charge_key is not null;

create table pedram_private.managed_expense_receipts (
 operation_id uuid primary key references public.cashbook_operations(id),
 charge_id uuid not null references public.trader_charges(id)
);
create index managed_expense_receipts_charge_idx on pedram_private.managed_expense_receipts(charge_id);
revoke all on pedram_private.managed_border_bookings,pedram_private.managed_expense_receipts from public,anon,authenticated;

create view pedram_private.managed_paid_expenses as
select r.charge_id,e.entry_date as paid_on,a.branch_id as paying_branch_id,o.receipt_number
from pedram_private.managed_expense_receipts r
join public.cashbook_operations o on o.id=r.operation_id
join public.cashbook_entries e on e.operation_id=o.id
join public.cashbook_accounts a on a.id=e.account_id
where not exists(select 1 from public.cashbook_operations rev where rev.reverses_id=o.id);
revoke all on pedram_private.managed_paid_expenses from public,anon,authenticated;

create function pedram_private.managed_booking_balances(p_booking uuid)
returns table(currency text,charged numeric,paid numeric)
language sql stable set search_path='' as $$
 select rows.currency,sum(rows.charged),sum(rows.paid) from (
  select c.currency,c.amount as charged,0::numeric as paid
  from public.trader_charges c where c.booking_id=p_booking and c.voided_at is null
  union all
  select a.currency,0::numeric,case e.direction when 'in' then e.amount else -e.amount end
  from public.bookings b join public.cashbook_entries e on e.booking_id=b.id and e.trader_id=b.trader_id
  join public.cashbook_accounts a on a.id=e.account_id
  where b.id=p_booking and not e.is_transfer
 ) rows group by rows.currency order by rows.currency;
$$;

create function pedram_private.save_managed_border_finance(p_booking uuid,p_details jsonb,p_charges jsonb)
returns void language plpgsql set search_path='' as $$
declare b public.bookings; line record; prior public.trader_charges; key text; amount numeric; description text;
begin
 if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_charges) is distinct from 'array'
    or jsonb_array_length(p_charges)>40 then raise exception 'INVALID_MANAGED_CHARGES'; end if;
 if nullif(btrim(p_details->>'border_location'),'') is null then raise exception 'BORDER_REQUIRED'; end if;
 select * into strict b from public.bookings where id=p_booking;
 insert into pedram_private.managed_border_bookings(booking_id,border_location,foreign_plate,foreign_driver,foreign_mobile,afghan_waybill)
 values(p_booking,btrim(p_details->>'border_location'),nullif(btrim(p_details->>'foreign_plate'),''),
  nullif(btrim(p_details->>'foreign_driver'),''),nullif(btrim(p_details->>'foreign_mobile'),''),nullif(btrim(p_details->>'afghan_waybill'),''))
 on conflict(booking_id) do update set border_location=excluded.border_location,foreign_plate=excluded.foreign_plate,
  foreign_driver=excluded.foreign_driver,foreign_mobile=excluded.foreign_mobile,afghan_waybill=excluded.afghan_waybill;

 if (select count(*) from jsonb_array_elements(p_charges)) <>
    (select count(distinct item->>'key') from jsonb_array_elements(p_charges) item)
 then raise exception 'INVALID_MANAGED_CHARGES'; end if;
 if exists(
  select 1 from public.trader_charges c join pedram_private.managed_expense_receipts r on r.charge_id=c.id
  where c.booking_id=p_booking and not exists(select 1 from jsonb_array_elements(p_charges) x where x->>'key'=c.managed_charge_key)
 ) then raise exception 'MANAGED_EXPENSE_LOCKED'; end if;

 delete from public.trader_charges c where c.booking_id=p_booking and c.managed_charge_key is not null
  and not exists(select 1 from jsonb_array_elements(p_charges) x where x->>'key'=c.managed_charge_key);

 for line in select value as item from jsonb_array_elements(p_charges) loop
  key:=line.item->>'key';
  description:=nullif(btrim(line.item->>'description'),'');
  if key not in ('foreign_freight','customs','afghan_freight','commission','terminal','labour')
    and key !~ '^other:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    then raise exception 'INVALID_MANAGED_CHARGES'; end if;
  if line.item->>'amount' is null or (line.item->>'amount') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
    or coalesce(line.item->>'currency','') not in ('AFN','USD','PKR','IRR')
    or (key like 'other:%' and description is null) or char_length(description)>200
    then raise exception 'INVALID_MANAGED_CHARGES'; end if;
  amount:=(line.item->>'amount')::numeric;
  if amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  description:=case key
    when 'foreign_freight' then 'کرایه موتر خارجی' when 'customs' then 'گمرک'
    when 'afghan_freight' then 'کرایه موتر افغانی' when 'commission' then 'کمیشن'
    when 'terminal' then 'پایانه' when 'labour' then 'کاریگر' else description end;

  select * into prior from public.trader_charges c where c.booking_id=p_booking and c.managed_charge_key=key;
  if found and (prior.amount,prior.currency,prior.description) is distinct from (amount,line.item->>'currency',description)
     and exists(select 1 from pedram_private.managed_paid_expenses r where r.charge_id=prior.id)
    then raise exception 'MANAGED_EXPENSE_LOCKED'; end if;
  insert into public.trader_charges(booking_id,trader_id,branch_id,charge_date,description,currency,amount,managed_charge_key)
  values(p_booking,b.trader_id,b.branch_id,b.booking_date,description,line.item->>'currency',amount,key)
  on conflict(booking_id,managed_charge_key) where managed_charge_key is not null
   do update set amount=excluded.amount,currency=excluded.currency,description=excluded.description,charge_date=excluded.charge_date;
 end loop;
 if exists(select 1 from pedram_private.managed_booking_balances(p_booking) f where f.paid>f.charged)
   then raise exception 'MANAGED_PAYMENT_EXCEEDS_BALANCE'; end if;
end; $$;
revoke all on function pedram_private.managed_booking_balances(uuid),pedram_private.save_managed_border_finance(uuid,jsonb,jsonb)
 from public,anon,authenticated;

create function public.pay_managed_booking_expense(
 p_request uuid,p_charge uuid,p_account_branch uuid,p_date date,p_expected_amount numeric,p_expected_currency text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking uuid; b public.bookings; c public.trader_charges; prior uuid;
 input jsonb:=jsonb_build_object('charge',p_charge,'branch',p_account_branch,'date',p_date,
  'amount',p_expected_amount,'currency',p_expected_currency);
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_enabled and p.role in ('president','branch_manager'))
  then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'managed-expense',input);
 if prior is not null then return prior; end if;

 select booking_id into booking from public.trader_charges where id=p_charge and managed_charge_key is not null;
 select * into b from public.bookings where id=booking for update;
 if not found or b.deleted_at is not null or not public.operations_access(b.branch_id) or not public.cashbook_access(p_account_branch)
   or (p_account_branch is not null and not exists(select 1 from public.branches where id=p_account_branch and archived_at is null))
   then raise exception 'ACCESS_DENIED'; end if;
 select * into c from public.trader_charges where id=p_charge and managed_charge_key is not null
   and managed_charge_key<>'commission' and voided_at is null;
 if not found then raise exception 'MANAGED_EXPENSE_UNAVAILABLE'; end if;
 if (c.amount,c.currency) is distinct from (p_expected_amount,p_expected_currency) then raise exception 'STALE_RECORD'; end if;
 if exists(select 1 from pedram_private.managed_paid_expenses where charge_id=p_charge)
   then raise exception 'MANAGED_EXPENSE_ALREADY_PAID'; end if;

 perform pedram_private.cashbook_simple_post(p_request,jsonb_build_object(
  'branch_id',p_account_branch,'currency',c.currency,'direction','out','amount',c.amount,
  'date',p_date,'description','بار نامه #'||b.booking_number||' · '||c.description,
  'managed_expense_id',c.id,'managed_booking_id',b.id
 ));
 update public.cashbook_entries set booking_id=b.id where operation_id=p_request;
 insert into pedram_private.managed_expense_receipts(operation_id,charge_id) values(p_request,c.id);
 perform pedram_private.remember(p_request,'managed-expense',input,p_request);
 return p_request;
end; $$;

create function pedram_private.guard_managed_receipt_correction() returns trigger
language plpgsql security definer set search_path='' as $$
declare balance record;
begin
 if exists(select 1 from pedram_private.managed_expense_receipts where operation_id=new.operation_id)
   then raise exception 'MANAGED_EXPENSE_LOCKED'; end if;
 if new.trader_id is not null then
  perform 1 from public.bookings b join pedram_private.managed_border_bookings m on m.booking_id=b.id
   where b.id=new.booking_id for update of b;
  if found then
   select f.* into balance from pedram_private.managed_booking_balances(new.booking_id) f
   join public.cashbook_accounts a on a.currency=f.currency where a.id=new.account_id;
   if balance.paid>balance.charged then raise exception 'MANAGED_PAYMENT_EXCEEDS_BALANCE'; end if;
  end if;
 end if;
 return new;
end; $$;

create trigger managed_booking_receipt_correction after update of amount on public.cashbook_entries
for each row when (new.booking_id is not null and new.amount is distinct from old.amount)
execute function pedram_private.guard_managed_receipt_correction();
revoke all on function pedram_private.guard_managed_receipt_correction() from public,anon,authenticated;

create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare booking uuid:=nullif(p_data->>'booking_id','')::uuid; balance record; b public.bookings;
  amount numeric; existing public.cashbook_operations;
begin
 if booking is not null and not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from pedram_private.managed_border_bookings m where m.booking_id=booking) then
  select * into b from public.bookings where id=booking for update;
  select * into existing from public.cashbook_operations where id=p_request;
  if found then
   if existing.created_by is distinct from auth.uid() or existing.request_payload is distinct from p_data
     then raise exception 'REQUEST_CONFLICT'; end if;
   return existing.id;
  end if;
  if b.deleted_at is not null or b.archived_at is not null or p_data->>'direction' is distinct from 'in'
    or nullif(p_data->>'trader_id','')::uuid is distinct from b.trader_id
    or num_nonnulls(nullif(p_data->>'employee_id',''),nullif(p_data->>'driver_id',''),
                   nullif(p_data->>'loan_due_date',''),nullif(p_data->>'loan_repayment_entry_id',''))>0
   then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
  select * into balance from pedram_private.managed_booking_balances(booking) where currency=p_data->>'currency';
  if not found then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
  amount:=nullif(p_data->>'amount','')::numeric;
  if amount>balance.charged-balance.paid then raise exception 'MANAGED_PAYMENT_EXCEEDS_BALANCE'; end if;
  return pedram_private.cashbook_simple_post(p_request,p_data);
 end if;

 if exists(select 1 from pedram_private.driver_booking_commissions m where m.booking_id=booking)
   and not exists(select 1 from public.cashbook_operations o where o.id=p_request
    and o.created_by=auth.uid() and o.request_payload=p_data) then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
 return pedram_private.cashbook_post_before_driver_commissions(p_request,p_data);
end; $$;

create or replace function public.add_trader_charge(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare booking uuid:=nullif(p_data->>'booking_id','')::uuid;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from pedram_private.driver_booking_commissions where booking_id=booking)
   or exists(select 1 from pedram_private.managed_border_bookings where booking_id=booking)
   then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
 return pedram_private.add_trader_charge(p_request,p_data);
end; $$;

-- Structured lines can be edited only through the validated booking workflow.
create or replace function public.void_trader_charge(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.trader_charges where id=p_id and managed_charge_key is not null)
   then raise exception 'RECORD_LOCKED'; end if;
 perform pedram_private.void_trader_charge(p_id);
end; $$;

create or replace function public.save_booking_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; trader uuid; old public.bookings; prior uuid;
 first_vehicle uuid; first_driver uuid; second_vehicle uuid; second_driver uuid; transfer_day date; transfer_place text;
 result uuid:=coalesce(p_id,gen_random_uuid()); day date; starts date; ends date; weight numeric; volume numeric;
 payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor_role public.app_role; amount_due numeric; received_now numeric; extra_total numeric; charge_id uuid;
 driver_billed boolean; managed_border boolean:=p_data ? 'managed_border';
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
  if managed_border is distinct from exists(select 1 from pedram_private.managed_border_bookings where booking_id=p_id)
    then raise exception 'BOOKING_TYPE_LOCKED'; end if;
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
 if managed_border and p_data->>'service_type' is distinct from 'managed' then raise exception 'BOOKING_TYPE_LOCKED'; end if;
 if not managed_border and (nullif(p_data->>'commission_amount','')::numeric is null or nullif(p_data->>'commission_amount','')::numeric<=0 or nullif(p_data->>'commission_amount','')::numeric<>round(nullif(p_data->>'commission_amount','')::numeric,2) or coalesce(p_data->>'commission_currency','') not in ('AFN','USD','PKR','IRR')) then raise exception 'INVALID_AMOUNT'; end if;
 if jsonb_typeof(coalesce(p_data->'other_expenses','[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_data->'other_expenses','[]'::jsonb)) x where nullif(trim(x->>'description'),'') is null or nullif(x->>'amount','')::numeric is null or nullif(x->>'amount','')::numeric<=0 or nullif(x->>'amount','')::numeric<>round(nullif(x->>'amount','')::numeric,2)) then raise exception 'INVALID_AMOUNT'; end if;
 if not managed_border and p_data->>'service_type'='managed' and (nullif(p_data->>'freight_amount','')::numeric is null or nullif(p_data->>'carrier_cost','')::numeric is null or nullif(p_data->>'freight_amount','')::numeric<0 or nullif(p_data->>'carrier_cost','')::numeric<0) then raise exception 'REQUIRED_FIELDS'; end if;
 day:=nullif(p_data->>'booking_date','')::date;
 starts:=coalesce(nullif(p_data->>'departure_date','')::date,old.departure_date,day);
 ends:=coalesce(nullif(p_data->>'arrival_date','')::date,old.arrival_date,starts);
 if managed_border then starts:=day; ends:=day; end if;
 if day is null or starts is null or ends is null or not (isfinite(day) and isfinite(starts) and isfinite(ends))
    or starts<day or ends<starts then raise exception 'INVALID_DATES'; end if;
 first_vehicle:=nullif(p_data->>'vehicle_id','')::uuid;
 first_driver:=nullif(p_data->>'driver_id','')::uuid;
 if p_id is not null and driver_billed and first_driver is distinct from old.driver_id and exists (
   select 1 from pedram_private.driver_commission_balances where booking_id=p_id and paid>0
 ) then raise exception 'COMMISSION_DRIVER_LOCKED'; end if;
 if managed_border then
  transfer_day:=null; transfer_place:=null; second_vehicle:=null; second_driver:=null;
 elsif p_data ?| array['handoff_location','handoff_date','onward_vehicle_id','onward_driver_id'] then
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
 values(result,trader,first_vehicle,first_driver,bid,day,starts,ends,p_data->>'service_type',trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),coalesce((p_data->>'sender_is_trader')::boolean,false),case when (p_data->>'sender_is_trader')::boolean then trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))) else trim(p_data->>'sender_name') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_phone') else trim(p_data->>'sender_phone') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_address') else trim(p_data->>'sender_address') end,trim(p_data->>'receiver_name'),trim(p_data->>'receiver_phone'),trim(p_data->>'receiver_address'),trim(p_data->>'goods'),weight,volume,concat(p_data->>'quantity_amount',' ',p_data->>'quantity_unit'),p_data->>'quantity_unit',nullif(p_data->>'quantity_amount','')::numeric,coalesce((p_data->>'receiver_is_trader')::boolean,false),trim(p_data->>'origin'),trim(p_data->>'destination'),case when not managed_border then nullif(p_data->>'commission_amount','')::numeric end,case when not managed_border then p_data->>'commission_currency' end,case when not managed_border then nullif(p_data->>'freight_amount','')::numeric end,case when not managed_border then nullif(p_data->>'carrier_cost','')::numeric end,case when managed_border then '[]'::jsonb else coalesce(p_data->'other_expenses','[]'::jsonb) end,transfer_place,transfer_day,second_vehicle,second_driver,auth.uid())
 on conflict(id) do update set trader_id=excluded.trader_id,vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,booking_date=excluded.booking_date,departure_date=excluded.departure_date,arrival_date=excluded.arrival_date,service_type=excluded.service_type,trader_first_name=excluded.trader_first_name,trader_last_name=excluded.trader_last_name,trader_phone=excluded.trader_phone,trader_address=excluded.trader_address,sender_is_trader=excluded.sender_is_trader,sender_name=excluded.sender_name,sender_phone=excluded.sender_phone,sender_address=excluded.sender_address,receiver_name=excluded.receiver_name,receiver_phone=excluded.receiver_phone,receiver_address=excluded.receiver_address,goods=excluded.goods,weight_tons=excluded.weight_tons,volume_m3=excluded.volume_m3,quantity=excluded.quantity,quantity_unit=excluded.quantity_unit,quantity_amount=excluded.quantity_amount,receiver_is_trader=excluded.receiver_is_trader,origin=excluded.origin,destination=excluded.destination,commission_amount=excluded.commission_amount,commission_currency=excluded.commission_currency,freight_amount=excluded.freight_amount,carrier_cost=excluded.carrier_cost,other_expenses=excluded.other_expenses,
  handoff_location=excluded.handoff_location,handoff_date=excluded.handoff_date,
  onward_vehicle_id=excluded.onward_vehicle_id,onward_driver_id=excluded.onward_driver_id;
 if managed_border then
  if coalesce(nullif(p_data->>'received_now','')::numeric,0)<>0 then raise exception 'INVALID_AMOUNT'; end if;
  perform pedram_private.save_managed_border_finance(result,p_data->'managed_border',p_data->'managed_charges');
  perform pedram_private.remember(p_request,'booking',payload,result);
  return result;
 end if;
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
  'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'booking_id',c.booking_id,'date',c.charge_date,'description',c.description,'currency',c.currency,'amount',c.amount,'voided_at',c.voided_at,'managed_charge_key',c.managed_charge_key,'paid_on',expense.paid_on) order by c.charge_date,c.created_at) from public.trader_charges c left join pedram_private.managed_paid_expenses expense on expense.charge_id=c.id where c.trader_id=t.id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'booking_id',e.booking_id,'date',e.entry_date,'description',e.description,'currency',a.currency,'amount',e.amount,'direction',e.direction,'receipt_number',o.receipt_number) order by e.entry_date,o.receipt_number) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id where e.trader_id=t.id and not e.is_transfer),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'date',b.booking_date,'origin',b.origin,'destination',b.destination,'goods',b.goods,'quantity',b.quantity,'status',b.status,'currency',b.commission_currency,'managed_transport',border.booking_id is not null,'commission',case when m.booking_id is null then b.commission_amount end,'freight',b.freight_amount,'vehicle_cost',b.carrier_cost,'other_expenses',b.other_expenses) order by b.booking_date,b.booking_number) from public.bookings b left join pedram_private.managed_border_bookings border on border.booking_id=b.id left join pedram_private.driver_booking_commissions m on m.booking_id=b.id where b.trader_id=t.id and b.deleted_at is null),'[]'::jsonb)
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
   'driver_commission',m.booking_id is not null,'managed_transport',border.booking_id is not null,'archived',b.archived_at is not null,'deleted',b.deleted_at is not null
  ) order by b.booking_date desc,b.booking_number desc)
  from public.bookings b left join pedram_private.managed_border_bookings border on border.booking_id=b.id left join pedram_private.driver_booking_commissions m on m.booking_id=b.id where b.trader_id=p_trader
 ), '[]'::jsonb));
end; $$;

create or replace function public.booking_finance_rows()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',b.id,'commission_amount',b.commission_amount,'commission_currency',b.commission_currency,
  'freight_amount',b.freight_amount,'carrier_cost',b.carrier_cost,'other_expenses',b.other_expenses,
  'commission_driver_id',d.driver_id,
  'managed_transport',case when m.booking_id is not null then (to_jsonb(m)-'booking_id') || jsonb_build_object(
   'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'key',c.managed_charge_key,'description',c.description,
    'amount',c.amount,'currency',c.currency,'paid_on',p.paid_on,'receipt_number',p.receipt_number,
    'has_receipt',exists(select 1 from pedram_private.managed_expense_receipts r where r.charge_id=c.id))
    order by c.created_at,c.managed_charge_key) from public.trader_charges c
    left join pedram_private.managed_paid_expenses p on p.charge_id=c.id
    where c.booking_id=b.id and c.managed_charge_key is not null),'[]'::jsonb),
   'balances',case when public.is_president_user() then coalesce((select jsonb_agg(to_jsonb(f) order by f.currency)
    from pedram_private.managed_booking_balances(b.id) f),'[]'::jsonb) end
  ) end
 ) || case when public.is_president_user() then jsonb_build_object(
  'charged',case when d.booking_id is not null then d.total-d.trader_paid else
   coalesce((select sum(c.amount) from public.trader_charges c where c.booking_id=b.id and c.voided_at is null and c.currency=b.commission_currency),0) end,
  'paid',case when d.booking_id is not null then d.paid else
   coalesce((select sum(case when e.direction='in' then e.amount else -e.amount end)
    from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
    where e.booking_id=b.id and e.trader_id=b.trader_id and a.currency=b.commission_currency and not e.is_transfer),0) end
 ) else '{}'::jsonb end), '[]'::jsonb)
 from public.bookings b left join pedram_private.driver_commission_balances d on d.booking_id=b.id
 left join pedram_private.managed_border_bookings m on m.booking_id=b.id
 where public.operations_access(b.branch_id);
$$;

create or replace function public.branch_cashbook_rows()
returns jsonb language sql stable security definer set search_path='' as $$
  with scoped as (
    select e.*, o.receipt_number,
      (e.trader_id is not null or (e.booking_id is not null and not exists(
        select 1 from pedram_private.managed_expense_receipts m where m.operation_id=coalesce(o.reverses_id,o.id)
      ))) as linked,
      exists(select 1 from public.customs_agent_payments cp
        join public.cashbook_entries original on original.id=cp.entry_id
        where original.operation_id=coalesce(o.reverses_id,o.id)) as customs_payment
    from public.cashbook_entries e
    join public.cashbook_operations o on o.id=e.operation_id
    join public.cashbook_accounts a on a.id=e.account_id
    join public.profiles p on p.id=auth.uid() and p.account_enabled
      and p.role='branch_manager' and p.branch_id=a.branch_id
  ), rows as (
    select e.id::text as id,e.account_id,e.entry_date,e.direction,e.amount,
      case when e.customs_payment and e.direction='out' then 'پرداخت کمیشن کار'
           when e.customs_payment then 'معامله معکوس پرداخت کمیشن کار'
           else e.description end as description,
      false as private_activity,e.receipt_number
    from scoped e where not e.linked
    union all
    select 'private-'||account_id||'-'||entry_date||'-'||direction,account_id,entry_date,direction,
      sum(amount),null,true,0
    from scoped where linked group by account_id,entry_date,direction
  )
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from rows;
$$;

-- The single registered crew starts at the border on these bookings.
create or replace view pedram_private.booking_legs as
select b.id,b.branch_id,b.booking_number,b.booking_date,b.archived_at,b.deleted_at,b.weight_tons,b.volume_m3,
       leg.number as leg,leg.vehicle_id,leg.driver_id,leg.origin,leg.destination,
       leg.departure_date,leg.arrival_date,leg.status,
       leg.accepted_at,leg.delivered_at
from public.bookings b
left join pedram_private.managed_border_bookings border on border.booking_id=b.id
cross join lateral (
  values
    (1,b.vehicle_id,b.driver_id,coalesce(border.border_location,b.origin),coalesce(b.handoff_location,b.destination),
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
      'sender_address',case when l.leg=1 then coalesce(border.border_location,b.sender_address) else b.handoff_location end,
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
  left join pedram_private.managed_border_bookings border on border.booking_id=b.id
  left join public.vehicles v on v.id=l.vehicle_id
  left join public.branches br on br.id=l.branch_id
  left join public.profiles manager on manager.id=br.manager_user_id;

  return jsonb_build_object('driver',jsonb_build_object('full_name',d.full_name,'phone',d.phone,
    'license_number',d.license_number,'license_expiry',d.license_expiry),'bookings',jobs);
end; $$;

revoke all on function public.pay_managed_booking_expense(uuid,uuid,uuid,date,numeric,text) from public,anon;
grant execute on function public.pay_managed_booking_expense(uuid,uuid,uuid,date,numeric,text) to authenticated;
notify pgrst, 'reload schema';
commit;
