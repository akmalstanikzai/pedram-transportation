begin;

create table pedram_private.trader_extra_receipts (
 operation_id uuid primary key references public.cashbook_operations(id),
 charge_id uuid not null references public.trader_charges(id)
);
create index on pedram_private.trader_extra_receipts(charge_id);
revoke all on pedram_private.trader_extra_receipts from public,anon,authenticated;

create function pedram_private.trader_extra_paid(p_charge uuid,p_exclude uuid default null)
returns numeric language sql stable set search_path='' as $$
 select coalesce(sum(e.amount),0)
 from pedram_private.trader_extra_receipts r join public.cashbook_entries e on e.operation_id=r.operation_id
 where r.charge_id=p_charge and e.id is distinct from p_exclude and e.direction='in'
 and not exists(select 1 from public.cashbook_operations v where v.reverses_id=r.operation_id);
$$;
revoke all on function pedram_private.trader_extra_paid(uuid,uuid) from public,anon,authenticated;

create function public.receive_trader_booking_payment(
 p_request uuid,p_trader uuid,p_booking uuid,p_currency text,p_amount numeric,p_date date
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 b public.bookings;
 remaining numeric;
 prior uuid;
 payload jsonb:=jsonb_build_array(p_trader,p_booking,p_currency,p_amount,p_date);
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'trader-booking-payment',payload);
 if prior is not null then return prior; end if;
 select * into b from public.bookings where id=p_booking for update;
 if not found or b.trader_id is distinct from p_trader or b.deleted_at is not null
 or b.archived_at is not null or b.status='cancelled'
 or exists(select 1 from pedram_private.driver_booking_commissions d where d.booking_id=b.id)
 or (b.branch_id is not null and not exists(select 1 from public.branches where id=b.branch_id and archived_at is null))
 then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
 select f.charged-f.paid into remaining
 from pedram_private.managed_booking_balances(b.id) f where f.currency=p_currency;
 if coalesce(remaining,0)<=0 then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
 if p_amount>remaining then raise exception 'MANAGED_PAYMENT_EXCEEDS_BALANCE'; end if;
 if exists(select 1 from public.cashbook_operations where id=p_request) then raise exception 'REQUEST_CONFLICT'; end if;
 perform public.cashbook_simple_post(p_request,jsonb_build_object(
  'branch_id',b.branch_id,'trader_id',p_trader,'booking_id',b.id,'currency',p_currency,
  'direction','in','amount',p_amount,'date',p_date,'description','دریافت بابت بار نامه #'||b.booking_number));
 perform pedram_private.remember(p_request,'trader-booking-payment',payload,p_request);
 return p_request;
end; $$;

create function public.receive_trader_extra_payment(p_request uuid,p_charge uuid,p_amount numeric,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 charge public.trader_charges;
 prior uuid;
 payload jsonb:=jsonb_build_array(p_charge,p_amount,p_date);
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'trader-extra-payment',payload);
 if prior is not null then return prior; end if;
 select * into charge from public.trader_charges where id=p_charge for update;
 if not found or charge.booking_id is not null or charge.voided_at is not null
 or (charge.branch_id is not null and not exists(select 1 from public.branches where id=charge.branch_id and archived_at is null))
 then raise exception 'TRADER_EXTRA_CHARGE_UNAVAILABLE'; end if;
 if p_date<charge.charge_date then raise exception 'INVALID_DATE'; end if;
 if p_amount>charge.amount-pedram_private.trader_extra_paid(charge.id)
 then raise exception 'TRADER_EXTRA_EXCEEDS_BALANCE'; end if;
 if exists(select 1 from public.cashbook_operations where id=p_request) then raise exception 'REQUEST_CONFLICT'; end if;
 perform public.cashbook_simple_post(p_request,jsonb_build_object(
  'branch_id',charge.branch_id,'trader_id',charge.trader_id,'currency',charge.currency,
  'direction','in','amount',p_amount,'date',p_date,'description','دریافت بدهی اضافی · '||charge.description));
 insert into pedram_private.trader_extra_receipts values(p_request,charge.id);
 perform pedram_private.remember(p_request,'trader-extra-payment',payload,p_request);
 return p_request;
end; $$;

create function public.record_trader_extra_charge(p_request uuid,p_data jsonb,p_received_now numeric default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 charge uuid;
 prior uuid;
 payload jsonb:=jsonb_build_object('charge',p_data,'received',p_received_now);
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'trader-extra-charge',payload);
 if prior is not null then return prior; end if;
 if nullif(p_data->>'booking_id','') is not null or p_received_now is null or p_received_now<0
 then raise exception 'INVALID_AMOUNT'; end if;
 charge:=public.add_trader_charge(gen_random_uuid(),p_data);
 if p_received_now>0 then
  perform public.receive_trader_extra_payment(gen_random_uuid(),charge,p_received_now,(p_data->>'date')::date);
 end if;
 perform pedram_private.remember(p_request,'trader-extra-charge',payload,charge);
 return charge;
