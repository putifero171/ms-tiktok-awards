-- Category sponsors for MS TikTok PALOP Awards 2026
create table if not exists public.category_sponsors (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null unique references public.categories(id) on delete cascade,
  sponsor_name text not null check (char_length(trim(sponsor_name)) between 1 and 100),
  logo_path text,
  website_url text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.category_sponsors enable row level security;
drop policy if exists "Public can view active category sponsors" on public.category_sponsors;
create policy "Public can view active category sponsors" on public.category_sponsors
  for select to anon, authenticated using (is_active = true);
drop policy if exists "Awards admins manage category sponsors" on public.category_sponsors;
create policy "Awards admins manage category sponsors" on public.category_sponsors
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin','content_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin','content_admin')));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('category-sponsor-logos','category-sponsor-logos',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists "Public can view category sponsor logos" on storage.objects;
create policy "Public can view category sponsor logos" on storage.objects
 for select to anon, authenticated using (bucket_id='category-sponsor-logos');
drop policy if exists "Awards admins upload category sponsor logos" on storage.objects;
create policy "Awards admins upload category sponsor logos" on storage.objects
 for insert to authenticated with check (
  bucket_id='category-sponsor-logos' and exists (
   select 1 from public.profiles p where p.id=auth.uid() and p.role in ('super_admin','admin','content_admin')
  )
 );
drop policy if exists "Awards admins update category sponsor logos" on storage.objects;
create policy "Awards admins update category sponsor logos" on storage.objects
 for update to authenticated using (
  bucket_id='category-sponsor-logos' and exists (
   select 1 from public.profiles p where p.id=auth.uid() and p.role in ('super_admin','admin','content_admin')
  )
 ) with check (bucket_id='category-sponsor-logos');
drop policy if exists "Awards admins delete category sponsor logos" on storage.objects;
create policy "Awards admins delete category sponsor logos" on storage.objects
 for delete to authenticated using (
  bucket_id='category-sponsor-logos' and exists (
   select 1 from public.profiles p where p.id=auth.uid() and p.role in ('super_admin','admin','content_admin')
  )
);
