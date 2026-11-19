alter table public.employees
  add column if not exists occupation text not null default '';
