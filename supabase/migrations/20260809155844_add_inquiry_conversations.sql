-- Introduce durable inquiry threads while keeping public.inquiries as the
-- backwards-compatible message table. Existing inquiry rows are grouped by
-- listing, buyer, and seller before conversation_id becomes required.

CREATE TABLE public.inquiry_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  buyer_archived_at TIMESTAMPTZ,
  seller_archived_at TIMESTAMPTZ,
  is_qualified BOOLEAN NOT NULL DEFAULT FALSE,
  qualified_at TIMESTAMPTZ,
  qualified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT inquiry_conversations_participants_unique
    UNIQUE (ad_id, buyer_id, seller_id),
  CONSTRAINT inquiry_conversations_qualification_consistency CHECK (
    (
      is_qualified = FALSE
      AND qualified_at IS NULL
      AND qualified_by IS NULL
    )
    OR
    (
      is_qualified = TRUE
      AND qualified_at IS NOT NULL
    )
  )
);

ALTER TABLE public.inquiry_conversations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inquiry_conversations FROM anon;
REVOKE ALL ON TABLE public.inquiry_conversations FROM authenticated;
GRANT SELECT ON TABLE public.inquiry_conversations TO authenticated;
GRANT ALL ON TABLE public.inquiry_conversations TO service_role;

CREATE POLICY "Participants can view inquiry conversations"
ON public.inquiry_conversations
FOR SELECT
TO authenticated
USING (
  buyer_id = (SELECT auth.uid())
  OR seller_id = (SELECT auth.uid())
);

ALTER TABLE public.inquiries
ADD COLUMN conversation_id UUID REFERENCES public.inquiry_conversations(id) ON DELETE CASCADE;

WITH resolved_inquiries AS (
  SELECT
    inquiries.ad_id,
    ads.seller_id,
    CASE
      WHEN inquiries.sender_id <> ads.seller_id THEN inquiries.sender_id
      WHEN inquiries.recipient_id <> ads.seller_id THEN inquiries.recipient_id
      ELSE ads.seller_id
    END AS buyer_id,
    inquiries.created_at,
    inquiries.is_qualified,
    inquiries.qualified_at,
    inquiries.qualified_by
  FROM public.inquiries AS inquiries
  JOIN public.ads AS ads ON ads.id = inquiries.ad_id
), grouped_inquiries AS (
  SELECT
    ad_id,
    buyer_id,
    seller_id,
    MIN(created_at) AS created_at,
    MAX(created_at) AS last_message_at,
    BOOL_OR(is_qualified) AS is_qualified,
    MAX(qualified_at) FILTER (WHERE is_qualified) AS qualified_at,
    (
      ARRAY_AGG(qualified_by ORDER BY qualified_at DESC NULLS LAST)
      FILTER (WHERE qualified_by IS NOT NULL)
    )[1] AS qualified_by
  FROM resolved_inquiries
  GROUP BY ad_id, buyer_id, seller_id
)
INSERT INTO public.inquiry_conversations (
  ad_id,
  buyer_id,
  seller_id,
  created_at,
  last_message_at,
  is_qualified,
  qualified_at,
  qualified_by
)
SELECT
  ad_id,
  buyer_id,
  seller_id,
  created_at,
  last_message_at,
  is_qualified,
  qualified_at,
  qualified_by
FROM grouped_inquiries;

UPDATE public.inquiries AS inquiries
SET conversation_id = conversations.id
FROM public.ads AS ads,
     public.inquiry_conversations AS conversations
WHERE ads.id = inquiries.ad_id
  AND conversations.ad_id = inquiries.ad_id
  AND conversations.seller_id = ads.seller_id
  AND conversations.buyer_id = CASE
    WHEN inquiries.sender_id <> ads.seller_id THEN inquiries.sender_id
    WHEN inquiries.recipient_id <> ads.seller_id THEN inquiries.recipient_id
    ELSE ads.seller_id
  END;

-- Build or resolve the conversation inside the same transaction as the first
-- message. This also keeps the previous application version compatible while
-- SK and RO are deployed at different times: legacy inserts omit
-- conversation_id and this trigger supplies it before constraints and RLS are
-- checked. Authenticated clients cannot create empty conversation rows directly.
CREATE OR REPLACE FUNCTION private.ensure_inquiry_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listing_seller_id UUID;
  resolved_buyer_id UUID;
  resolved_conversation_id UUID;
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT ads.seller_id
  INTO listing_seller_id
  FROM public.ads AS ads
  WHERE ads.id = NEW.ad_id;

  IF listing_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found for inquiry.';
  END IF;

  IF NEW.sender_id <> listing_seller_id THEN
    resolved_buyer_id := NEW.sender_id;
  ELSIF NEW.recipient_id = listing_seller_id THEN
    -- Preserve the supported seller self-test flow.
    resolved_buyer_id := listing_seller_id;
  ELSE
    -- A seller may reply to an existing buyer thread, but cannot initiate an
    -- unsolicited conversation with an arbitrary account.
    SELECT conversations.id
    INTO resolved_conversation_id
    FROM public.inquiry_conversations AS conversations
    WHERE conversations.ad_id = NEW.ad_id
      AND conversations.buyer_id = NEW.recipient_id
      AND conversations.seller_id = listing_seller_id;

    IF resolved_conversation_id IS NULL THEN
      RAISE EXCEPTION 'Conversation not found for seller reply.';
    END IF;
  END IF;

  IF resolved_conversation_id IS NULL THEN
    INSERT INTO public.inquiry_conversations (ad_id, buyer_id, seller_id)
    VALUES (NEW.ad_id, resolved_buyer_id, listing_seller_id)
    ON CONFLICT (ad_id, buyer_id, seller_id) DO NOTHING
    RETURNING id INTO resolved_conversation_id;

    IF resolved_conversation_id IS NULL THEN
      SELECT conversations.id
      INTO resolved_conversation_id
      FROM public.inquiry_conversations AS conversations
      WHERE conversations.ad_id = NEW.ad_id
        AND conversations.buyer_id = resolved_buyer_id
        AND conversations.seller_id = listing_seller_id;
    END IF;
  END IF;

  NEW.conversation_id := resolved_conversation_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_inquiry_conversation() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_00_ensure_inquiry_conversation ON public.inquiries;
