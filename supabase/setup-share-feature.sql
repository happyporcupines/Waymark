-- =============================================================
-- Waymark – Share Story Feature – Database Setup
-- Run this entire script in the Supabase SQL Editor once.
-- =============================================================

-- 1. Add new columns to the existing stories table
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS is_public    BOOLEAN          DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS description  TEXT             DEFAULT '',
  ADD COLUMN IF NOT EXISTS center_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS center_lon   DOUBLE PRECISION;

-- 2. Profiles table (display names shown in the Gallery)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "profiles_public_read"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "profiles_own_write"
  ON public.profiles FOR ALL USING (user_id = auth.uid());

-- 3. Story-shares table (tracks per-email sharing)
CREATE TABLE IF NOT EXISTS public.story_shares (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id            INTEGER     NOT NULL,
  owner_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email   TEXT        NOT NULL,
  shared_with_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (story_id, shared_with_email)
);
ALTER TABLE public.story_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "story_shares_owner_all"
  ON public.story_shares FOR ALL USING (owner_id = auth.uid());

CREATE POLICY IF NOT EXISTS "story_shares_recipient_read"
  ON public.story_shares FOR SELECT USING (shared_with_user_id = auth.uid());

-- 4. Update stories RLS so public + shared stories are readable
--    Drop the old blanket policy first (name may differ – adjust if needed).
DROP POLICY IF EXISTS "Users can manage own stories"   ON public.stories;
DROP POLICY IF EXISTS "stories_owner_all"              ON public.stories;

CREATE POLICY IF NOT EXISTS "stories_select"
  ON public.stories FOR SELECT USING (
    user_id = auth.uid()
    OR is_public = TRUE
    OR EXISTS (
      SELECT 1 FROM public.story_shares
      WHERE story_shares.story_id = stories.id
        AND story_shares.shared_with_user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "stories_insert"
  ON public.stories FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "stories_update"
  ON public.stories FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "stories_delete"
  ON public.stories FOR DELETE USING (user_id = auth.uid());

-- 5. Helper function so the frontend can resolve email → user UUID
--    (SECURITY DEFINER lets it query auth.users safely)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_to_find TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = email_to_find LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;
