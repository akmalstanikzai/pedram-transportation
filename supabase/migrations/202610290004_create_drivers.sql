-- Drivers belong to the fleet registry and can be reassigned between vehicles.
create type public.driver_status as enum ('available', 'assigned', 'inactive');

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.vehicle_owners(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  full_name text not null,
  father_name text,
  phone text not null,
  national_id text,
  license_number text,
  license_expiry date,
  address text,
  status public.driver_status not null default 'available',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index drivers_current_vehicle_idx on public.drivers(vehicle_id) where vehicle_id is not null;
create index drivers_owner_id_idx on public.drivers(owner_id);
create index drivers_status_idx on public.drivers(status);

create trigger drivers_updated_at before update on public.drivers
for each row execute procedure public.set_updated_at();

alter table public.drivers enable row level security;
create policy "Management can manage drivers" on public.drivers
for all to authenticated using (public.is_management_user()) with check (public.is_management_user());
grant select, insert, update, delete on public.drivers to authenticated;

