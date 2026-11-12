-- MS TikTok PALOP Awards 2026 — Supabase initial schema
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- After Mauro creates an account with mlopes.mstreamit@outlook.com,
-- run the admin promotion statement at the bottom.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_awards_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$;

drop trigger if exists on_auth_user_created_awards on auth.users;
create trigger on_auth_user_created_awards
after insert on auth.users
for each row execute procedure public.handle_new_awards_user();

create or replace function public.is_awards_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.nominees (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  image_path text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(category_id, name)
);

create table if not exists public.vote_submissions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  nominee_id uuid not null references public.nominees(id),
  quantity integer not null check (quantity between 1 and 1000),
  payment_method text not null check (payment_method in ('paypal','multicaixa_express')),
  currency text not null check (currency in ('EUR','AOA')),
  amount numeric(12,2) not null check (amount > 0),
  payment_reference text not null,
  transaction_reference text,
  voter_email text,
  proof_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists nominees_category_order_idx on public.nominees(category_id, display_order);
create index if not exists vote_submissions_status_created_idx on public.vote_submissions(status, created_at desc);
create index if not exists vote_submissions_nominee_status_idx on public.vote_submissions(nominee_id, status);

-- Only aggregate approved votes are exposed publicly; no payment or voter details.
create or replace view public.approved_vote_totals
with (security_invoker = true)
as
select nominee_id, sum(quantity)::bigint as vote_count
from public.vote_submissions
where status = 'approved'
group by nominee_id;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.nominees enable row level security;
alter table public.vote_submissions enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_awards_admin());

drop policy if exists "public read active categories" on public.categories;
create policy "public read active categories" on public.categories
for select to anon, authenticated using (is_active or public.is_awards_admin());

drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories
for all to authenticated using (public.is_awards_admin()) with check (public.is_awards_admin());

drop policy if exists "public read active nominees" on public.nominees;
create policy "public read active nominees" on public.nominees
for select to anon, authenticated using (is_active or public.is_awards_admin());

drop policy if exists "admins manage nominees" on public.nominees;
create policy "admins manage nominees" on public.nominees
for all to authenticated using (public.is_awards_admin()) with check (public.is_awards_admin());

drop policy if exists "public submit pending votes" on public.vote_submissions;
create policy "public submit pending votes" on public.vote_submissions
for insert to anon, authenticated
with check (
  status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note is null
  and exists (
    select 1 from public.nominees n
    join public.categories c on c.id = n.category_id
    where n.id = nominee_id and n.category_id = category_id
      and n.is_active and c.is_active
  )
);

drop policy if exists "admins read vote submissions" on public.vote_submissions;
create policy "admins read vote submissions" on public.vote_submissions
for select to authenticated using (public.is_awards_admin());

drop policy if exists "admins update vote submissions" on public.vote_submissions;
create policy "admins update vote submissions" on public.vote_submissions
for update to authenticated using (public.is_awards_admin())
with check (public.is_awards_admin());

-- Public nominee images; private payment evidence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nominee-images','nominee-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs','payment-proofs',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "public view nominee images" on storage.objects;
create policy "public view nominee images" on storage.objects
for select to anon, authenticated using (bucket_id = 'nominee-images');

drop policy if exists "admins upload nominee images" on storage.objects;
create policy "admins upload nominee images" on storage.objects
for insert to authenticated with check (bucket_id = 'nominee-images' and public.is_awards_admin());

drop policy if exists "admins update nominee images" on storage.objects;
create policy "admins update nominee images" on storage.objects
for update to authenticated using (bucket_id = 'nominee-images' and public.is_awards_admin())
with check (bucket_id = 'nominee-images' and public.is_awards_admin());

drop policy if exists "admins delete nominee images" on storage.objects;
create policy "admins delete nominee images" on storage.objects
for delete to authenticated using (bucket_id = 'nominee-images' and public.is_awards_admin());

drop policy if exists "public upload payment proofs" on storage.objects;
create policy "public upload payment proofs" on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'payment-proofs'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','pdf')
);

drop policy if exists "admins manage payment proofs" on storage.objects;
create policy "admins manage payment proofs" on storage.objects
for all to authenticated using (bucket_id = 'payment-proofs' and public.is_awards_admin())
with check (bucket_id = 'payment-proofs' and public.is_awards_admin());

-- Seed the existing nominee categories and nominees (preserves names/spelling).
insert into public.categories (title, display_order) values
('Personalidade do Ano',1),('Live do Ano',2),('Presenteador do Ano',3),
('Mulher Mais Bonita do Ano',4),('Cavação do Ano',5),('Influenciador do Ano',6),
('DJ do Ano',7),('Homem Mais Bonito do Ano',8)
on conflict (title) do nothing;

