-- MS TikTok PALOP Awards 2026: enforce the voting opening time in Supabase.
-- Run this migration in Supabase Dashboard > SQL Editor before launch.
-- The opening time is 13 November 2026 at 22:00 UTC (London/Luanda local time).

begin;

-- Server-side guard: direct API requests cannot submit a vote before launch.
create or replace function public.enforce_awards_voting_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if statement_timestamp() < timestamptz '2026-11-13 22:00:00+00' then
    raise exception 'Voting is not open yet. Voting opens at 22:00 on 13 November 2026.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_awards_voting_open on public.vote_submissions;
create trigger enforce_awards_voting_open
before insert on public.vote_submissions
for each row execute function public.enforce_awards_voting_open();

-- Keep public submissions pending-only and require the launch time in the database policy too.
drop policy if exists "public submit pending votes" on public.vote_submissions;
create policy "public submit pending votes" on public.vote_submissions
for insert to anon, authenticated
with check (
  statement_timestamp() >= timestamptz '2026-11-13 22:00:00+00'
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note is null
);

-- Prevent public payment-proof uploads before launch as well.
drop policy if exists "public upload payment proofs" on storage.objects;
create policy "public upload payment proofs" on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'payment-proofs'
  and statement_timestamp() >= timestamptz '2026-11-13 22:00:00+00'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','pdf')
);

commit;
