-- Add Stripe Checkout / Apple Pay without changing PayPal or Multicaixa Express.
begin;

alter table public.vote_submissions
  drop constraint if exists vote_submissions_payment_method_check;

alter table public.vote_submissions
  add constraint vote_submissions_payment_method_check
  check (payment_method in ('paypal','multicaixa_express','stripe'));

alter table public.vote_submissions
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

alter table public.vote_submissions
  add constraint vote_submissions_stripe_checkout_session_id_key unique (stripe_checkout_session_id);

alter table public.vote_submissions
  add constraint vote_submissions_stripe_payment_intent_id_key unique (stripe_payment_intent_id);

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
    expected_amount := case when new.quantity = 10 then 8 else new.quantity end;
    expected_currency := 'EUR';
  elsif new.payment_method = 'multicaixa_express' then
    expected_amount := case when new.quantity = 10 then 8000 else new.quantity * 1000 end;
    expected_currency := 'AOA';
  elsif new.payment_method = 'stripe' then
    -- Stripe Checkout creates and verifies this record server-side only.
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Stripe votes can only be recorded by the verified payment webhook.';
    end if;
    if nullif(btrim(new.stripe_checkout_session_id), '') is null
       or nullif(btrim(new.stripe_payment_intent_id), '') is null then
      raise exception 'Verified Stripe payment identifiers are required.';
    end if;
    expected_amount := case when new.quantity = 10 then 8 else new.quantity end;
    expected_currency := 'EUR';
  else
    raise exception 'Unsupported payment method.';
  end if;

  if new.amount <> expected_amount or new.currency <> expected_currency then
    raise exception 'Payment amount or currency does not match the vote quantity.';
  end if;
  if nullif(btrim(new.voter_email), '') is null then
    raise exception 'A contact email is required.';
  end if;

  if new.payment_method = 'stripe' then
    if nullif(btrim(new.transaction_reference), '') is null then
      raise exception 'Verified Stripe transaction reference is required.';
    end if;
    new.proof_path := null;
    new.payment_reference := 'Voto X ' || nominee_record.title || ' X ' ||
      nominee_record.name || ' X ' || new.quantity || ' votos';
    new.status := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := now();
    new.admin_note := 'Pagamento confirmado automaticamente pelo Stripe.';
  else
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
  end if;

  return new;
end;
$$;

commit;
