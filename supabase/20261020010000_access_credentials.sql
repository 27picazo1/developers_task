-- =====================================================================
-- Acceso por credenciales: registrarse ya NO basta para entrar.
--
-- · Solo el administrador puede generar credenciales (códigos de un solo uso),
--   permanentes o temporales.
-- · Quien se registra tiene que introducir una credencial para obtener acceso.
-- · El control se aplica en la base de datos (RLS), no solo en la interfaz.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor.
-- ANTES de ejecutarla, cambia el correo del administrador (ver "3) Arranque").
-- =====================================================================

-- 1) Tablas -------------------------------------------------------------

create table if not exists public.access_credentials (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  kind           text not null check (kind in ('permanent', 'temporary')),
  -- Solo para las temporales: cuánto dura el acceso desde que se canjea.
  duration_hours integer check (duration_hours is null or duration_hours between 1 and 8760),
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  redeemed_by    uuid references auth.users(id) on delete set null,
  redeemed_at    timestamptz,
  revoked_at     timestamptz,
  constraint access_credentials_duration_matches_kind check (
    (kind = 'permanent' and duration_hours is null)
    or (kind = 'temporary' and duration_hours is not null)
  )
);

create table if not exists public.workspace_members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('admin', 'member')),
  -- null = acceso permanente
  expires_at    timestamptz,
  credential_id uuid references public.access_credentials(id) on delete set null,
  granted_at    timestamptz not null default now()
);

alter table public.access_credentials enable row level security;
alter table public.workspace_members  enable row level security;