insert into public.nominees (category_id,name,display_order)
select c.id, v.name, v.position
from (values
('Personalidade do Ano','Ody Carla',1),('Personalidade do Ano','Rainha Ubuntu',2),('Personalidade do Ano','Vanuskita',3),('Personalidade do Ano','Joker 007',4),('Personalidade do Ano','PDS',5),('Personalidade do Ano','Rainha dos Filhos',6),('Personalidade do Ano','Moço Direito',7),('Personalidade do Ano','Maumau',8),('Personalidade do Ano','Baby Police',9),('Personalidade do Ano','Jelson .X',10),('Personalidade do Ano','Rainha Euro',11),
('Live do Ano','Irmã Calele',1),('Live do Ano','Soberano',2),('Live do Ano','Mila',3),('Live do Ano','Império',4),('Live do Ano','MAF Muteba',5),('Live do Ano','Mia',6),('Live do Ano','Morgana',7),('Live do Ano','Manuela Camboa',8),('Live do Ano','Kenny',9),('Live do Ano','Jumina',10),
('Presenteador do Ano','Abel Strong',1),('Presenteador do Ano','Comentador',2),('Presenteador do Ano','Zaider',3),('Presenteador do Ano','Gostosa',4),('Presenteador do Ano','Bete Coimbra',5),('Presenteador do Ano','Rainha Ubuntu',6),('Presenteador do Ano','Soberano',7),('Presenteador do Ano','Ágatha',8),('Presenteador do Ano','Rosalina',9),('Presenteador do Ano','Rei Panda',10),('Presenteador do Ano','Rei dos Boss',11),('Presenteador do Ano','Pantera Negra Strong',12),('Presenteador do Ano','Kacosta',13),('Presenteador do Ano','Ernesto',14),('Presenteador do Ano','CEO Autoritário',15),('Presenteador do Ano','Macita do Ricardo',16),('Presenteador do Ano','Amor de Meu',17),
('Mulher Mais Bonita do Ano','Daniela Calado',1),('Mulher Mais Bonita do Ano','Manuela Camboa',2),('Mulher Mais Bonita do Ano','Bonita da Relação',3),('Mulher Mais Bonita do Ano','Nelca Ricardo',4),('Mulher Mais Bonita do Ano','Gerente da Rolagem',5),('Mulher Mais Bonita do Ano','Barbie',6),('Mulher Mais Bonita do Ano','Doce M',7),('Mulher Mais Bonita do Ano','Pandora',8),('Mulher Mais Bonita do Ano','Jumina',9),
('Cavação do Ano','Folhas Caídas',1),('Cavação do Ano','Jelson .X',2),('Cavação do Ano','Gilberto',3),('Cavação do Ano','Z Boy',4),('Cavação do Ano','Jossana',5),('Cavação do Ano','BK Polémico',6),('Cavação do Ano','Kassumuna',7),('Cavação do Ano','Ivo Laizer',8),
('Influenciador do Ano','MAF Muteba',1),('Influenciador do Ano','Pai Aturmento',2),('Influenciador do Ano','Josy Ginga',3),('Influenciador do Ano','Boss Bravo',4),('Influenciador do Ano','Elizandra Ely',5),('Influenciador do Ano','Carla Ouro',6),('Influenciador do Ano','Maumau',7),('Influenciador do Ano','Teresa Katchokwe',8),('Influenciador do Ano','Gêmeas Calutes',9),('Influenciador do Ano','Kamilo Carsony',10),('Influenciador do Ano','As Tricotadas',11),
('DJ do Ano','Dj Celson',1),('DJ do Ano','Dj Foguinho',2),('DJ do Ano','Dj Inocêncio',3),('DJ do Ano','Dj Gilberto',4),('DJ do Ano','Dj Kizaca',5),('DJ do Ano','Dj Júnior',6),
('Homem Mais Bonito do Ano','Miguel Marques',1),('Homem Mais Bonito do Ano','Gerginho',2),('Homem Mais Bonito do Ano','Putifero',3),('Homem Mais Bonito do Ano','Inacreditável',4),('Homem Mais Bonito do Ano','Rubem',5),('Homem Mais Bonito do Ano','JC',6),('Homem Mais Bonito do Ano','Nivaldo Nascimento',7),('Homem Mais Bonito do Ano','Kolliandro',8),('Homem Mais Bonito do Ano','Rei Iluminante',9)
) as v(category_name,name,position)
join public.categories c on c.title = v.category_name
on conflict (category_id,name) do nothing;

-- Promote the already-registered account to administrator.
-- Run this AFTER signing up in the website with this exact email.
-- update public.profiles set role = 'admin' where lower(email) = lower('mlopes.mstreamit@outlook.com');