end; $$;

-- Reversing an extra receipt reopens its charge. An amount correction and a
-- new receipt share the charge lock, so together they cannot exceed the charge.
create function pedram_private.guard_trader_payment_correction()
returns trigger language plpgsql security definer set search_path='' as $$
declare charge public.trader_charges; remaining numeric;
begin
 select c.* into charge from pedram_private.trader_extra_receipts r
 join public.trader_charges c on c.id=r.charge_id
 where r.operation_id=old.operation_id for update of c;
 if found and (charge.voided_at is not null or
  new.amount+pedram_private.trader_extra_paid(charge.id,old.id)>charge.amount)
 then raise exception 'TRADER_EXTRA_EXCEEDS_BALANCE'; end if;
 if old.booking_id is not null and exists(
  select 1 from pedram_private.requests where id=old.operation_id and kind='trader-booking-payment'
 ) then
  perform 1 from public.bookings where id=old.booking_id for update;
  select f.charged-f.paid into remaining
  from pedram_private.managed_booking_balances(old.booking_id) f
  join public.cashbook_accounts a on a.currency=f.currency where a.id=old.account_id;
  if new.amount-old.amount>coalesce(remaining,0) then raise exception 'MANAGED_PAYMENT_EXCEEDS_BALANCE'; end if;
 end if;
 return new;
end; $$;
revoke all on function pedram_private.guard_trader_payment_correction() from public,anon,authenticated;
create trigger guard_trader_payment_correction before update of amount on public.cashbook_entries
for each row when (old.amount is distinct from new.amount) execute function pedram_private.guard_trader_payment_correction();

create or replace function public.void_trader_charge(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare charge public.trader_charges;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 select * into charge from public.trader_charges where id=p_id for update;
 if charge.managed_charge_key is not null then raise exception 'RECORD_LOCKED'; end if;
 if pedram_private.trader_extra_paid(p_id)>0 then raise exception 'TRADER_EXTRA_HAS_PAYMENT'; end if;
 perform pedram_private.void_trader_charge(p_id);
end; $$;

create function pedram_private.trader_statement_payment_references(p_statement jsonb)
returns jsonb language sql stable set search_path='' as $$
 select p_statement || jsonb_build_object('payments',coalesce((
  select jsonb_agg(p.item||jsonb_build_object('extra_charge_id',r.charge_id,'receipt_number',o.receipt_number) order by p.position)
  from jsonb_array_elements(p_statement->'payments') with ordinality p(item,position)
  left join public.cashbook_entries e on e.id=(p.item->>'id')::uuid
  left join public.cashbook_operations o on o.id=e.operation_id
  left join pedram_private.trader_extra_receipts r on r.operation_id=coalesce(o.reverses_id,o.id)
 ),'[]'::jsonb));
$$;
revoke all on function pedram_private.trader_statement_payment_references(jsonb) from public,anon,authenticated;

alter function public.trader_account_statement(uuid) rename to trader_account_statement_with_bookings;
alter function public.trader_account_statement_with_bookings(uuid) set schema pedram_private;
alter function public.trader_portal_statement() set schema pedram_private;
revoke all on function pedram_private.trader_account_statement_with_bookings(uuid),pedram_private.trader_portal_statement()
 from public,anon,authenticated;

create function public.trader_account_statement(p_trader uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select pedram_private.trader_statement_payment_references(pedram_private.trader_account_statement_with_bookings(p_trader));
$$;

create function public.trader_portal_statement()
returns jsonb language sql stable security definer set search_path='' as $$
 select pedram_private.trader_statement_payment_references(pedram_private.trader_portal_statement());
$$;

revoke all on function public.receive_trader_booking_payment(uuid,uuid,uuid,text,numeric,date),
 public.receive_trader_extra_payment(uuid,uuid,numeric,date),public.record_trader_extra_charge(uuid,jsonb,numeric),
 public.trader_account_statement(uuid),public.trader_portal_statement() from public,anon;
grant execute on function public.receive_trader_booking_payment(uuid,uuid,uuid,text,numeric,date),
 public.receive_trader_extra_payment(uuid,uuid,numeric,date),public.record_trader_extra_charge(uuid,jsonb,numeric),
 public.trader_account_statement(uuid),public.trader_portal_statement() to authenticated;

notify pgrst, 'reload schema';
commit;
