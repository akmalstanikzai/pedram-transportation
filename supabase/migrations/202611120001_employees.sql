begin;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  province text not null check (length(btrim(province)) > 0),
  district text not null check (length(btrim(district)) > 0),
  village text not null check (length(btrim(village)) > 0),
  salary numeric(14,2) not null check (salary >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger employees_updated_at before update on public.employees
for each row execute procedure public.set_updated_at();

alter table public.employees enable row level security;
create policy employees_president_select on public.employees for select to authenticated using (public.is_president_user());
create policy employees_president_insert on public.employees for insert to authenticated with check (public.is_president_user());
create policy employees_president_update on public.employees for update to authenticated using (public.is_president_user()) with check (public.is_president_user());
revoke all on public.employees from public, anon, authenticated;
grant select, insert, update on public.employees to authenticated;

commit;
