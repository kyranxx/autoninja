-- Keep high-volume product telemetry out of operational system_logs.
-- system_logs is for diagnostic events; analytics and web-vitals have their own
-- retention rules so routine visitor traffic cannot crowd out real errors.

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS market_code text
    CHECK (market_code IN ('SK', 'RO')),
  ADD COLUMN IF NOT EXISTS distinct_id text;

CREATE INDEX IF NOT EXISTS idx_analytics_events_market_event_created_at
  ON public.analytics_events (market_code, event_name, created_at DESC);

-- Preserve first-party browser analytics already captured in system_logs before
-- the ingestion route starts writing directly to analytics_events.
INSERT INTO public.analytics_events (
  event_name,
  payload,
  page_path,
  page_url,
  page_title,
  referrer,
  market_code,
  distinct_id,
  created_at
)
SELECT
  metadata->>'eventName',
  COALESCE(metadata->'payload', '{}'::jsonb),
  metadata->>'pagePath',
  metadata->>'pageUrl',
  metadata->>'pageTitle',
  metadata->>'referrer',
  CASE
    WHEN metadata->>'marketCode' IN ('SK', 'RO') THEN metadata->>'marketCode'
    ELSE NULL
  END,
  metadata->>'distinctId',
  created_at
FROM public.system_logs
WHERE message = 'analytics_event'
  AND jsonb_typeof(metadata) = 'object'
  AND NULLIF(metadata->>'eventName', '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.web_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code text NOT NULL CHECK (market_code IN ('SK', 'RO')),
  metric_name text NOT NULL CHECK (metric_name IN ('INP', 'LCP', 'TTFB')),
  metric_value numeric NOT NULL CHECK (metric_value >= 0),
  route text NOT NULL,
  rating text CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  metric_id text,
  metric_delta numeric,
  navigation_type text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view web vitals" ON public.web_vitals;
CREATE POLICY "Admins can view web vitals"
ON public.web_vitals
FOR SELECT
TO authenticated
USING ((SELECT public.is_current_user_site_admin()));

CREATE INDEX IF NOT EXISTS idx_web_vitals_created_at
  ON public.web_vitals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_vitals_market_metric_created_at
  ON public.web_vitals (market_code, metric_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.cleanup_telemetry_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_analytics integer := 0;
  deleted_web_vitals integer := 0;
BEGIN
  DELETE FROM public.analytics_events
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted_analytics = ROW_COUNT;

  DELETE FROM public.web_vitals
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_web_vitals = ROW_COUNT;

  RETURN jsonb_build_object(
    'analytics_events', deleted_analytics,
    'web_vitals', deleted_web_vitals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_telemetry_retention() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_telemetry_retention() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_telemetry_retention() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_telemetry_retention() TO service_role;

-- Keep the narrowly-scoped inquiry helpers out of the Data API schema. The
-- public display-name wrapper remains callable by signed-in participants, but
-- it is an invoker wrapper around a private privileged helper. The membership
-- predicate is referenced only by the INSERT policy and has no RPC endpoint.
CREATE OR REPLACE FUNCTION private.can_send_inquiry_message(
  p_conversation_id uuid,
  p_ad_id uuid,
  p_sender_id uuid,
  p_recipient_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_sender_id = (SELECT auth.uid())
    AND (
      (
        p_conversation_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.ads AS ads
          WHERE ads.id = p_ad_id
            AND ads.seller_id = p_recipient_id
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.inquiry_conversations AS conversations
        WHERE conversations.id = p_conversation_id
          AND conversations.ad_id = p_ad_id
          AND (
            (
              conversations.buyer_id = (SELECT auth.uid())
              AND p_recipient_id = conversations.seller_id
            )
            OR
            (
              conversations.seller_id = (SELECT auth.uid())
              AND p_recipient_id = conversations.buyer_id
            )
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION private.can_send_inquiry_message(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_send_inquiry_message(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Participants can send inquiry messages" ON public.inquiries;
CREATE POLICY "Participants can send inquiry messages"
ON public.inquiries
FOR INSERT
TO authenticated
WITH CHECK (
  private.can_send_inquiry_message(
    conversation_id,
    ad_id,
    sender_id,
    recipient_id
  )
);

DROP FUNCTION public.can_send_inquiry_message(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION private.get_inquiry_participant_profiles()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH participant_ids AS (
    SELECT CASE
      WHEN conversations.buyer_id = (SELECT auth.uid())
        THEN conversations.seller_id
      ELSE conversations.buyer_id
    END AS id
    FROM public.inquiry_conversations AS conversations
    WHERE conversations.buyer_id = (SELECT auth.uid())
       OR conversations.seller_id = (SELECT auth.uid())

    UNION

    SELECT auth.uid()
    WHERE auth.uid() IS NOT NULL
  )
  SELECT profiles.id, profiles.full_name
  FROM public.profiles AS profiles
  JOIN participant_ids ON participant_ids.id = profiles.id;
$$;

REVOKE ALL ON FUNCTION private.get_inquiry_participant_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_inquiry_participant_profiles()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_inquiry_participant_profiles()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.get_inquiry_participant_profiles();
$$;

REVOKE ALL ON FUNCTION public.get_inquiry_participant_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inquiry_participant_profiles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inquiry_participant_profiles()
  TO authenticated, service_role;
