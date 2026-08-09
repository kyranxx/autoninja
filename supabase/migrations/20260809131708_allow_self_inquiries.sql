-- Self-messages are useful for sellers verifying their live listing contact flow.
-- The API still restricts normal buyers to the listing seller and seller replies
-- to existing conversations, while this policy keeps sender ownership enforced.

DROP POLICY IF EXISTS "Users can send inquiries" ON public.inquiries;

CREATE POLICY "Users can send inquiries"
ON public.inquiries
FOR INSERT
TO authenticated
WITH CHECK (sender_id = (SELECT auth.uid()));
