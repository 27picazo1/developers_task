-- =====================================================================
-- Prioridad en los recursos (baja / media / alta), igual que en las tareas.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor ANTES de desplegar la versión
-- nueva de la web (si no, guardar un recurso fallaría por la columna que falta).
-- Es seguro repetirla. Los recursos que ya existen quedan en "media".
--
-- list_resources() no necesita cambios: devuelve la fila completa, así que
-- admin y moderador reciben la prioridad automáticamente.
-- =====================================================================

alter table public.resources
  add column if not exists priority text not null default 'medium';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resources_priority_check') then
    alter table public.resources
      add constraint resources_priority_check check (priority in ('low', 'medium', 'high'));
  end if;
end $$;
