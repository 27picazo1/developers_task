alter table public.resource_attachments
  drop constraint if exists resource_attachments_file_size_check;

alter table public.resource_attachments
  add constraint resource_attachments_file_size_check
    check (file_size > 0 and file_size <= 734003200);
