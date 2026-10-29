-- Pedram Transportation: outside vehicle owners and registered fleet
create type public.vehicle_status as enum ('available', 'assigned', 'on_trip', 'under_repair', 'inactive');

create table public.vehicle_owners (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  father_name text,
  phone text not null,
  national_id text,
  address text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.vehicle_owners(id) on delete restrict,
  plate_number text not null unique,
  vehicle_type text not null,
  capacity_tons numeric(8,2),
  model_year integer check (model_year is null or model_year between 1950 and 2100),
  color text,
  status public.vehicle_status not null default 'available',
  permit_number text,
  permit_expiry date,
  registration_expiry date,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  owner_id uuid references public.vehicle_owners(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  expires_on date,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_documents_parent check (
    (vehicle_id is not null and owner_id is null) or
    (vehicle_id is null and owner_id is not null)
  )
);

create index vehicles_owner_id_idx on public.vehicles(owner_id);
create index vehicles_status_idx on public.vehicles(status);
create index vehicle_documents_vehicle_id_idx on public.vehicle_documents(vehicle_id);
create index vehicle_documents_owner_id_idx on public.vehicle_documents(owner_id);
create index vehicle_documents_expires_on_idx on public.vehicle_documents(expires_on);

create trigger vehicle_owners_updated_at before update on public.vehicle_owners
for each row execute procedure public.set_updated_at();

create trigger vehicles_updated_at before update on public.vehicles
for each row execute procedure public.set_updated_at();

create or replace function public.is_management_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('president', 'vice_president')
  );
$$;

alter table public.vehicle_owners enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_documents enable row level security;

create policy "Management can manage vehicle owners" on public.vehicle_owners
for all to authenticated using (public.is_management_user()) with check (public.is_management_user());

create policy "Management can manage vehicles" on public.vehicles
for all to authenticated using (public.is_management_user()) with check (public.is_management_user());

create policy "Management can manage vehicle documents" on public.vehicle_documents
for all to authenticated using (public.is_management_user()) with check (public.is_management_user());

grant select, insert, update, delete on public.vehicle_owners to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_documents to authenticated;

