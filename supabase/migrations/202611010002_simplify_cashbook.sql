begin;
-- Preserve existing money records; remove the old transfer/setup API.
drop function if exists public.cashbook_post(uuid,jsonb);
drop policy if exists "President sets opening balances" on public.cashbook_accounts;
revoke insert on public.cashbook_accounts from authenticated;
alter table public.cashbook_accounts alter column branch_id drop not null;
alter table public.cashbook_accounts drop constraint cashbook_accounts_channel_check;
alter table public.cashbook_accounts add constraint cashbook_accounts_channel_check check(channel in ('cash','bank','ledger'));
create unique index cashbook_admin_ledger_currency_idx on public.cashbook_accounts(currency) where branch_id is null and channel='ledger';
create or replace function public.cashbook_access(p_branch uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and account_enabled
 and (role='president' or (role='branch_manager' and p_branch is not null and branch_id=p_branch)));
$$;

create function public.cashbook_simple_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); bid uuid := nullif(p_data->>'branch_id','')::uuid;
 curr text := p_data->>'currency'; flow text := p_data->>'direction';
 amount numeric := nullif(p_data->>'amount','')::numeric; day date := (p_data->>'date')::date;
 label text := trim(p_data->>'description'); account uuid; prior public.cashbook_operations;
begin
 if actor is null or not public.cashbook_access(bid) then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_ENTRY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.cashbook_operations where id=p_request;
 if found then
  if prior.created_by<>actor then raise exception 'ACCESS_DENIED'; end if;
  return prior.id;
 end if;
 if curr is null or curr not in ('AFN','USD','PKR','IRR') or flow is null or flow not in ('in','out') then raise exception 'INVALID_ENTRY'; end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
 if day is null or day>(now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
 if coalesce(label,'')='' then raise exception 'DESCRIPTION_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(bid::text,'admin')||':'||curr,1));
 select id into account from public.cashbook_accounts where branch_id is not distinct from bid and channel='ledger' and currency=curr;
 if not found then
  insert into public.cashbook_accounts(branch_id,channel,currency,opening_date,opening_balance,created_by)
  values(bid,'ledger',curr,'0001-01-01',0,actor) returning id into account;
 end if;
 insert into public.cashbook_operations(id,mode,created_by) values(p_request,case flow when 'in' then 'income' else 'expense' end,actor);
 insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description)
 values(p_request,account,day,flow,amount,label,label);
 return p_request;
end; $$;
revoke all on function public.cashbook_simple_post(uuid,jsonb) from public;
grant execute on function public.cashbook_simple_post(uuid,jsonb) to authenticated;
commit;
