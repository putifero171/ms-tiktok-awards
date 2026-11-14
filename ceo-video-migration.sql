-- CEO message video upload for MS TikTok PALOP Awards 2026
-- Run once in Supabase Dashboard > SQL Editor.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ceo-message', 'ceo-message', true, 524288000, array['video/mp4'])
on conflict (id) do update
set public = true,
    file_size_limit = 524288000,
    allowed_mime_types = array['video/mp4'];

drop policy if exists "Public can view CEO message video" on storage.objects;
create policy "Public can view CEO message video"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'ceo-message');

drop policy if exists "Awards content admins upload CEO video" on storage.objects;
create policy "Awards content admins upload CEO video"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ceo-message'
  and lower(storage.extension(name)) = 'mp4'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('super_admin', 'admin', 'content_admin')
  )
);

drop policy if exists "Awards content admins update CEO video" on storage.objects;
create policy "Awards content admins update CEO video"
on storage.objects for update
to authenticated
using (
  bucket_id = 'ceo-message'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('super_admin', 'admin', 'content_admin')
  )
)
with check (
  bucket_id = 'ceo-message'
  and lower(storage.extension(name)) = 'mp4'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('super_admin', 'admin', 'content_admin')
  )
);

commit;
