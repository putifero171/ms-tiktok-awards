-- Allow different voters to submit the same payment description.
-- payment_reference is a descriptive label, not a unique payment transaction ID.
-- This preserves every existing vote submission and changes no payment records.

ALTER TABLE public.vote_submissions
  DROP CONSTRAINT IF EXISTS vote_submissions_unique_payment_reference;

-- Keep lookups by payment description efficient without requiring uniqueness.
CREATE INDEX IF NOT EXISTS vote_submissions_payment_reference_idx
  ON public.vote_submissions (payment_reference);
