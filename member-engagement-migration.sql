-- MS TikTok PALOP Awards 2026: member notifications and achievement badges
-- Run once in Supabase SQL Editor after the loyalty scheme migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.awards_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('badge','reward','announcement')),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT awards_notifications_user_key UNIQUE (user_id, notification_key)
);

CREATE TABLE IF NOT EXISTS public.awards_member_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_code text NOT NULL CHECK (badge_code IN ('first_vote','supporter_10','fan_30','champion_50','legend_100','category_explorer')),
  earned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT awards_member_badges_user_badge_key UNIQUE (user_id, badge_code)
);

CREATE INDEX IF NOT EXISTS awards_notifications_user_created_idx
  ON public.awards_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS awards_member_badges_user_idx
  ON public.awards_member_badges(user_id, earned_at);

ALTER TABLE public.awards_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awards_member_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own notifications" ON public.awards_notifications;
CREATE POLICY "members read own notifications"
ON public.awards_notifications FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "members mark own notifications read" ON public.awards_notifications;
CREATE POLICY "members mark own notifications read"
ON public.awards_notifications FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "members read own badges" ON public.awards_member_badges;
CREATE POLICY "members read own badges"
ON public.awards_member_badges FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, DELETE ON public.awards_notifications FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.awards_member_badges FROM anon, authenticated;
GRANT SELECT ON public.awards_notifications, public.awards_member_badges TO authenticated;
GRANT UPDATE (is_read) ON public.awards_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.awards_record_member_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  member_id uuid;
  approved_total bigint;
  category_total integer;
  badge record;
BEGIN
  member_id := NEW.user_id;
  IF member_id IS NULL OR NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0), COUNT(DISTINCT category_id)
    INTO approved_total, category_total
  FROM public.vote_submissions
  WHERE user_id = member_id AND status = 'approved';

  FOR badge IN
    SELECT * FROM (VALUES
      ('first_vote', 1::bigint, 0::integer, 'Primeiro Apoio', 'O teu primeiro voto foi aprovado. A tua jornada começou!'),
      ('supporter_10', 10::bigint, 0::integer, 'Fã de Carteirinha', 'Atingiste 10 votos aprovados. Obrigado pelo apoio!'),
      ('fan_30', 30::bigint, 0::integer, 'Super Fã', 'Atingiste 30 votos aprovados. Conquista desbloqueada!'),
      ('champion_50', 50::bigint, 0::integer, 'Campeão', 'Atingiste 50 votos aprovados. O teu apoio faz a diferença!'),
      ('legend_100', 100::bigint, 0::integer, 'Lenda PALOP', 'Atingiste 100 votos aprovados. És uma lenda!'),
      ('category_explorer', 0::bigint, 3::integer, 'Explorador PALOP', 'Apoiaste nomeados em 3 categorias diferentes!')
    ) AS b(code, vote_threshold, category_threshold, badge_title, badge_message)
    WHERE approved_total >= b.vote_threshold AND category_total >= b.category_threshold
  LOOP
    INSERT INTO public.awards_member_badges(user_id, badge_code)
    VALUES (member_id, badge.code)
    ON CONFLICT (user_id, badge_code) DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.awards_notifications(user_id, notification_key, notification_type, title, message)
      VALUES (member_id, 'badge:' || badge.code, 'badge', 'Novo badge desbloqueado: ' || badge.badge_title, badge.badge_message)
      ON CONFLICT (user_id, notification_key) DO NOTHING;
    END IF;
  END LOOP;

  -- A 30-vote milestone also creates an in-site alert for each loyalty voucher.
  IF approved_total >= 30 THEN
    INSERT INTO public.awards_notifications(user_id, notification_key, notification_type, title, message)
    SELECT member_id, 'reward:' || milestone_votes::text, 'reward',
           'Ganhaste 3 votos grátis!', 'Atingiste ' || milestone_votes::text || ' votos aprovados. Entra na tua conta e resgata o teu voucher.'
    FROM generate_series(30, (approved_total / 30)::integer * 30, 30) AS milestones(milestone_votes)
    ON CONFLICT (user_id, notification_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS awards_record_member_engagement_trigger ON public.vote_submissions;
CREATE TRIGGER awards_record_member_engagement_trigger
AFTER INSERT OR UPDATE OF status, user_id, quantity, category_id
ON public.vote_submissions
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.awards_record_member_engagement();

-- Backfill badges and alerts for already-approved member activity.
DO $backfill$
DECLARE
  member record;
  badge record;
BEGIN
  FOR member IN
    SELECT user_id, SUM(quantity)::bigint AS approved_total, COUNT(DISTINCT category_id)::integer AS category_total
    FROM public.vote_submissions
    WHERE status = 'approved' AND user_id IS NOT NULL
    GROUP BY user_id
  LOOP
    FOR badge IN
      SELECT * FROM (VALUES
        ('first_vote', 1::bigint, 0::integer, 'Primeiro Apoio', 'O teu primeiro voto foi aprovado. A tua jornada começou!'),
        ('supporter_10', 10::bigint, 0::integer, 'Fã de Carteirinha', 'Atingiste 10 votos aprovados. Obrigado pelo apoio!'),
        ('fan_30', 30::bigint, 0::integer, 'Super Fã', 'Atingiste 30 votos aprovados. Conquista desbloqueada!'),
        ('champion_50', 50::bigint, 0::integer, 'Campeão', 'Atingiste 50 votos aprovados. O teu apoio faz a diferença!'),
        ('legend_100', 100::bigint, 0::integer, 'Lenda PALOP', 'Atingiste 100 votos aprovados. És uma lenda!'),
        ('category_explorer', 0::bigint, 3::integer, 'Explorador PALOP', 'Apoiaste nomeados em 3 categorias diferentes!')
      ) AS b(code, vote_threshold, category_threshold, badge_title, badge_message)
      WHERE member.approved_total >= b.vote_threshold AND member.category_total >= b.category_threshold
    LOOP
      INSERT INTO public.awards_member_badges(user_id, badge_code)
      VALUES (member.user_id, badge.code)
      ON CONFLICT (user_id, badge_code) DO NOTHING;
      IF FOUND THEN
        INSERT INTO public.awards_notifications(user_id, notification_key, notification_type, title, message)
        VALUES (member.user_id, 'badge:' || badge.code, 'badge', 'Novo badge desbloqueado: ' || badge.badge_title, badge.badge_message)
        ON CONFLICT (user_id, notification_key) DO NOTHING;
      END IF;
    END LOOP;

    IF member.approved_total >= 30 THEN
      INSERT INTO public.awards_notifications(user_id, notification_key, notification_type, title, message)
      SELECT member.user_id, 'reward:' || milestone_votes::text, 'reward',
             'Ganhaste 3 votos grátis!', 'Atingiste ' || milestone_votes::text || ' votos aprovados. Entra na tua conta e resgata o teu voucher.'
      FROM generate_series(30, (member.approved_total / 30)::integer * 30, 30) AS milestones(milestone_votes)
      ON CONFLICT (user_id, notification_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$backfill$;

COMMIT;