CREATE TRIGGER trg_00_ensure_inquiry_conversation
BEFORE INSERT ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION private.ensure_inquiry_conversation();

ALTER TABLE public.inquiries
ALTER COLUMN conversation_id SET NOT NULL;

CREATE INDEX idx_inquiry_conversations_buyer_last_message
ON public.inquiry_conversations (buyer_id, last_message_at DESC);

CREATE INDEX idx_inquiry_conversations_seller_last_message
ON public.inquiry_conversations (seller_id, last_message_at DESC);

CREATE INDEX idx_inquiry_conversations_qualified_by
ON public.inquiry_conversations (qualified_by)
WHERE qualified_by IS NOT NULL;

CREATE INDEX idx_inquiries_conversation_created_at
ON public.inquiries (conversation_id, created_at ASC);

-- The general public_profiles view intentionally respects the profiles table's
-- owner-only RLS. Messaging needs the other participant's display name, so
-- expose only id/full_name and only for conversations involving auth.uid().
CREATE OR REPLACE FUNCTION public.get_inquiry_participant_profiles()
RETURNS TABLE (id UUID, full_name TEXT)
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

REVOKE ALL ON FUNCTION public.get_inquiry_participant_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inquiry_participant_profiles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inquiry_participant_profiles() TO authenticated, service_role;

-- Evaluate message membership through a narrowly scoped security-definer
-- predicate. A first-message trigger creates the conversation in the same
-- transaction, and this helper can see that row without a second RLS pass on
-- inquiry_conversations hiding it from the outer INSERT policy.
CREATE OR REPLACE FUNCTION public.can_send_inquiry_message(
  p_conversation_id UUID,
  p_ad_id UUID,
  p_sender_id UUID,
  p_recipient_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
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

REVOKE ALL ON FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID)
TO authenticated, service_role;

-- Conversation rows are the qualification source of truth from this point on.
DROP INDEX IF EXISTS public.idx_inquiries_is_qualified_created_at;

DROP POLICY IF EXISTS "Users can send inquiries" ON public.inquiries;
CREATE POLICY "Participants can send inquiry messages"
ON public.inquiries
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_send_inquiry_message(
    conversation_id,
    ad_id,
    sender_id,
    recipient_id
  )
);

-- Keep the previous application version safe during the SK-to-RO staggered
-- rollout. Its direct UPDATE is restricted to status columns and normalized by
-- a trigger; its direct DELETE is converted into a participant-side archive.
DROP POLICY IF EXISTS "Participants can delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Recipients can update inquiry status" ON public.inquiries;
REVOKE UPDATE, DELETE ON TABLE public.inquiries FROM authenticated;
GRANT UPDATE (is_read, is_qualified, qualified_at, qualified_by)
ON TABLE public.inquiries TO authenticated;
GRANT DELETE ON TABLE public.inquiries TO authenticated;

CREATE POLICY "Recipients can update inquiry status"
ON public.inquiries
FOR UPDATE
TO authenticated
USING (recipient_id = (SELECT auth.uid()))
WITH CHECK (recipient_id = (SELECT auth.uid()));

CREATE POLICY "Participants can archive inquiry messages"
ON public.inquiries
FOR DELETE
TO authenticated
USING (
  sender_id = (SELECT auth.uid())
  OR recipient_id = (SELECT auth.uid())
);

CREATE OR REPLACE FUNCTION private.sync_legacy_inquiry_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := auth.role();
  conversation_seller_id UUID;
