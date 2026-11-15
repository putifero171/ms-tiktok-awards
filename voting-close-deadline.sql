-- MS TikTok PALOP Awards 2026: enforce the voting closing deadline.
-- Voting closes at 23:59:59 London time on 27 December 2026.
-- Run in Supabase SQL Editor after the website countdown deployment.

begin;

create or replace function public.enforce_awards_voting_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if statement_timestamp() < timestamptz '2026-11-13 21:00:00+00' then
    raise exception 'Voting is not open yet.'
      using errcode = 'P0001';
  end if;

  if statement_timestamp() >= timestamptz '2026-12-28 00:00:00+00' then
    raise exception 'Voting closed at 23:59 on 27 December 2026 (London time).'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_awards_voting_open on public.vote_submissions;
create trigger enforce_awards_voting_open
before insert on public.vote_submissions
for each row execute function public.enforce_awards_voting_open();

drop policy if exists "public submit pending votes" on public.vote_submissions;
create policy "public submit pending votes"
on public.vote_submissions
for insert to anon, authenticated
with check (
  statement_timestamp() >= timestamptz '2026-11-13 21:00:00+00'
  and statement_timestamp() < timestamptz '2026-12-28 00:00:00+00'
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note is null
);

drop policy if exists "public upload payment proofs" on storage.objects;
create policy "public upload payment proofs"
on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'payment-proofs'
  and statement_timestamp() >= timestamptz '2026-11-13 21:00:00+00'
  and statement_timestamp() < timestamptz '2026-12-28 00:00:00+00'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','pdf')
);

commit;
