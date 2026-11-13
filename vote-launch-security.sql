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


-- Match the website's 10-vote promotion: €8 / 8,000 Kz.
-- Other quantities remain €1 / 1,000 Kz per vote.
create or replace function public.validate_awards_vote_submission()
returns trigger
language plpgsql
set search_path = ''
as $
declare
  nominee_record record;
  expected_amount numeric(12,2);
  expected_currency text;
begin
  select n.id, n.category_id, n.name, c.title
    into nominee_record
  from public.nominees n
  join public.categories c on c.id = n.category_id
  where n.id = new.nominee_id
    and c.id = new.category_id
    and n.is_active = true
    and c.is_active = true;

  if not found then
    raise exception 'The selected nominee or category is not active.';
  end if;

  if new.quantity < 1 or new.quantity > 1000 then
    raise exception 'Vote quantity must be between 1 and 1000.';
  end if;

  if new.payment_method = 'paypal' then
    expected_amount := case when new.quantity = 10 then 8 else new.quantity end;
    expected_currency := 'EUR';
  elsif new.payment_method = 'multicaixa_express' then
    expected_amount := case when new.quantity = 10 then 8000 else new.quantity * 1000 end;
    expected_currency := 'AOA';
  else
    raise exception 'Unsupported payment method.';
  end if;

  if new.amount <> expected_amount or new.currency <> expected_currency then
    raise exception 'Payment amount or currency does not match the vote quantity.';
  end if;
  if nullif(btrim(new.voter_email), '') is null then
    raise exception 'A contact email is required.';
  end if;
  if nullif(btrim(new.transaction_reference), '') is null then
    raise exception 'The payment transaction reference is required.';
  end if;
  if nullif(btrim(new.proof_path), '') is null then
    raise exception 'Payment proof is required.';
  end if;

  new.payment_reference := 'Voto X ' || nominee_record.title || ' X ' ||
    nominee_record.name || ' X ' || new.quantity || ' votos';
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.admin_note := null;
  return new;
end;
$;

commit;
