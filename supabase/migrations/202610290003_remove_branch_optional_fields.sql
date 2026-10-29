-- Remove fields excluded from the simplified branch workflow.
drop index if exists public.branches_status_idx;

alter table if exists public.branches
  drop column if exists status,
  drop column if exists code,
  drop column if exists email,
  drop column if exists opening_date,
  drop column if exists notes;

alter table if exists public.profiles
  drop column if exists employment_start;

drop type if exists public.branch_status;

