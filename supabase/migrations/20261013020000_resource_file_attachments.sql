alter table public.resource_attachments
  drop constraint if exists resource_attachments_file_type_check,
  drop constraint if exists resource_attachments_file_size_check;

alter table public.resource_attachments
  add constraint resource_attachments_file_type_check
    check (char_length(file_type) between 1 and 255),
  add constraint resource_attachments_file_size_check
    check (file_size > 0 and file_size <= 734003200);
