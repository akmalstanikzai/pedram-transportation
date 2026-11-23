begin;

alter table public.trader_password_vault
  add column user_id uuid references auth.users(id) on delete cascade,
  add column auth_fingerprint bytea;

-- Only the service-side function can check a saved password against the
-- currently linked Auth account. The Auth hash never leaves the database.
create function public.trader_login_password(
  p_actor uuid, p_trader uuid, p_user uuid, p_operation text,
  p_auth_updated_at timestamptz default null, p_ciphertext text default null, p_iv text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare fingerprint bytea; sealed jsonb;
begin
  if p_actor = p_user or not exists (
    select 1 from public.profiles a
    join public.traders t on t.id = p_trader and t.user_id = p_user and t.archived_at is null
    join public.profiles p on p.id = t.user_id and p.role = 'trader'
    where a.id = p_actor and a.role = 'president' and a.account_enabled
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_operation is null or p_operation not in ('status','store','reveal') then
    raise exception 'REQUIRED_FIELDS';
  end if;

  if p_operation = 'store' then
    if p_auth_updated_at is null or coalesce(length(p_ciphertext),0) not between 32 and 256
      or coalesce(length(p_iv),0) <> 16 then raise exception 'REQUIRED_FIELDS'; end if;

    -- The marker identifies this write. Account timestamps may be rounded by
    -- one microsecond when moving between Auth JSON and Postgres.
    select sha256(convert_to(u.encrypted_password,'UTF8')) into fingerprint
    from auth.users u
    where u.id = p_user and u.raw_app_meta_data->>'pedram_trader_password_iv' = p_iv
      and u.updated_at between p_auth_updated_at - interval '1 microsecond' and p_auth_updated_at + interval '1 microsecond'
      and u.encrypted_password <> ''
    for share;
    if fingerprint is null then raise exception 'STALE_RECORD'; end if;

    insert into public.trader_password_vault (trader_id,user_id,ciphertext,iv,auth_fingerprint,updated_by,updated_at)
      values (p_trader,p_user,p_ciphertext,p_iv,fingerprint,p_actor,now())
      on conflict (trader_id) do update
      set user_id=excluded.user_id, ciphertext=excluded.ciphertext, iv=excluded.iv,
          auth_fingerprint=excluded.auth_fingerprint, updated_by=excluded.updated_by, updated_at=excluded.updated_at;
    insert into public.trader_password_vault_audit(trader_id,actor_id,action)
      values (p_trader,p_actor,'stored');
    return jsonb_build_object('saved',true);
  end if;

  select jsonb_build_object('ciphertext',v.ciphertext,'iv',v.iv) into sealed
  from public.trader_password_vault v
  join auth.users u on u.id = v.user_id
    and u.raw_app_meta_data->>'pedram_trader_password_iv' = v.iv
    and sha256(convert_to(u.encrypted_password,'UTF8')) = v.auth_fingerprint
  where v.trader_id = p_trader and v.user_id = p_user;

  if p_operation = 'status' then return jsonb_build_object('saved',sealed is not null); end if;
  if sealed is null then raise exception 'PASSWORD_NOT_VAULTED'; end if;

  insert into public.trader_password_vault_audit(trader_id,actor_id,action)
    values (p_trader,p_actor,'viewed');
  return sealed;
end;
$$;

revoke all on function public.trader_login_password(uuid,uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.trader_login_password(uuid,uuid,uuid,text,timestamptz,text,text) to service_role;

commit;
