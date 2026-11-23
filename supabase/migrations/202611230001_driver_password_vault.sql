begin;

create table pedram_private.driver_password_vault (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null check (length(ciphertext) between 32 and 256),
  iv text not null check (length(iv) = 16),
  auth_fingerprint bytea not null
);

create table pedram_private.driver_password_audit (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('stored','viewed')),
  occurred_at timestamptz not null default now()
);

alter table pedram_private.driver_password_vault enable row level security;
alter table pedram_private.driver_password_audit enable row level security;
revoke all on pedram_private.driver_password_vault, pedram_private.driver_password_audit from public, anon, authenticated;

create function pedram_private.assert_driver_password_access(p_actor uuid, p_driver uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_actor = p_user or not exists (
    select 1 from public.profiles a
    join public.drivers d on d.id = p_driver and d.user_id = p_user and d.archived_at is null
    join public.profiles p on p.id = d.user_id and p.role = 'driver'
      and p.branch_id is not distinct from d.branch_id
    where a.id = p_actor and a.role = 'president' and a.account_enabled
  ) then
    raise exception 'ACCESS_DENIED';
  end if;
end;
$$;

create function public.store_driver_login_password(
  p_actor uuid, p_driver uuid, p_user uuid, p_auth_updated_at timestamptz, p_ciphertext text, p_iv text
)
returns void language plpgsql security definer set search_path = '' as $$
declare fingerprint bytea;
begin
  perform pedram_private.assert_driver_password_access(p_actor, p_driver, p_user);
  -- Bind the ciphertext to the Auth write just returned to the Edge Function.
  select sha256(convert_to(u.encrypted_password, 'UTF8')) into fingerprint
  from auth.users u
  where u.id = p_user and u.updated_at = p_auth_updated_at and u.encrypted_password <> ''
  for share;
  if fingerprint is null then raise exception 'STALE_RECORD'; end if;

  insert into pedram_private.driver_password_vault (driver_id,user_id,ciphertext,iv,auth_fingerprint)
    values (p_driver,p_user,p_ciphertext,p_iv,fingerprint)
    on conflict (driver_id) do update
    set user_id = excluded.user_id, ciphertext = excluded.ciphertext,
        iv = excluded.iv, auth_fingerprint = excluded.auth_fingerprint;
  insert into pedram_private.driver_password_audit (driver_id,actor_id,action)
    values (p_driver,p_actor,'stored');
end;
$$;

create function public.read_driver_login_password(p_actor uuid, p_driver uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sealed jsonb;
begin
  perform pedram_private.assert_driver_password_access(p_actor, p_driver, p_user);
  select jsonb_build_object('ciphertext', v.ciphertext, 'iv', v.iv) into sealed
  from pedram_private.driver_password_vault v
  join auth.users u on u.id = v.user_id
    and sha256(convert_to(u.encrypted_password,'UTF8')) = v.auth_fingerprint
  where v.driver_id = p_driver and v.user_id = p_user;
  if sealed is null then raise exception 'PASSWORD_NOT_VAULTED'; end if;

  insert into pedram_private.driver_password_audit (driver_id,actor_id,action)
    values (p_driver,p_actor,'viewed');
  return sealed;
end;
$$;

revoke all on function pedram_private.assert_driver_password_access(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.store_driver_login_password(uuid,uuid,uuid,timestamptz,text,text),
  public.read_driver_login_password(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.store_driver_login_password(uuid,uuid,uuid,timestamptz,text,text),
  public.read_driver_login_password(uuid,uuid,uuid) to service_role;

commit;