BEGIN
  IF NEW.is_read IS DISTINCT FROM OLD.is_read
     AND actor_role IS DISTINCT FROM 'service_role'
     AND actor_id IS DISTINCT FROM OLD.recipient_id THEN
    RAISE EXCEPTION 'Only the recipient can change read status.';
  END IF;

  IF NEW.is_qualified IS DISTINCT FROM OLD.is_qualified
     OR NEW.qualified_at IS DISTINCT FROM OLD.qualified_at
     OR NEW.qualified_by IS DISTINCT FROM OLD.qualified_by THEN
    SELECT conversations.seller_id
    INTO conversation_seller_id
    FROM public.inquiry_conversations AS conversations
    WHERE conversations.id = OLD.conversation_id;

    IF actor_role IS DISTINCT FROM 'service_role'
       AND actor_id IS DISTINCT FROM conversation_seller_id THEN
      RAISE EXCEPTION 'Only the listing seller can change qualification.';
    END IF;

    IF NEW.is_qualified AND actor_role IS DISTINCT FROM 'service_role' THEN
      NEW.qualified_at := NOW();
      NEW.qualified_by := actor_id;
    ELSIF NOT NEW.is_qualified THEN
      NEW.qualified_at := NULL;
      NEW.qualified_by := NULL;
    END IF;

    UPDATE public.inquiry_conversations
    SET
      is_qualified = NEW.is_qualified,
      qualified_at = NEW.qualified_at,
      qualified_by = NEW.qualified_by
    WHERE id = OLD.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_legacy_inquiry_status_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_legacy_inquiry_status_update ON public.inquiries;
CREATE TRIGGER trg_sync_legacy_inquiry_status_update
BEFORE UPDATE OF is_read, is_qualified, qualified_at, qualified_by
ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION private.sync_legacy_inquiry_status_update();

CREATE OR REPLACE FUNCTION private.archive_legacy_inquiry_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := auth.role();
  conversation_buyer_id UUID;
  conversation_seller_id UUID;
BEGIN
  -- Privileged cleanup and foreign-key cascades must still be able to erase
  -- their dependent rows. Interactive authenticated DELETE remains an archive.
  IF actor_role = 'service_role'
     OR actor_id IS NULL
     OR pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  SELECT conversations.buyer_id, conversations.seller_id
  INTO conversation_buyer_id, conversation_seller_id
  FROM public.inquiry_conversations AS conversations
  WHERE conversations.id = OLD.conversation_id;

  IF actor_id IS DISTINCT FROM conversation_buyer_id
     AND actor_id IS DISTINCT FROM conversation_seller_id THEN
    RAISE EXCEPTION 'Only a conversation participant can archive it.';
  END IF;

  UPDATE public.inquiry_conversations
  SET
    buyer_archived_at = CASE
      WHEN actor_id = conversation_buyer_id THEN NOW()
      ELSE buyer_archived_at
    END,
    seller_archived_at = CASE
      WHEN actor_id = conversation_seller_id THEN NOW()
      ELSE seller_archived_at
    END
  WHERE id = OLD.conversation_id;

  -- Return NULL so the legacy DELETE reports success without erasing history.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.archive_legacy_inquiry_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_archive_legacy_inquiry_delete ON public.inquiries;
CREATE TRIGGER trg_archive_legacy_inquiry_delete
BEFORE DELETE ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION private.archive_legacy_inquiry_delete();

CREATE OR REPLACE FUNCTION private.touch_inquiry_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.inquiry_conversations
  SET
    last_message_at = NEW.created_at,
    buyer_archived_at = NULL,
    seller_archived_at = NULL
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.touch_inquiry_conversation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.touch_inquiry_conversation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_touch_inquiry_conversation ON public.inquiries;
CREATE TRIGGER trg_touch_inquiry_conversation
AFTER INSERT ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION private.touch_inquiry_conversation();

-- Initial inquiries and established replies have separate limits. This keeps
-- the public contact form strict without making an ordinary two-way exchange
-- unusable after three messages.
CREATE OR REPLACE FUNCTION public.enforce_inquiry_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  existing_message_count INTEGER;
  recent_initial_thread_count INTEGER;
  recent_reply_count INTEGER;
  hourly_reply_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO existing_message_count
  FROM public.inquiries
  WHERE conversation_id = NEW.conversation_id;

  IF existing_message_count = 0 THEN
    SELECT COUNT(*)
    INTO recent_initial_thread_count
    FROM public.inquiry_conversations
    WHERE buyer_id = NEW.sender_id
      AND created_at >= (NOW() - INTERVAL '10 minutes');

    IF recent_initial_thread_count > 3 THEN
      RAISE EXCEPTION 'Prilis vela novych dopytov za kratky cas. Skuste to znova o par minut.';
    END IF;
  ELSE
    SELECT COUNT(*)
    INTO recent_reply_count
    FROM public.inquiries
    WHERE conversation_id = NEW.conversation_id
      AND sender_id = NEW.sender_id
      AND created_at >= (NOW() - INTERVAL '1 minute');

    SELECT COUNT(*)
    INTO hourly_reply_count
    FROM public.inquiries
    WHERE conversation_id = NEW.conversation_id
      AND sender_id = NEW.sender_id
      AND created_at >= (NOW() - INTERVAL '1 hour');

    IF recent_reply_count >= 10 OR hourly_reply_count >= 60 THEN
      RAISE EXCEPTION 'Prilis vela odpovedi za kratky cas. Skuste to znova neskor.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_inquiry_rate_limit ON public.inquiries;
CREATE TRIGGER trg_enforce_inquiry_rate_limit
BEFORE INSERT ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inquiry_rate_limit();
