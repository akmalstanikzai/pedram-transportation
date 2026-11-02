begin;
alter table public.cashbook_entries add column if not exists trader_id uuid references public.traders(id);
alter table public.cashbook_operations add column if not exists request_payload jsonb;
create index cashbook_entries_trader_idx on public.cashbook_entries(trader_id);
create table public.trader_charges (
 id uuid primary key default gen_random_uuid(),
 trader_id uuid not null references public.traders(id),
 booking_id uuid references public.bookings(id),
 charge_date date not null,
 description text not null check(length(trim(description))>0),
 currency text not null check(currency in ('AFN','USD','PKR','IRR')),
 amount numeric(14,2) not null check(amount>0),
 voided_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index trader_charges_booking_idx on public.trader_charges(booking_id) where booking_id is not null and voided_at is null;
create index trader_charges_trader_idx on public.trader_charges(trader_id);
alter table public.trader_charges enable row level security;
create policy "President reads trader charges" on public.trader_charges for select to authenticated using(public.is_president_user());
grant select on public.trader_charges to authenticated;
-- Preserve existing booking account amounts and explicitly linked receipts.
insert into public.trader_charges(trader_id,booking_id,charge_date,description,currency,amount,created_by)
select b.trader_id,b.id,b.booking_date,'Booking #'||b.booking_number,t.currency,t.agreed_total,b.created_by from public.cashbook_booking_terms t join public.bookings b on b.id=t.booking_id;
update public.cashbook_entries e set trader_id=b.trader_id from public.bookings b where b.id=e.booking_id and e.trader_id is null;
create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); bid uuid := nullif(p_data->>'branch_id','')::uuid;
 curr text := p_data->>'currency'; flow text := p_data->>'direction';
 amount numeric := nullif(p_data->>'amount','')::numeric; day date := (p_data->>'date')::date;
 trader uuid := nullif(p_data->>'trader_id','')::uuid;
 label text := trim(p_data->>'description'); account uuid; prior public.cashbook_operations;
begin
 if actor is null or not public.cashbook_access(bid) then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_ENTRY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.cashbook_operations where id=p_request;
 if found then
  if prior.created_by<>actor then raise exception 'ACCESS_DENIED'; end if;
  if prior.request_payload is not null and prior.request_payload<>p_data then raise exception 'REQUEST_CONFLICT'; end if;
  return prior.id;
 end if;
 if curr is null or curr not in ('AFN','USD','PKR','IRR') or flow is null or flow not in ('in','out') then raise exception 'INVALID_ENTRY'; end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
 if day is null or day>(now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
 if coalesce(label,'')='' then raise exception 'DESCRIPTION_REQUIRED'; end if;
 if trader is not null and not exists(select 1 from public.traders t where t.id=trader and t.archived_at is null and public.operations_access(t.branch_id) and (t.branch_id is null or t.branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(bid::text,'admin')||':'||curr,1));
 select id into account from public.cashbook_accounts where branch_id is not distinct from bid and channel='ledger' and currency=curr;
 if not found then
  insert into public.cashbook_accounts(branch_id,channel,currency,opening_date,opening_balance,created_by)
  values(bid,'ledger',curr,'0001-01-01',0,actor) returning id into account;
 end if;
 insert into public.cashbook_operations(id,mode,created_by,request_payload) values(p_request,case flow when 'in' then 'income' else 'expense' end,actor,p_data);
 insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description,trader_id)
 values(p_request,account,day,flow,amount,label,label,trader);
 return p_request;
end; $$;
revoke all on function public.cashbook_simple_post(uuid,jsonb) from public;
grant execute on function public.cashbook_simple_post(uuid,jsonb) to authenticated;

create function public.add_trader_charge(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare trader uuid:=(p_data->>'trader_id')::uuid; booking uuid:=nullif(p_data->>'booking_id','')::uuid;
 amount numeric:=(p_data->>'amount')::numeric; result uuid:=gen_random_uuid(); prior uuid;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'trader-charge',p_data);if prior is not null then return prior;end if;
 perform 1 from public.traders where id=trader and archived_at is null for update;
 if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>999999999999.99 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_AMOUNT';end if;
 if nullif(trim(p_data->>'description'),'') is null or p_data->>'currency' is null or p_data->>'currency' not in ('AFN','USD','PKR','IRR') or nullif(p_data->>'date','')::date is null then raise exception 'REQUIRED_FIELDS';end if;
 if booking is not null and not exists(select 1 from public.bookings b where b.id=booking and b.trader_id=trader and b.archived_at is null and b.status<>'cancelled') then raise exception 'RESOURCE_UNAVAILABLE';end if;
 insert into public.trader_charges(id,trader_id,booking_id,charge_date,description,currency,amount)
 values(result,trader,booking,(p_data->>'date')::date,trim(p_data->>'description'),p_data->>'currency',amount);
 perform pedram_private.remember(p_request,'trader-charge',p_data,result);return result;
end; $$;
create function public.void_trader_charge(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED';end if;
 update public.trader_charges set voided_at=coalesce(voided_at,now()) where id=p_id;
 if not found then raise exception 'RESOURCE_UNAVAILABLE';end if;
end; $$;
create function public.trader_account_statement(p_trader uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED';end if;
 return jsonb_build_object(
 'charges',coalesce((select jsonb_agg(to_jsonb(c) order by c.charge_date,c.created_at) from public.trader_charges c where trader_id=p_trader),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,'currency',a.currency,'description',e.description,'branch',coalesce(b.name,'Admin')) order by e.entry_date,o.receipt_number) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id left join public.branches b on b.id=a.branch_id where e.trader_id=p_trader and not e.is_transfer),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'origin',b.origin,'destination',b.destination)) from public.bookings b where b.trader_id=p_trader and b.archived_at is null and b.status<>'cancelled'),'[]'::jsonb));
end; $$;
revoke all on function public.add_trader_charge(uuid,jsonb),public.void_trader_charge(uuid),public.trader_account_statement(uuid) from public,anon;
grant execute on function public.add_trader_charge(uuid,jsonb),public.void_trader_charge(uuid),public.trader_account_statement(uuid) to authenticated;
commit;

