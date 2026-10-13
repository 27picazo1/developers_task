-- =====================================================================
-- Workspace compartido: todos los usuarios registrados ven y trabajan
-- sobre las mismas tareas, categorías, subtareas, comentarios y archivos.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor.
-- =====================================================================

-- 1) Nuevo campo "type" (bug / idea / improvement / task)
alter table public.tasks
  add column if not exists type text not null default 'task';

alter table public.tasks
  drop constraint if exists tasks_type_check;
alter table public.tasks
  add constraint tasks_type_check check (type in ('task', 'bug', 'idea', 'improvement'));

-- 2) Borra las políticas RLS actuales de estas tablas (eran "solo lo mío")
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('tasks', 'categories', 'subtasks', 'comments', 'attachments', 'profiles')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

alter table public.tasks       enable row level security;
alter table public.categories  enable row level security;
alter table public.subtasks    enable row level security;
alter table public.comments    enable row level security;
alter table public.attachments enable row level security;
alter table public.profiles    enable row level security;

-- 3) Cualquier usuario autenticado puede VER todo
create policy "team can read tasks"       on public.tasks       for select to authenticated using (true);
create policy "team can read categories"  on public.categories  for select to authenticated using (true);
create policy "team can read subtasks"    on public.subtasks    for select to authenticated using (true);
create policy "team can read comments"    on public.comments    for select to authenticated using (true);
create policy "team can read attachments" on public.attachments for select to authenticated using (true);
create policy "team can read profiles"    on public.profiles    for select to authenticated using (true);

-- 4) Cualquier usuario autenticado puede CREAR (siempre a su nombre)
create policy "team can insert tasks"       on public.tasks       for insert to authenticated with check (user_id = auth.uid());
create policy "team can insert categories"  on public.categories  for insert to authenticated with check (user_id = auth.uid());
create policy "team can insert subtasks"    on public.subtasks    for insert to authenticated with check (true);
create policy "team can insert comments"    on public.comments    for insert to authenticated with check (user_id = auth.uid());
create policy "team can insert attachments" on public.attachments for insert to authenticated with check (user_id = auth.uid());
create policy "users can insert own profile" on public.profiles   for insert to authenticated with check (id = auth.uid());

-- 5) Editar: el equipo puede editar tareas, categorías y subtareas;
--    cada uno solo edita su propio perfil
create policy "team can update tasks"      on public.tasks      for update to authenticated using (true) with check (true);
create policy "team can update categories" on public.categories for update to authenticated using (true) with check (true);
create policy "team can update subtasks"   on public.subtasks   for update to authenticated using (true) with check (true);
create policy "users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 6) Borrar: el equipo puede borrar tareas, categorías, subtareas y archivos;
--    los comentarios solo los puede borrar su autor
create policy "team can delete tasks"       on public.tasks       for delete to authenticated using (true);
create policy "team can delete categories"  on public.categories  for delete to authenticated using (true);
create policy "team can delete subtasks"    on public.subtasks    for delete to authenticated using (true);
create policy "team can delete attachments" on public.attachments for delete to authenticated using (true);
create policy "authors can delete comments" on public.comments    for delete to authenticated using (user_id = auth.uid());
