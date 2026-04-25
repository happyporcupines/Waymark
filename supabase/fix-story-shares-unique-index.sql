-- =============================================================
-- Waymark – Fix story_shares uniqueness scope
-- Run this once in Supabase SQL Editor for existing projects.
-- =============================================================

-- 1) Remove old uniqueness that could collide across different owners.
ALTER TABLE public.story_shares
  DROP CONSTRAINT IF EXISTS story_shares_story_id_shared_with_email_key;

-- 2) Add correct uniqueness by owner+story+recipient.
ALTER TABLE public.story_shares
  ADD CONSTRAINT story_shares_owner_story_email_key
  UNIQUE (owner_id, story_id, shared_with_email);
