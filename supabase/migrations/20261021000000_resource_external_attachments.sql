-- =====================================================================
-- Recursos: permitir imágenes y vídeos por ENLACE (además de archivos en R2).
--
-- Hace falta para "Mover a recursos" desde una tarea: las imágenes de las
-- tareas suelen ser enlaces (imgur...) y los vídeos son enlaces de YouTube.
-- Hasta ahora una fila de resource_attachments solo podía apuntar a un
-- archivo subido a R2 (ruta "r2/<tu id>/...") y con tamaño > 0.
--
-- Ejecutar UNA vez en Supabase -> SQL Editor. Es seguro repetirla.
-- =====================================================================

-- 1) Quita las comprobaciones antiguas de ruta y tamaño (sea cual sea su nombre).
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.resource_attachments'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%file_path%' or pg_get_constraintdef(oid) ilike '%file_size%')
  loop
    execute format('alter table public.resource_attachments drop constraint %I', c.conname);
  end loop;
end $$;

-- 2) La ruta puede ser un archivo propio en R2 o un enlace http(s).
alter table public.resource_attachments
  add constraint resource_attachments_file_path_check
  check (file_path like 'r2/' || user_id::text || '/%' or file_path ~* '^https?://');

-- 3) Tamaño: los archivos siguen necesitando tamaño > 0 (máx. 700 MB);
--    los enlaces externos no tienen tamaño y se guardan con 0.
alter table public.resource_attachments
  add constraint resource_attachments_file_size_check
  check (
    file_size >= 0
    and file_size <= 734003200
    and (file_size > 0 or file_path ~* '^https?://')
  );
