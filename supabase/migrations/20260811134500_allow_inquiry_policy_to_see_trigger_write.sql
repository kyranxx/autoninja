-- The participant predicate must see the conversation inserted by the
-- first-message BEFORE trigger during the same statement. VOLATILE SQL
-- functions take the command snapshots required for that same-statement write;
-- STABLE functions retain the statement-start snapshot and miss the row.

ALTER FUNCTION public.can_send_inquiry_message(UUID, UUID, UUID, UUID) VOLATILE;
