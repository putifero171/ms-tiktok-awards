-- MS TikTok PALOP Awards 2026 — username-only member login
-- Run in Supabase SQL Editor AFTER deploying the username-login Edge Function.
-- Safe to run once; creates a private username registry and links new Auth users.

begin;

create table if not exists public.awards_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null unique,
  created_at timestamptz not null default now(),
  constraint awards_username_format check (
    username_normalized ~ '^[a-z0-9._-]{3,24}$'
  )
);

alter table public.awards_usernames enable row level security;
revoke all on public.awards_usernames from anon, authenticated;
grant all on public.awards_usernames to service_role;

create or replace function public.register_awards_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  normalized_username text;
begin
  requested_username := coalesce(new.raw_user_meta_data ->> 'username', '');
  normalized_username := lower(btrim(requested_username));

  if normalized_username !~ '^[a-z0-9._-]{3,24}$' then
    raise exception 'Username inválido. Usa 3 a 24 caracteres: letras, números, ponto, hífen ou underscore.';
  end if;

  insert into public.awards_usernames(user_id, username, username_normalized)
  values (new.id, btrim(requested_username), normalized_username);

  return new;
end;
$$;

drop trigger if exists on_awards_username_created on auth.users;
create trigger on_awards_username_created
after insert on auth.users
for each row execute procedure public.register_awards_username();

-- Keep the public profile table in sync for display and administration.
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.sync_awards_profile_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set username = new.username
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_awards_username_profile_sync on public.awards_usernames;
create trigger on_awards_username_profile_sync
after insert on public.awards_usernames
for each row execute procedure public.sync_awards_profile_username();

commit;
