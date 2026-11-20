-- MS TikTok PALOP Awards — cumulative loyalty rewards
-- 30 approved, account-linked paid votes = one automatic 3-vote reward.
-- Rewards are unique per user and milestone. Redemptions are one-time and atomic.
-- Existing paid submissions are preserved; historical approved votes are backfilled.

BEGIN;

CREATE TABLE IF NOT EXISTS public.awards_loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_votes integer NOT NULL CHECK (milestone_votes >= 30 AND milestone_votes % 30 = 0),
  reward_votes integer NOT NULL DEFAULT 3 CHECK (reward_votes = 3),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','redeemed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  CONSTRAINT awards_loyalty_rewards_user_milestone_key UNIQUE (user_id, milestone_votes)
);

CREATE TABLE IF NOT EXISTS public.awards_loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL UNIQUE REFERENCES public.awards_loyalty_rewards(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id),
  nominee_id uuid NOT NULL REFERENCES public.nominees(id),
  quantity integer NOT NULL DEFAULT 3 CHECK (quantity = 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS awards_loyalty_rewards_user_status_idx
  ON public.awards_loyalty_rewards(user_id, status, milestone_votes);
CREATE INDEX IF NOT EXISTS awards_loyalty_redemptions_user_created_idx
  ON public.awards_loyalty_redemptions(user_id, created_at DESC);

ALTER TABLE public.awards_loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awards_loyalty_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own loyalty rewards" ON public.awards_loyalty_rewards;
CREATE POLICY "members read own loyalty rewards"
ON public.awards_loyalty_rewards FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "members read own loyalty redemptions" ON public.awards_loyalty_redemptions;
CREATE POLICY "members read own loyalty redemptions"
ON public.awards_loyalty_redemptions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.awards_loyalty_rewards FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.awards_loyalty_redemptions FROM anon, authenticated;
GRANT SELECT ON public.awards_loyalty_rewards, public.awards_loyalty_redemptions TO authenticated;

CREATE OR REPLACE FUNCTION public.awards_issue_loyalty_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  approved_total bigint;
  milestone integer;
BEGIN
  IF NEW.status <> 'approved' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(v.quantity), 0)
    INTO approved_total
  FROM public.vote_submissions v
  WHERE v.user_id = NEW.user_id
    AND v.status = 'approved';

  IF approved_total >= 30 THEN
    FOR milestone IN
      SELECT generate_series(30, (approved_total / 30)::integer * 30, 30)
    LOOP
      INSERT INTO public.awards_loyalty_rewards(user_id, milestone_votes)
      VALUES (NEW.user_id, milestone)
      ON CONFLICT (user_id, milestone_votes) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS awards_issue_loyalty_rewards_trigger ON public.vote_submissions;
CREATE TRIGGER awards_issue_loyalty_rewards_trigger
AFTER INSERT OR UPDATE OF status, user_id, quantity
ON public.vote_submissions
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.awards_issue_loyalty_rewards();

-- Backfill rewards for members whose already-approved account-linked votes
-- have reached one or more 30-vote milestones.
INSERT INTO public.awards_loyalty_rewards(user_id, milestone_votes)
SELECT totals.user_id, milestones.milestone_votes
FROM (
  SELECT user_id, SUM(quantity)::bigint AS approved_total
  FROM public.vote_submissions
  WHERE status = 'approved' AND user_id IS NOT NULL
  GROUP BY user_id
) AS totals
CROSS JOIN LATERAL (
  SELECT generate_series(30, (totals.approved_total / 30)::integer * 30, 30) AS milestone_votes
) AS milestones
ON CONFLICT (user_id, milestone_votes) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_loyalty_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  member_id uuid := auth.uid();
  approved_total bigint;
  available_count integer;
  redeemed_count integer;
BEGIN
  IF member_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO approved_total
  FROM public.vote_submissions
  WHERE user_id = member_id AND status = 'approved';

  SELECT COUNT(*) FILTER (WHERE status = 'available'),
         COUNT(*) FILTER (WHERE status = 'redeemed')
    INTO available_count, redeemed_count
  FROM public.awards_loyalty_rewards
  WHERE user_id = member_id;

  RETURN jsonb_build_object(
    'approved_votes', approved_total,
    'available_rewards', COALESCE(available_count, 0),
    'redeemed_rewards', COALESCE(redeemed_count, 0),
    'next_milestone', ((approved_total / 30) + 1) * 30,
    'progress_in_cycle', approved_total % 30
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_my_loyalty_reward(
  p_reward_id uuid,
  p_category_id uuid,
  p_nominee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  member_id uuid := auth.uid();
  reward_row public.awards_loyalty_rewards%ROWTYPE;
BEGIN
  IF member_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO reward_row
  FROM public.awards_loyalty_rewards
  WHERE id = p_reward_id AND user_id = member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;

  IF reward_row.status <> 'available' THEN
    RAISE EXCEPTION 'This voucher has already been redeemed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.nominees n
    JOIN public.categories c ON c.id = n.category_id
    WHERE n.id = p_nominee_id
      AND n.category_id = p_category_id
      AND n.is_active = true
      AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'Select an active nominee and category';
  END IF;

  INSERT INTO public.awards_loyalty_redemptions
    (reward_id, user_id, category_id, nominee_id, quantity)
  VALUES
    (reward_row.id, member_id, p_category_id, p_nominee_id, 3);

  UPDATE public.awards_loyalty_rewards
  SET status = 'redeemed', redeemed_at = now()
  WHERE id = reward_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'free_votes', 3,
    'redemption_id', (SELECT id FROM public.awards_loyalty_redemptions WHERE reward_id = reward_row.id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_loyalty_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_status() TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_my_loyalty_reward(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_my_loyalty_reward(uuid, uuid, uuid) TO authenticated;

-- Include redeemed free votes in the public nominee totals without altering paid submissions.
CREATE OR REPLACE VIEW public.approved_vote_totals AS
SELECT nominee_id, SUM(vote_count)::bigint AS vote_count
FROM (
  SELECT nominee_id, SUM(quantity)::bigint AS vote_count
  FROM public.vote_submissions
  WHERE status = 'approved'
  GROUP BY nominee_id
  UNION ALL
  SELECT nominee_id, SUM(quantity)::bigint AS vote_count
  FROM public.awards_loyalty_redemptions
  GROUP BY nominee_id
) AS all_votes
GROUP BY nominee_id;

GRANT SELECT ON public.approved_vote_totals TO anon, authenticated;

COMMIT;
