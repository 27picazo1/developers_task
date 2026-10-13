create table if not exists public.resource_attachments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null check (file_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  file_size bigint not null check (file_size > 0 and file_size <= 8388608),
  position integer not null default 0 check (position >= 0),
  is_banner boolean not null default false,
  created_at timestamptz not null default now(),
  check (file_path like 'r2/' || user_id::text || '/%')
);

create index if not exists resource_attachments_resource_position_idx
  on public.resource_attachments (resource_id, position);

create unique index if not exists resource_attachments_one_banner_per_resource_idx
  on public.resource_attachments (resource_id)
  where is_banner;

alter table public.resource_attachments enable row level security;

drop policy if exists "resource owners can read resource attachments" on public.resource_attachments;
create policy "resource owners can read resource attachments"
  on public.resource_attachments for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.resources
      where resources.id = resource_attachments.resource_id
        and resources.user_id = auth.uid()
    )
  );

drop policy if exists "resource owners can add resource attachments" on public.resource_attachments;
create policy "resource owners can add resource attachments"
  on public.resource_attachments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.resources
      where resources.id = resource_attachments.resource_id
        and resources.user_id = auth.uid()
    )
  );

drop policy if exists "resource owners can update resource attachments" on public.resource_attachments;
create policy "resource owners can update resource attachments"
  on public.resource_attachments for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.resources
      where resources.id = resource_attachments.resource_id
        and resources.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.resources
      where resources.id = resource_attachments.resource_id
        and resources.user_id = auth.uid()
    )
  );

drop policy if exists "resource owners can delete resource attachments" on public.resource_attachments;
create policy "resource owners can delete resource attachments"
  on public.resource_attachments for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.resources
      where resources.id = resource_attachments.resource_id
        and resources.user_id = auth.uid()
    )
  );
