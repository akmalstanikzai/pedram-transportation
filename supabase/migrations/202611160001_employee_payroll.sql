begin;

-- Salaries are AFN. Month keys use the application's Solar Hijri calendar.
create table public.employee_payroll (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 payroll_year integer not null check (payroll_year between 1300 and 1600),
 payroll_month integer not null check (payroll_month between 1 and 12),
 salary numeric(14,2) not null check (salary >= 0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(employee_id,payroll_year,payroll_month)
);
create table public.employee_payroll_payments (
 entry_id uuid primary key references public.cashbook_entries(id),
 payroll_id uuid not null references public.employee_payroll(id),
 payment_kind text not null check (payment_kind in ('advance','salary'))
);
create index employee_payroll_payments_month_idx on public.employee_payroll_payments(payroll_id);
alter table public.employee_payroll enable row level security;
alter table public.employee_payroll_payments enable row level security;
revoke all on public.employee_payroll,public.employee_payroll_payments from public,anon,authenticated;
grant select on public.employee_payroll,public.employee_payroll_payments to authenticated;
create policy payroll_president_read on public.employee_payroll for select to authenticated using(public.is_president_user());
create policy payroll_payments_president_read on public.employee_payroll_payments for select to authenticated using(public.is_president_user());

create function public.prepare_employee_payroll(p_year integer,p_month integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_year is null or p_year not between 1300 and 1600 or p_month is null or p_month not between 1 and 12 then raise exception 'INVALID_PAYROLL_MONTH'; end if;
 insert into public.employee_payroll(employee_id,payroll_year,payroll_month,salary,created_by)
 select id,p_year,p_month,salary,auth.uid() from public.employees where archived_at is null
 on conflict(employee_id,payroll_year,payroll_month) do nothing;
end; $$;

create function public.employee_payroll_month(p_year integer,p_month integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_year is null or p_year not between 1300 and 1600 or p_month is null or p_month not between 1 and 12 then raise exception 'INVALID_PAYROLL_MONTH'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'employee_id',e.id,'name',concat_ws(' ',e.first_name,e.last_name),'phone',e.phone,
  'archived',e.archived_at is not null,'salary',p.salary,
  'advances',totals.advances,'paid',totals.paid,
  'remaining',p.salary-totals.advances-totals.paid,
  'payments',coalesce((select jsonb_agg(jsonb_build_object(
   'id',ce.id,'date',ce.entry_date,'amount',ce.amount,'kind',pp.payment_kind,
   'account',coalesce(b.name,'Admin'),'reversed',exists(select 1 from public.cashbook_operations r where r.reverses_id=ce.operation_id)
  ) order by ce.entry_date desc,ce.id)
  from public.employee_payroll_payments pp join public.cashbook_entries ce on ce.id=pp.entry_id
  join public.cashbook_accounts a on a.id=ce.account_id left join public.branches b on b.id=a.branch_id
  where pp.payroll_id=p.id),'[]'::jsonb)
 ) order by e.first_name,e.last_name,p.id)
 from public.employee_payroll p join public.employees e on e.id=p.employee_id
 cross join lateral (
  select coalesce(sum(ce.amount) filter(where pp.payment_kind='advance'),0) advances,
   coalesce(sum(ce.amount) filter(where pp.payment_kind='salary'),0) paid
  from public.employee_payroll_payments pp join public.cashbook_entries ce on ce.id=pp.entry_id
  where pp.payroll_id=p.id and not exists(select 1 from public.cashbook_operations r where r.reverses_id=ce.operation_id)
 ) totals where p.payroll_year=p_year and p.payroll_month=p_month),'[]'::jsonb);
end; $$;

create function public.pay_employee_payroll(p_request uuid,p_payroll uuid,p_kind text,p_amount numeric,p_date date,p_branch uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.employee_payroll; existing public.cashbook_operations; payload jsonb; paid numeric; operation uuid; entry uuid;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_ENTRY'; end if;
 if p_kind is null or p_kind not in ('advance','salary') then raise exception 'INVALID_ENTRY'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
 select * into p from public.employee_payroll where id=p_payroll for update;
 if not found then raise exception 'PAYROLL_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 payload:=jsonb_build_object('branch_id',p_branch,'currency','AFN','direction','out','amount',p_amount,'date',p_date,
  'employee_id',p.employee_id,'payroll_id',p.id,'payment_kind',p_kind,
  'description',case when p_kind='advance' then 'Salary advance' else 'Salary payment' end||' · '||p.payroll_year||'/'||lpad(p.payroll_month::text,2,'0')||' · '||(select concat_ws(' ',first_name,last_name) from public.employees where id=p.employee_id));
 select * into existing from public.cashbook_operations where id=p_request;
 if found then
  if existing.created_by is distinct from auth.uid() or (existing.request_payload-'description') is distinct from (payload-'description')
   or not exists(select 1 from public.employee_payroll_payments pp join public.cashbook_entries ce on ce.id=pp.entry_id where pp.payroll_id=p.id and ce.operation_id=existing.id and pp.payment_kind=p_kind)
   then raise exception 'REQUEST_CONFLICT'; end if;
  return existing.id;
 end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
 if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and archived_at is null) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.employees where id=p.employee_id and archived_at is not null) then raise exception 'EMPLOYEE_UNAVAILABLE'; end if;
 select coalesce(sum(ce.amount),0) into paid from public.employee_payroll_payments pp
 join public.cashbook_entries ce on ce.id=pp.entry_id where pp.payroll_id=p.id
 and not exists(select 1 from public.cashbook_operations r where r.reverses_id=ce.operation_id);
 if p_amount>p.salary-paid then raise exception 'PAYROLL_EXCEEDS_BALANCE'; end if;
 operation:=public.cashbook_simple_post(p_request,payload);
 select id into strict entry from public.cashbook_entries where operation_id=operation;
 insert into public.employee_payroll_payments(entry_id,payroll_id,payment_kind) values(entry,p.id,p_kind);
 return operation;
end; $$;

-- Existing Cashbook amount corrections must also respect the salary balance.
create function pedram_private.guard_payroll_amount() returns trigger
language plpgsql security definer set search_path='' as $$
declare payroll uuid; salary numeric; other_paid numeric;
begin
 select payroll_id into payroll from public.employee_payroll_payments where entry_id=old.id;
 if not found then return new; end if;
 select p.salary into salary from public.employee_payroll p where p.id=payroll for update;
 select coalesce(sum(ce.amount),0) into other_paid from public.employee_payroll_payments pp
 join public.cashbook_entries ce on ce.id=pp.entry_id where pp.payroll_id=payroll and ce.id<>old.id
 and not exists(select 1 from public.cashbook_operations r where r.reverses_id=ce.operation_id);
 if new.amount+other_paid>salary then raise exception 'PAYROLL_EXCEEDS_BALANCE'; end if;
 return new;
end; $$;
create trigger cashbook_payroll_amount_guard before update of amount on public.cashbook_entries
for each row when (old.amount is distinct from new.amount) execute function pedram_private.guard_payroll_amount();
revoke all on function pedram_private.guard_payroll_amount() from public,anon,authenticated;
revoke all on function public.prepare_employee_payroll(integer,integer),public.employee_payroll_month(integer,integer),public.pay_employee_payroll(uuid,uuid,text,numeric,date,uuid) from public,anon;
grant execute on function public.prepare_employee_payroll(integer,integer),public.employee_payroll_month(integer,integer),public.pay_employee_payroll(uuid,uuid,text,numeric,date,uuid) to authenticated;
commit;
