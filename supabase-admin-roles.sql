-- MS TikTok PALOP Awards role-based administration
-- Run in Supabase SQL Editor. Then promote Mauro using the one-time statement at the bottom.

create or replace function public.current_awards_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() limit 1 $$;

create or replace function public.admin_manage_awards_user(target_email text, new_role text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare target_id uuid;
begin
 if public.current_awards_role() <> 'super_admin' then raise exception 'Only the Super Admin can manage administrators'; end if;
 if new_role not in ('vote_approver','content_admin','admin','suspended') then raise exception 'Invalid role'; end if;
 select id into target_id from auth.users where lower(email)=lower(trim(target_email)) limit 1;
 if target_id is null then raise exception 'No account found. Ask this person to create an account first.'; end if;
 insert into public.profiles(id,role) values(target_id,new_role)
 on conflict(id) do update set role=excluded.role;
 return jsonb_build_object('user_id',target_id,'role',new_role);
end; $$;

create or replace function public.admin_review_vote_submission(submission_id uuid, decision text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare updated_id uuid;
begin
 if public.current_awards_role() not in ('super_admin','admin','vote_approver') then raise exception 'Not authorised'; end if;
 if decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 update public.vote_submissions set status=decision,reviewed_by=auth.uid(),reviewed_at=now()
 where id=submission_id and status='pending' returning id into updated_id;
 if updated_id is null then raise exception 'Submission not found or already reviewed'; end if;
 return jsonb_build_object('id',updated_id,'status',decision);
end; $$;

grant execute on function public.admin_manage_awards_user(text,text) to authenticated;
grant execute on function public.admin_review_vote_submission(uuid,text) to authenticated;

alter table public.vote_submissions enable row level security;
drop policy if exists "Awards reviewers can read submissions" on public.vote_submissions;
create policy "Awards reviewers can read submissions" on public.vote_submissions
for select to authenticated using (public.current_awards_role() in ('super_admin','admin','vote_approver'));

-- Replace with Mauro's actual Supabase login email and run once after confirming it:
-- update public.profiles set role='super_admin'
-- where id=(select id from auth.users where lower(email)=lower('MAURO_EMAIL_HERE'));