-- 2) Funciones ----------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.user_id = auth.uid()
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- Genera una credencial (solo administrador). Devuelve la fila creada.
create or replace function public.create_access_credential(
  p_kind  text,
  p_hours integer default null,
  p_note  text default null
)
returns public.access_credentials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.access_credentials;
  v_raw  text;
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede generar credenciales' using errcode = '42501';
  end if;
  if p_kind not in ('permanent', 'temporary') then
    raise exception 'Tipo de credencial no válido';
  end if;
  if p_kind = 'temporary' and (p_hours is null or p_hours < 1 or p_hours > 8760) then
    raise exception 'La duración debe estar entre 1 hora y 365 días';
  end if;

  loop
    -- 16 caracteres hexadecimales aleatorios (se saltan los dígitos fijos de la versión/variante del UUID)
    v_raw  := replace(gen_random_uuid()::text, '-', '');
    v_raw  := upper(substr(v_raw, 1, 12) || substr(v_raw, 18, 4));
    v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-'
           || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
    exit when not exists (select 1 from public.access_credentials where code = v_code);
  end loop;

  insert into public.access_credentials (code, kind, duration_hours, note, created_by)
  values (
    v_code,
    p_kind,
    case when p_kind = 'temporary' then p_hours end,
    nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Canjea una credencial: da acceso al usuario que la introduce.
create or replace function public.redeem_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_norm       text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_cred       public.access_credentials;
  v_member     public.workspace_members;
  v_has_member boolean;
  v_expires    timestamptz;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  if length(v_norm) < 8 then
    raise exception 'Credencial no válida';
  end if;

  -- Bloquea la fila para que dos personas no puedan canjear el mismo código a la vez.
  select * into v_cred
  from public.access_credentials
  where replace(code, '-', '') = v_norm
  for update;

  if not found or v_cred.revoked_at is not null or v_cred.redeemed_at is not null then
    raise exception 'Credencial no válida, revocada o ya utilizada';
  end if;

  select * into v_member from public.workspace_members where user_id = v_user;
  v_has_member := found;

  if v_cred.kind = 'permanent' then
    v_expires := null;
  else
    v_expires := now() + make_interval(hours => v_cred.duration_hours);
    -- Nunca se acorta un acceso que ya dura más (o que es permanente).
    if v_has_member and (v_member.expires_at is null or v_member.expires_at > v_expires) then
      v_expires := v_member.expires_at;
    end if;
  end if;

  -- Un administrador no puede perder su acceso al canjear una credencial.
  if v_has_member and v_member.role = 'admin' then
    v_expires := null;
  end if;

  insert into public.workspace_members (user_id, role, expires_at, credential_id)
  values (v_user, 'member', v_expires, v_cred.id)
  on conflict (user_id) do update
    set expires_at    = excluded.expires_at,
        credential_id = excluded.credential_id;

  update public.access_credentials
  set redeemed_by = v_user, redeemed_at = now()
  where id = v_cred.id;

  return jsonb_build_object('kind', v_cred.kind, 'expires_at', v_expires);
end;
$$;

-- Revoca una credencial (solo administrador). Si ya se había usado, quita el
-- acceso a quien la canjeó (salvo que ese acceso venga de otra credencial).
create or replace function public.revoke_access_credential(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cred public.access_credentials;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede revocar credenciales' using errcode = '42501';
  end if;

  update public.access_credentials
  set revoked_at = coalesce(revoked_at, now())
  where id = p_id
  returning * into v_cred;

  if not found then
    raise exception 'Credencial no encontrada';
  end if;

  if v_cred.redeemed_by is not null then
    delete from public.workspace_members
    where user_id = v_cred.redeemed_by
      and role <> 'admin'
      and credential_id = v_cred.id;
  end if;
end;
$$;

-- Solo usuarios con sesión pueden llamar a estas funciones.
revoke all on function public.is_admin()                                      from public, anon;
revoke all on function public.is_member()                                     from public, anon;
revoke all on function public.create_access_credential(text, integer, text)   from public, anon;
revoke all on function public.redeem_access_code(text)                        from public, anon;
revoke all on function public.revoke_access_credential(uuid)                  from public, anon;
grant execute on function public.is_admin()                                      to authenticated;
grant execute on function public.is_member()                                     to authenticated;
grant execute on function public.create_access_credential(text, integer, text)   to authenticated;
grant execute on function public.redeem_access_code(text)                        to authenticated;
grant execute on function public.revoke_access_credential(uuid)                  to authenticated;

-- 3) Arranque -----------------------------------------------------------
-- · Pon aquí el correo de la cuenta del creador de la plataforma (administrador).
--   Si no se encuentra, se usa la cuenta más antigua.
-- · La PRIMERA vez que se ejecuta, todos los usuarios que ya existen quedan como
--   miembros permanentes para que nadie pierda el acceso de golpe.
--   Los que se registren a partir de ahora tendrán que canjear una credencial.

do $$
declare
  v_admin_email text := '27picazo@gmail.com';
  v_admin       uuid;
begin
  select id into v_admin from auth.users where lower(email) = lower(v_admin_email) limit 1;

  if v_admin is null then
    select id into v_admin from auth.users order by created_at asc limit 1;
    raise notice 'No se encontró el correo del admin; se usa la cuenta más antigua: %', v_admin;
  end if;

  if not exists (select 1 from public.workspace_members) then
    insert into public.workspace_members (user_id, role)
    select u.id, 'member' from auth.users u
    on conflict (user_id) do nothing;
  end if;

  if v_admin is not null then
    insert into public.workspace_members (user_id, role, expires_at)
    values (v_admin, 'admin', null)
    on conflict (user_id) do update set role = 'admin', expires_at = null;
  end if;
end $$;

-- 4) Políticas ----------------------------------------------------------

drop policy if exists "members read own membership" on public.workspace_members;
create policy "members read own membership"
  on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admins read credentials" on public.access_credentials;
create policy "admins read credentials"
  on public.access_credentials for select to authenticated
  using (public.is_admin());

-- (Sin políticas de escritura: las credenciales y la membresía solo se
--  modifican con las funciones de arriba.)

-- Política "restrictiva": se suma (AND) a las que ya existen, así que sin
-- membresía vigente no se puede leer ni escribir en el espacio de trabajo.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks', 'categories', 'subtasks', 'comments', 'attachments',
    'resources', 'resource_attachments'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "members only" on public.%I', t);
      execute format(
        'create policy "members only" on public.%I as restrictive for all to authenticated '
        || 'using (public.is_member()) with check (public.is_member())', t);
    end if;
  end loop;
end $$;

-- Los perfiles: cada uno ve el suyo siempre; el resto, solo los miembros.
drop policy if exists "members only" on public.profiles;
create policy "members only"
  on public.profiles as restrictive for all to authenticated
  using (id = auth.uid() or public.is_member())
  with check (id = auth.uid() or public.is_member());
