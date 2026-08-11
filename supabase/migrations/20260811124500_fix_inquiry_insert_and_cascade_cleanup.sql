-- Repair two live defects found by the distinct buyer/seller RLS proof:
-- 1. the first message's newly created conversation could be hidden by the
--    nested conversation RLS pass inside the inquiry INSERT policy;
-- 2. the legacy DELETE-to-archive trigger could block privileged FK cascades
--    used when an account or listing is genuinely removed.

CREATE OR REPLACE FUNCTION public.can_send_inquiry_message(
  p_conversation_id UUID,
  p_ad_id UUID,
  p_sender_id UUID,
  p_recipient_id UUID
)
RETURNS BOOLEAN
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

REVOKE ALL ON FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID)
TO authenticated, service_role;

DROP POLICY IF EXISTS "Participants can send inquiry messages" ON public.inquiries;
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

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.archive_legacy_inquiry_delete() FROM PUBLIC;
