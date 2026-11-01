begin;
alter table public.bookings add column if not exists branch_id uuid references public.branches(id);

create function public.cashbook_access(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and account_enabled
 and (role='president' or (role='branch_manager' and branch_id=p_branch)));
$$;
revoke all on function public.cashbook_access(uuid) from public;
grant execute on function public.cashbook_access(uuid) to authenticated;

create table public.cashbook_accounts (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id),
 channel text not null check(channel in ('cash','bank')),
 currency text not null check(currency in ('AFN','USD','PKR','IRR')),
 opening_date date not null,
 opening_balance numeric(14,2) not null check(opening_balance >= 0),
 created_by uuid not null default auth.uid() references auth.users(id),
 unique(branch_id,channel,currency)
);
create table public.cashbook_operations (
 id uuid primary key,
 receipt_number bigint generated always as identity unique,
 mode text not null check(mode in ('income','expense','transfer','reversal')),
 reverses_id uuid unique references public.cashbook_operations(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.cashbook_booking_terms (
 booking_id uuid primary key references public.bookings(id),
 branch_id uuid not null references public.branches(id),
 currency text not null check(currency in ('AFN','USD','PKR','IRR')),
 agreed_total numeric(14,2) not null check(agreed_total > 0)
);
create table public.cashbook_entries (
 id uuid primary key default gen_random_uuid(),
 operation_id uuid not null references public.cashbook_operations(id),
 account_id uuid not null references public.cashbook_accounts(id),
 entry_date date not null,
 direction text not null check(direction in ('in','out')),
 amount numeric(14,2) not null check(amount > 0),
 party text not null check(length(trim(party)) > 0),
 description text not null check(length(trim(description)) > 0),
 reference text,
 booking_id uuid references public.bookings(id),
 is_transfer boolean not null default false,
 unique(operation_id,account_id)
);
create index cashbook_entries_account_date_idx on public.cashbook_entries(account_id,entry_date);
create index cashbook_entries_booking_idx on public.cashbook_entries(booking_id);
alter table public.cashbook_accounts enable row level security;
alter table public.cashbook_operations enable row level security;
alter table public.cashbook_entries enable row level security;
alter table public.cashbook_booking_terms enable row level security;
create policy "Read accessible accounts" on public.cashbook_accounts for select to authenticated using(public.cashbook_access(branch_id));
create policy "President sets opening balances" on public.cashbook_accounts for insert to authenticated with check(public.is_president_user() and public.cashbook_access(branch_id) and opening_date <= (now() at time zone 'Asia/Kabul')::date and created_by=auth.uid());
create policy "Read accessible entries" on public.cashbook_entries for select to authenticated using(exists(select 1 from public.cashbook_accounts a where a.id=account_id and public.cashbook_access(a.branch_id)));
create policy "Read accessible operations" on public.cashbook_operations for select to authenticated using(exists(select 1 from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id where e.operation_id=cashbook_operations.id and public.cashbook_access(a.branch_id)));
create policy "Read accessible booking terms" on public.cashbook_booking_terms for select to authenticated using(public.cashbook_access(branch_id));
create policy "Branch reads own bookings" on public.bookings for select to authenticated using(branch_id is not null and public.cashbook_access(branch_id));
grant select,insert on public.cashbook_accounts to authenticated;
grant select on public.cashbook_entries,public.cashbook_operations,public.cashbook_booking_terms to authenticated;

-- All ledger writes pass through one atomic operation. Direct update/delete is not granted.
create function public.cashbook_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare a public.cashbook_accounts; dest public.cashbook_accounts; b public.bookings;
 terms public.cashbook_booking_terms; prior public.cashbook_operations;
 mode text := p_data->>'mode'; amount numeric := nullif(p_data->>'amount','')::numeric;
 day date := (p_data->>'date')::date; actor uuid := auth.uid();
 bid uuid := nullif(p_data->>'booking_id','')::uuid; reverse_id uuid := nullif(p_data->>'reverse_id','')::uuid;
 total numeric := nullif(p_data->>'agreed_total','')::numeric; target uuid; minimum numeric;
begin
 if actor is null then raise exception 'ACCESS_DENIED'; end if;
 -- Serialize retries of the same request; avoid duplicate cash movements.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.cashbook_operations where id=p_request;
 if found then
  if prior.created_by<>actor then raise exception 'ACCESS_DENIED'; end if;
  return prior.id;
 end if;
 if mode not in ('income','expense','transfer','reversal') or mode is null then raise exception 'INVALID_ENTRY'; end if;
 if day is null or day > (now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
 if mode='reversal' then
  select * into prior from public.cashbook_operations where id=reverse_id for update;
  if not found or prior.mode='reversal' or exists(select 1 from public.cashbook_operations where reverses_id=reverse_id) then raise exception 'ALREADY_REVERSED'; end if;
  if coalesce(trim(p_data->>'description'),'')='' then raise exception 'DESCRIPTION_REQUIRED'; end if;
  if exists(select 1 from public.cashbook_entries e join public.cashbook_accounts ac on ac.id=e.account_id where e.operation_id=reverse_id and (not public.cashbook_access(ac.branch_id) or day<e.entry_date)) then raise exception 'ACCESS_OR_DATE'; end if;
  perform 1 from public.cashbook_accounts where id in(select account_id from public.cashbook_entries where operation_id=reverse_id) order by id for update;
  insert into public.cashbook_operations(id,mode,reverses_id,created_by) values(p_request,mode,reverse_id,actor);
  insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description,reference,booking_id,is_transfer)
  select p_request,account_id,day,case direction when 'in' then 'out' else 'in' end, e.amount,party,p_data->>'description',reference,booking_id,is_transfer from public.cashbook_entries e where operation_id=reverse_id;
 else
  -- Lock account rows in a consistent order for concurrent transfers.
  perform 1 from public.cashbook_accounts where id in(nullif(p_data->>'account_id','')::uuid,nullif(p_data->>'destination_id','')::uuid) order by id for update;
  select * into a from public.cashbook_accounts where id=(p_data->>'account_id')::uuid;
  if not found or not public.cashbook_access(a.branch_id) then raise exception 'ACCESS_DENIED'; end if;
  if day<a.opening_date then raise exception 'BEFORE_OPENING'; end if;
  if amount is null or amount<=0 or amount<>round(amount,2) or amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(trim(p_data->>'party'),'')='' or coalesce(trim(p_data->>'description'),'')='' then raise exception 'DESCRIPTION_REQUIRED'; end if;
  if mode='transfer' then
   select * into dest from public.cashbook_accounts where id=(p_data->>'destination_id')::uuid;
   if not found or dest.id=a.id or not public.cashbook_access(dest.branch_id) then raise exception 'INVALID_DESTINATION'; end if;
   if a.currency<>dest.currency then raise exception 'CURRENCY_MISMATCH'; end if;
   if day<dest.opening_date then raise exception 'BEFORE_OPENING'; end if;
   if bid is not null then raise exception 'INVALID_ENTRY'; end if;
  elsif bid is not null then
   if mode<>'income' then raise exception 'BOOKING_RECEIPT_ONLY'; end if;
   select * into b from public.bookings where id=bid for update;
   if not found or (b.branch_id is not null and b.branch_id<>a.branch_id) then raise exception 'BOOKING_BRANCH_MISMATCH'; end if;
   -- Only the President may allocate an existing unassigned booking to a branch.
   if b.branch_id is null and not public.is_president_user() then raise exception 'BOOKING_BRANCH_MISMATCH'; end if;
   select * into terms from public.cashbook_booking_terms where booking_id=bid;
   if found then
    if terms.currency<>a.currency or terms.branch_id<>a.branch_id then raise exception 'CURRENCY_MISMATCH'; end if;
   else
    if total is null or total<=0 or total<>round(total,2) then raise exception 'AGREED_TOTAL_REQUIRED'; end if;
    insert into public.cashbook_booking_terms values(bid,a.branch_id,a.currency,total);
    update public.bookings set branch_id=a.branch_id where id=bid;
   end if;
  end if;
  insert into public.cashbook_operations(id,mode,created_by) values(p_request,mode,actor);
  insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description,reference,booking_id,is_transfer)
  values(p_request,a.id,day,case mode when 'income' then 'in' else 'out' end,amount,trim(p_data->>'party'),trim(p_data->>'description'),p_data->>'reference',bid,mode='transfer');
  if mode='transfer' then
   insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description,reference,is_transfer)
   values(p_request,dest.id,day,'in',amount,trim(p_data->>'party'),trim(p_data->>'description'),p_data->>'reference',true);
  end if;
 end if;
 -- Reject negative balances, including a backdated payment that breaks a later day.
 for target in select account_id from public.cashbook_entries where operation_id=p_request loop
  select min(balance) into minimum from (
   select ac.opening_balance + sum(sum(case e.direction when 'in' then e.amount else -e.amount end)) over(order by e.entry_date) as balance
   from public.cashbook_entries e join public.cashbook_accounts ac on ac.id=e.account_id where e.account_id=target group by e.entry_date,ac.opening_balance
  ) daily;
  if minimum<0 then raise exception 'INSUFFICIENT_BALANCE'; end if;
 end loop;
 return p_request;
end; $$;
revoke all on function public.cashbook_post(uuid,jsonb) from public;
grant execute on function public.cashbook_post(uuid,jsonb) to authenticated;
commit;
