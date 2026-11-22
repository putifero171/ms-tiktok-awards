-- MS TikTok PALOP Awards 2026: IP audit for vote approvals
-- Only approvals recorded after this migration can have a reliable IP address.
create table if not exists public.vote_approval_audit (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.vote_submissions(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  ip_address text not null,
  city text,
  region text,
  country text,
  user_agent text
);

create index if not exists vote_approval_audit_approved_at_idx
  on public.vote_approval_audit(approved_at desc);

alter table public.vote_approval_audit enable row level security;

drop policy if exists "Admins can view vote approval IP audit" on public.vote_approval_audit;
create policy "Admins can view vote approval IP audit"
  on public.vote_approval_audit for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'vote_approver')
    )
  );

revoke all on public.vote_approval_audit from anon, authenticated;
grant select on public.vote_approval_audit to authenticated;
grant all on public.vote_approval_audit to service_role;
