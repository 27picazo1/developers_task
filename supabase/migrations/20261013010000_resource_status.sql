alter table public.resources
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'resources_status_check'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_status_check
      check (status in ('pending', 'in_progress', 'implemented'));
  end if;
end
$$;
