-- Activate paid voting with manual payment verification.
-- Run once in Supabase SQL Editor after the initial schema.

create unique index if not exists vote_submissions_unique_payment_reference
on public.vote_submissions (payment_method, lower(btrim(transaction_reference)))
where transaction_reference is not null and btrim(transaction_reference) <> '';

create or replace function public.validate_awards_vote_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
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
    expected_amount := new.quantity;
    expected_currency := 'EUR';
  elsif new.payment_method = 'multicaixa_express' then
    expected_amount := new.quantity * 1000;
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
$$;

drop trigger if exists validate_awards_vote_submission on public.vote_submissions;
create trigger validate_awards_vote_submission
before insert on public.vote_submissions
for each row execute function public.validate_awards_vote_submission();

-- Reassert the public submission policy, without public read/update/delete access.
drop policy if exists "public submit pending votes" on public.vote_submissions;
create policy "public submit pending votes" on public.vote_submissions
for insert to anon, authenticated
with check (
  status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note is null
);
