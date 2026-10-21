-- =====================================================================
-- Rangos: admin / moderator / support
--
--  · admin      → todo: miembros, rangos, recursos completos (descargas,
--                 referencias, notas) y credenciales.
--  · moderator  → ve el apartado de Recursos en SOLO LECTURA: título,
--                 descripción, imágenes y vídeos. Sin descargas, sin
--                 referencias, sin notas privadas, sin editar.
--  · support    → NO ve Recursos. Sí usa las tareas como hasta ahora.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor (después de las migraciones
-- anteriores). Los antiguos "member" pasan a "support".
-- =====================================================================

-- 1) Roles ---------------------------------------------------------------
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
update public.workspace_members set role = 'support' where role = 'member';
alter table public.workspace_members alter column role set default 'support';
alter table public.workspace_members
  add constraint workspace_members_role_check check (role in ('admin', 'moderator', 'support'));

-- 2) Funciones de ayuda ---------------------------------------------------
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.workspace_members m
  where m.user_id = auth.uid()
    and (m.expires_at is null or m.expires_at > now());
$$;

create or replace function public.can_view_resources()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() in ('admin', 'moderator'), false);
$$;

-- Cambia el rango de una persona (solo administrador).
create or replace function public.set_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede cambiar rangos' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'moderator', 'support') then
    raise exception 'Rango no válido';
  end if;

  select role into v_old from public.workspace_members where user_id = p_user for update;
  if not found then
    raise exception 'Esa persona todavía no tiene acceso al espacio de trabajo';
  end if;

  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'No puedes quitarte a ti mismo el rango de administrador';
  end if;

  if v_old = 'admin' and p_role <> 'admin'
     and (select count(*) from public.workspace_members where role = 'admin') <= 1 then
    raise exception 'Tiene que quedar al menos un administrador';
  end if;

  -- Un administrador no puede tener el acceso caducable.
  update public.workspace_members
  set role = p_role,
      expires_at = case when p_role = 'admin' then null else expires_at end
  where user_id = p_user;
end;
$$;

-- 3) Canjear credencial: los nuevos entran como "support" -----------------
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
  values (v_user, 'support', v_expires, v_cred.id)
  on conflict (user_id) do update
    set expires_at    = excluded.expires_at,
        credential_id = excluded.credential_id;

  update public.access_credentials
  set redeemed_by = v_user, redeemed_at = now()
  where id = v_cred.id;

  return jsonb_build_object('kind', v_cred.kind, 'expires_at', v_expires);
end;
$$;

-- 4) Recursos: solo el admin toca las tablas directamente --------------------
-- Moderadores y soporte NO tienen acceso directo a las tablas (así no pueden
-- leer url / download_url / file_path con el cliente de Supabase). El
-- moderador lee a través de list_resources(), que ya va "recortada".

drop policy if exists "admins read all resources" on public.resources;
create policy "admins read all resources"
  on public.resources for select to authenticated
  using (public.is_admin());

drop policy if exists "admins read all resource attachments" on public.resource_attachments;
create policy "admins read all resource attachments"
  on public.resource_attachments for select to authenticated
  using (public.is_admin());

do $$
declare
  t text;
begin
  foreach t in array array['resources', 'resource_attachments']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "resources admin only" on public.%I', t);
      execute format(
        'create policy "resources admin only" on public.%I as restrictive for all to authenticated '
        || 'using (public.is_admin()) with check (public.is_admin())', t);
    end if;
  end loop;
end $$;

-- Lista de recursos según el rango:
--   admin     → todo
--   moderator → sin url, download_url ni notes; los archivos van sin file_path
--               (solo nombre y tamaño); imágenes y vídeos se mantienen
--   support   → error
create or replace function public.list_resources()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.my_role();
begin
  if v_role is null or v_role not in ('admin', 'moderator') then
    raise exception 'No tienes permiso para ver los recursos' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      (case when v_role = 'admin'
            then to_jsonb(r)
            else to_jsonb(r) - 'url' - 'download_url' - 'notes' end)
      || jsonb_build_object('resource_attachments', coalesce((
        select jsonb_agg(
          case when v_role = 'admin'
                 or a.file_type like 'image/%'
                 or a.file_type = 'video/youtube'
               then to_jsonb(a)
               else to_jsonb(a) - 'file_path' end
          order by a.position
        )
        from public.resource_attachments a
        where a.resource_id = r.id
      ), '[]'::jsonb))
      order by r.created_at desc
    )
    from public.resources r
  ), '[]'::jsonb);
end;
$$;

-- ¿Puede esta persona abrir este archivo de recurso?
--   'not_resource' → no es un adjunto de recurso (se aplica la regla de siempre)
--   'allowed'      → admin (todo) o moderador (solo imágenes)
--   'denied'       → es un adjunto de recurso y su rango no lo permite
create or replace function public.resource_file_access(p_path text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_role text := public.my_role();
begin
  select a.file_type into v_type
  from public.resource_attachments a
  where a.file_path = p_path
  limit 1;

  if not found then
    return 'not_resource';
  end if;
  if v_role = 'admin' then
    return 'allowed';
  end if;
  if v_role = 'moderator' and v_type like 'image/%' then
    return 'allowed';
  end if;
  return 'denied';
end;
$$;

revoke all on function public.my_role()                         from public, anon;
revoke all on function public.can_view_resources()              from public, anon;
revoke all on function public.set_member_role(uuid, text)       from public, anon;
revoke all on function public.list_resources()                  from public, anon;
revoke all on function public.resource_file_access(text)        from public, anon;
grant execute on function public.my_role()                      to authenticated;
grant execute on function public.can_view_resources()           to authenticated;
grant execute on function public.set_member_role(uuid, text)    to authenticated;
grant execute on function public.list_resources()               to authenticated;
grant execute on function public.resource_file_access(text)     to authenticated;
