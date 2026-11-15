-- MS TikTok PALOP Awards 2026 — member accounts and private approved-vote history
-- Run once in Supabase Dashboard > SQL Editor.

begin;

alter table public.vote_submissions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists vote_submissions_user_status_created_idx
  on public.vote_submissions(user_id, status, created_at desc);

-- Keep anonymous voting available, but prevent a signed-in user from
-- attaching a vote to another person's account.
drop policy if exists "public submit pending votes" on public.vote_submissions;
create policy "public submit pending votes" on public.vote_submissions
for insert to anon, authenticated
with check (
  statement_timestamp() >= timestamptz '2026-11-13 21:00:00+00'
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note is null
  and (
    user_id is null
    or (auth.uid() is not null and user_id = (select auth.uid()))
  )
  and exists (
    select 1
    from public.nominees n
    join public.categories c on c.id = n.category_id
    where n.id = vote_submissions.nominee_id
      and n.category_id = vote_submissions.category_id
      and n.is_active = true
      and c.is_active = true
  )
);

-- Members may read only their own approved submissions.
-- The existing administrator read policy is preserved.
drop policy if exists "members read own approved votes" on public.vote_submissions;
create policy "members read own approved votes" on public.vote_submissions
for select to authenticated
using (user_id = (select auth.uid()) and status = 'approved');

grant select on public.vote_submissions to authenticated;

commit;
