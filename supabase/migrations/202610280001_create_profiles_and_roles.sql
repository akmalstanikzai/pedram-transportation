-- Pedram Transportation: profiles and role-based access
create type public.app_role as enum ('president','vice_president','departmental_manager','branch_manager','driver');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'driver',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on column public.profiles.role is 'Access level. Change this value from a trusted admin workflow; never accept it from the client.';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
create policy "Users can read their own profile" on public.profiles for select to authenticated using (auth.uid() = id);
grant select on public.profiles to authenticated;

-- No client insert/update policy is intentional. Assign roles from a trusted admin session:
-- update public.profiles set role = 'branch_manager' where id = '<user-uuid>';
