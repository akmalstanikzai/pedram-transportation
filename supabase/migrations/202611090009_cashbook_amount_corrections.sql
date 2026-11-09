begin;

create table public.cashbook_amount_corrections (
 request_id uuid primary key,
 entry_id uuid not null references public.cashbook_entries(id),
 previous_amount numeric(14,2) not null check (previous_amount > 0),
 corrected_amount numeric(14,2) not null check (corrected_amount > 0),
 reason text not null check (char_length(btrim(reason)) between 1 and 500),
 changed_by uuid not null references auth.users(id),
 changed_at timestamptz not null default clock_timestamp()
);
create index cashbook_amount_corrections_entry_idx
 on public.cashbook_amount_corrections(entry_id,changed_at desc);
alter table public.cashbook_amount_corrections enable row level security;
revoke all on public.cashbook_amount_corrections from public,anon,authenticated;
grant select on public.cashbook_amount_corrections to authenticated;
create policy "President reads Cashbook amount history"
 on public.cashbook_amount_corrections for select to authenticated using (public.is_president_user());

create function public.correct_cashbook_amount(
 p_request uuid,p_entry uuid,p_expected_amount numeric,p_amount numeric,p_reason text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 operation uuid;
 original public.cashbook_operations;
 entry public.cashbook_entries;
 prior public.cashbook_amount_corrections;
 correction_reason text := btrim(coalesce(p_reason,''));
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null or p_entry is null then raise exception 'INVALID_CORRECTION'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then
  raise exception 'INVALID_AMOUNT';
 end if;
 if char_length(correction_reason) not between 1 and 500 then raise exception 'CORRECTION_REASON_REQUIRED'; end if;

 select operation_id into operation from public.cashbook_entries where id=p_entry;
 if not found then raise exception 'INVALID_CORRECTION'; end if;
 -- Reversals lock this same receipt before reading its entries.
 select * into original from public.cashbook_operations where id=operation for update;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.cashbook_amount_corrections where request_id=p_request;
 if found then
  if prior.entry_id is distinct from p_entry or prior.changed_by is distinct from auth.uid()
    or prior.previous_amount is distinct from p_expected_amount or prior.corrected_amount is distinct from p_amount
    or prior.reason is distinct from correction_reason then raise exception 'REQUEST_CONFLICT'; end if;
  return prior.request_id;
 end if;

 select * into entry from public.cashbook_entries where id=p_entry for update;
 if original.mode not in ('income','expense') or entry.is_transfer
  or exists(select 1 from public.cashbook_entries where operation_id=operation and id<>p_entry)
  or exists(select 1 from public.cashbook_operations where reverses_id=operation) then
  raise exception 'INVALID_CORRECTION';
 end if;
 if entry.amount is distinct from p_expected_amount then raise exception 'STALE_RECORD'; end if;
 if entry.amount=p_amount then raise exception 'INVALID_CORRECTION'; end if;

 insert into public.cashbook_amount_corrections(request_id,entry_id,previous_amount,corrected_amount,reason,changed_by)
 values(p_request,p_entry,entry.amount,p_amount,correction_reason,auth.uid());
 update public.cashbook_entries set amount=p_amount where id=p_entry;
 return p_request;
end; $$;

revoke execute on function public.correct_cashbook_amount(uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.correct_cashbook_amount(uuid,uuid,numeric,numeric,text) to authenticated;
commit;
