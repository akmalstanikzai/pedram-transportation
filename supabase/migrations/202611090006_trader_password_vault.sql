begin;
create table public.trader_password_vault (
 trader_id uuid primary key references public.traders(id) on delete cascade,
 ciphertext text not null check(length(ciphertext)>20),
 iv text not null check(length(iv)>10),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id)
);
create table public.trader_password_vault_audit (
 id bigint generated always as identity primary key,
 trader_id uuid not null references public.traders(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 action text not null check(action in ('stored','viewed')),
 occurred_at timestamptz not null default now()
);
create index trader_password_vault_audit_trader_idx on public.trader_password_vault_audit(trader_id,occurred_at desc);
alter table public.trader_password_vault enable row level security;
alter table public.trader_password_vault_audit enable row level security;
revoke all on public.trader_password_vault,public.trader_password_vault_audit from public,anon,authenticated;
commit;
