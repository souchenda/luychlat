-- Fix (19/10/2026): the bot reaches the database as the anon role, its key checked inside each bot_* function
-- (public.require_bot). 20270178 and 20270180 revoked execute from anon on three bot functions, so the bot was
-- refused: /setapprovalgroup answered «មិនអាចរក្សាទុកបានទេ» in «LCA Approval», and the Islamic places seed failed
-- with «permission denied for function bot_islamic_places_sync». Granted as every bot_* function the server calls
-- (tests/golden/publisher.test.ts now checks each one the code calls).

grant execute on function public.bot_approval_chat(text) to anon, authenticated;
grant execute on function public.bot_set_approval_chat(text, bigint, bigint) to anon, authenticated;
grant execute on function public.bot_islamic_places_sync(text, jsonb) to anon, authenticated;
