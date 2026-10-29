-- Pedram Transportation: branches and branch manager assignments
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text not null,
  city text not null,
  address text,
  phone text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  add column username text unique,
  add column branch_id uuid references public.branches(id) on delete set null,
  add column phone text,
  add column father_name text,
  add column national_id text,
  add column address text,
  add column account_enabled boolean not null default true;

alter table public.branches
  add column manager_user_id uuid,
  add constraint branches_manager_user_id_fkey foreign key (manager_user_id)
    references public.profiles(id) on delete set null;

create index profiles_branch_id_idx on public.profiles(branch_id);

create trigger branches_updated_at before update on public.branches
for each row execute procedure public.set_updated_at();

create or replace function public.is_president_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'president'
  );
$$;

alter table public.branches enable row level security;

create policy "President can manage all branches" on public.branches
for all to authenticated using (public.is_president_user()) with check (public.is_president_user());

create policy "Managers can read their own branch" on public.branches
for select to authenticated using (id = (select branch_id from public.profiles where id = auth.uid()));

create policy "President can read all profiles" on public.profiles
for select to authenticated using (public.is_president_user());

grant select, insert, update, delete on public.branches to authenticated;

