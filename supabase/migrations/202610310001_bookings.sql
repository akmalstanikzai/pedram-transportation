create table public.traders (
 id uuid primary key default gen_random_uuid(),
 full_name text not null, phone text not null,
 created_at timestamptz not null default now()
);
create table public.bookings (
 id uuid primary key default gen_random_uuid(),
 booking_number bigint generated always as identity unique,
 trader_id uuid not null references public.traders(id),
 vehicle_id uuid references public.vehicles(id),
 driver_id uuid references public.drivers(id),
 service_type text not null check (service_type in ('arrangement','managed')),
 origin text not null, destination text not null, goods text not null,
 quantity text, departure_date date,
 currency text not null check (currency in ('AFN','USD','PKR','IRR')),
 total_freight numeric(14,2) not null check (total_freight >= 0),
 commission numeric(14,2) not null check (commission >= 0 and commission <= total_freight),
 carrier_entitlement numeric(14,2) generated always as (total_freight - commission) stored,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index bookings_trader_idx on public.bookings(trader_id);
alter table public.traders enable row level security;
alter table public.bookings enable row level security;
create policy "Management manages traders" on public.traders for all to authenticated using (public.is_management_user()) with check (public.is_management_user());
create policy "Management manages bookings" on public.bookings for all to authenticated using (public.is_management_user()) with check (public.is_management_user());
grant select, insert, update on public.traders, public.bookings to authenticated;
grant usage, select on sequence public.bookings_booking_number_seq to authenticated;
