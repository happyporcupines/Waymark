-- =============================================================
-- Waymark – Story Preview Helper Function
-- Run this in the Supabase SQL Editor after setup-share-feature.sql
-- =============================================================

-- Returns entry coordinates for any story the current user is allowed
-- to view (public OR shared with them). SECURITY DEFINER lets it read
-- entries that belong to another user without relaxing general RLS.
DROP FUNCTION IF EXISTS public.get_story_preview_entries(INTEGER, UUID);

CREATE FUNCTION public.get_story_preview_entries(
  p_story_id INTEGER,
  p_owner_id UUID
)
RETURNS TABLE(
  entry_id INTEGER,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  title TEXT,
  line_color TEXT,
  story_title TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH story AS (
    SELECT s.user_id, s.is_public, s.line_color, s.title, s.entry_ids
    FROM public.stories s
    WHERE s.story_id = p_story_id
      AND s.user_id = p_owner_id
    LIMIT 1
  ),
  access_check AS (
    SELECT 1
    FROM story s
    WHERE
      s.user_id = auth.uid()
      OR s.is_public = true
      OR EXISTS (
        SELECT 1
        FROM public.story_shares ss
        WHERE ss.story_id = p_story_id
          AND ss.owner_id = p_owner_id
          AND (
            ss.shared_with_user_id = auth.uid()
            OR lower(ss.shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
  )
  SELECT
    e.entry_id,
    e.lat,
    e.lon,
    e.title,
    s.line_color,
    s.title AS story_title
  FROM story s
  JOIN public.entries e ON e.user_id = s.user_id
  WHERE EXISTS (SELECT 1 FROM access_check)
    AND s.entry_ids @> to_jsonb(e.entry_id)
  ORDER BY e.created_at_ms ASC;
$$;

-- Grant execute to both roles so PostgREST exposes the function
GRANT EXECUTE ON FUNCTION public.get_story_preview_entries(INTEGER, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_story_preview_entries(INTEGER, UUID) TO authenticated;

-- Reload PostgREST schema cache so the function becomes immediately available
NOTIFY pgrst, 'reload schema';
