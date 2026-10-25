-- =====================================================================
-- Comentarios en los recursos.
--
--  · admin      → lee, comenta, edita los suyos y borra cualquiera.
--  · moderator  → lee, comenta, edita y borra SOLO los suyos.
--                 Sigue sin poder descargar ni abrir referencias: esta tabla
--                 no da acceso a resources ni a resource_attachments.
--  · support    → no ve Recursos, tampoco sus comentarios.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor, DESPUÉS de la migración de rangos
-- (20261022000000_roles.sql). Es seguro repetirla.
-- =====================================================================

create table if not exists public.resource_comments (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

create index if not exists resource_comments_resource_created_idx
  on public.resource_comments (resource_id, created_at);

-- Marca de "editado" (misma función que usan los comentarios de tareas).
create or replace function public.set_comment_edited_at()
returns trigger
language plpgsql
as $$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists resource_comments_set_edited_at on public.resource_comments;
create trigger resource_comments_set_edited_at
  before update on public.resource_comments
  for each row execute function public.set_comment_edited_at();

alter table public.resource_comments enable row level security;

drop policy if exists "resource comments read" on public.resource_comments;
create policy "resource comments read"
  on public.resource_comments for select to authenticated
  using (public.can_view_resources());

drop policy if exists "resource comments insert" on public.resource_comments;
create policy "resource comments insert"
  on public.resource_comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_resources());

drop policy if exists "resource comments update own" on public.resource_comments;
create policy "resource comments update own"
  on public.resource_comments for update to authenticated
  using (user_id = auth.uid() and public.can_view_resources())
  with check (user_id = auth.uid() and public.can_view_resources());

drop policy if exists "resource comments delete" on public.resource_comments;
create policy "resource comments delete"
  on public.resource_comments for delete to authenticated
  using (public.can_view_resources() and (user_id = auth.uid() or public.is_admin()));

revoke all on public.resource_comments from anon;
grant select, insert, update, delete on public.resource_comments to authenticated;
