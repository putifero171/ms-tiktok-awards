-- Add Revolut personal payment with manual proof review.
-- Run once in Supabase SQL Editor after the website code is deployed.
begin;

alter table public.vote_submissions
  add column if not exists payer_name text;

alter table public.vote_submissions
  drop constraint if exists vote_submissions_payment_method_check;

alter table public.vote_submissions
  add constraint vote_submissions_payment_method_check
  check (payment_method in ('paypal','multicaixa_express','revolut'));

create or replace function public.validate_awards_vote_submission()
returns trigger
language plpgsql
set search_path = ''
as $awards_revolut_validation$
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

  if new.payment_method in ('paypal','revolut') then
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

  if new.payment_method = 'revolut' then
    if nullif(btrim(new.payer_name), '') is null then
      raise exception 'Payer name is required for Revolut submissions.';
    end if;
  else
    if nullif(btrim(new.voter_email), '') is null then
      raise exception 'A contact email is required.';
    end if;
    if nullif(btrim(new.transaction_reference), '') is null then
      raise exception 'The payment transaction reference is required.';
    end if;
  end if;

  if nullif(btrim(new.proof_path), '') is null then
    raise exception 'Payment proof is required.';
  end if;

  new.payment_reference := 'Voto X ' || nominee_record.title || ' X ' ||
    nominee_record.name || ' X ' || new.quantity || ' votos';
  if new.payment_method = 'revolut' then
    new.transaction_reference := new.payment_reference;
  end if;
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.admin_note := null;
  return new;
end;
$awards_revolut_validation$;

commit;
