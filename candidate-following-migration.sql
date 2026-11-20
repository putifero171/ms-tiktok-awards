-- MS TikTok PALOP Awards 2026: member candidate following
create table if not exists public.awards_followed_nominees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nominee_id uuid not null references public.nominees(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint awards_followed_nominees_user_nominee_unique unique (user_id, nominee_id)
);
create index if not exists awards_followed_nominees_user_idx
  on public.awards_followed_nominees(user_id);

alter table public.awards_followed_nominees enable row level security;

drop policy if exists "Members can view their followed nominees" on public.awards_followed_nominees;
create policy "Members can view their followed nominees"
  on public.awards_followed_nominees for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Members can follow nominees" on public.awards_followed_nominees;
create policy "Members can follow nominees"
  on public.awards_followed_nominees for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members can unfollow nominees" on public.awards_followed_nominees;
create policy "Members can unfollow nominees"
  on public.awards_followed_nominees for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.awards_followed_nominees to authenticated;
