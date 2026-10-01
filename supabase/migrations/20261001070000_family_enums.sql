-- Phase 7 (part 1): new enum values. Kept in their own migration because a
-- value added with ALTER TYPE ... ADD VALUE can't be used in the transaction
-- that adds it.

-- Shared family / couple workspace (one per owner, created on demand).
alter type public.workspace_type add value if not exists 'FAMILY';

-- "Member X recorded an expense" alerts for the other members.
alter type public.notification_type add value if not exists 'ACTIVITY';
