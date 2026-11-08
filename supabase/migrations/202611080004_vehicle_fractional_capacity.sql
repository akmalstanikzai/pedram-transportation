begin;

-- Keep whole-number capacities and preserve finer fractional values.
alter table public.vehicles
  alter column capacity_tons type numeric(12,6)
  using capacity_tons::numeric(12,6);

commit;
