-- =====================================================================
-- Edición de comentarios propios.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor (o con `supabase db push`).
-- Es seguro repetirla: usa "if not exists" / "drop ... if exists".
-- =====================================================================

-- 1) Marca de "editado": se rellena sola cuando cambia el contenido.
alter table public.comments
  add column if not exists edited_at timestamptz;

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

drop trigger if exists comments_set_edited_at on public.comments;
create trigger comments_set_edited_at
  before update on public.comments
  for each row execute function public.set_comment_edited_at();

-- 2) Solo el autor puede editar su comentario.
drop policy if exists "authors can update comments" on public.comments;
create policy "authors can update comments"
  on public.comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
