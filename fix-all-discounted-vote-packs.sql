-- MS TikTok PALOP Awards 2026
-- Definitive fix: remove stale payment-validation triggers and install one
-- validator that accepts every discounted pack (10, 20, 30, 40, 50 votes)
-- across PayPal, Revolut, MB WAY and Multicaixa Express.
-- Run in Supabase Dashboard > SQL Editor.

begin;

create or replace function public.validate_awards_vote_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  nominee_record record;
  expected_amount numeric(12,2);
  expected_currency text;
  is_discounted_pack boolean;
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

  is_discounted_pack :=
    new.quantity between 10 and 50
    and mod(new.quantity, 10) = 0;

  if new.payment_method in ('paypal', 'revolut', 'mbway') then
    expected_currency := 'EUR';
    expected_amount := case
      when is_discounted_pack then new.quantity * 0.80
      else new.quantity
    end;
  elsif new.payment_method = 'multicaixa_express' then
    expected_currency := 'AOA';
    expected_amount := case
      when is_discounted_pack then new.quantity * 800
      else new.quantity * 1000
    end;
  else
    raise exception 'Unsupported payment method: %', new.payment_method;
  end if;

  if round(new.amount::numeric, 2) <> expected_amount
     or upper(new.currency) <> expected_currency then
    raise exception 'Payment amount/currency mismatch. Quantity %, method %, expected % %; received % %.',
      new.quantity, new.payment_method, expected_amount, expected_currency,
      new.amount, new.currency;
  end if;

  if new.payment_method in ('paypal', 'multicaixa_express') then
    if nullif(btrim(new.voter_email), '') is null then
      raise exception 'A contact email is required.';
    end if;
    if nullif(btrim(new.transaction_reference), '') is null then
      raise exception 'The payment transaction reference is required.';
    end if;
  elsif nullif(btrim(new.payer_name), '') is null then
    raise exception 'The payer name is required.';
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

-- Remove any older trigger that still calls a stale validator containing
-- the old hard-coded amount-mismatch rule. Keep unrelated table triggers.
do $$
declare
  old_trigger record;
begin
  for old_trigger in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'vote_submissions'
      and not t.tgisinternal
      and p.prosrc ilike '%Payment amount or currency does not match the vote quantity%'
  loop
    execute format('drop trigger if exists %I on public.vote_submissions', old_trigger.tgname);
  end loop;
end;
$$;

drop trigger if exists validate_awards_vote_submission_trigger on public.vote_submissions;
create trigger validate_awards_vote_submission_trigger
before insert on public.vote_submissions
for each row execute function public.validate_awards_vote_submission();

commit;
