-- PostgreSQL can evaluate the RLS WITH CHECK expression using the original
-- first-message values even though the compatibility trigger supplies the
-- conversation ID in the same statement. Permit only that null-conversation
-- first-contact shape, bound to the listing's real seller; established replies
-- remain bound to the exact durable conversation tuple.

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
