begin;

-- Reversible credentials are deliberately isolated from operational data. They are
-- encrypted by the Edge Function before reaching this table; no browser role can read it.
create table if not exists public.branch_password_vault (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  ciphertext text not null check (length(ciphertext) > 20),
  iv text not null check (length(iv) > 10),
  key_version smallint not null default 1 check (key_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);

create table if not exists public.branch_password_vault_audit (
  id bigint generated always as identity primary key,
  branch_id uuid not null references public.branches(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('stored','viewed')),
  occurred_at timestamptz not null default now()
);
create index if not exists branch_password_vault_audit_branch_time_idx on public.branch_password_vault_audit(branch_id, occurred_at desc);

alter table public.branch_password_vault enable row level security;
alter table public.branch_password_vault_audit enable row level security;
revoke all on table public.branch_password_vault, public.branch_password_vault_audit from public, anon, authenticated;

commit;
