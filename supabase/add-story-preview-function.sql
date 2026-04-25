-- =============================================================
-- Waymark – Story Preview Helper Function
-- Run this in the Supabase SQL Editor after setup-share-feature.sql
-- =============================================================

-- Returns entry coordinates for any story the current user is allowed
-- to view (public OR shared with them).  SECURITY DEFINER lets it read
-- entries that belong to another user without relaxing general RLS.
CREATE OR REPLACE FUNCTION public.get_story_preview_entries(
  p_story_id INTEGER,
  p_owner_id UUID
)
RETURNS TABLE(
  entry_id  INTEGER,
  lat       DOUBLE PRECISION,
  lon       DOUBLE PRECISION,
  title     TEXT,
  line_color TEXT,
  story_title TEXT
) AS $$
DECLARE
  v_user_id   UUID;
  v_is_public BOOLEAN;
  v_line_color TEXT;
  v_title     TEXT;
BEGIN
  SELECT s.user_id, s.is_public, s.line_color, s.title
  INTO v_user_id, v_is_public, v_line_color, v_title
  FROM public.stories s
  WHERE s.story_id = p_story_id
    AND s.user_id = p_owner_id;

  -- Access check: own story OR public story OR explicitly shared with caller
  IF NOT (
    v_user_id = auth.uid()
    OR
    v_is_public
    OR EXISTS (
      SELECT 1 FROM public.story_shares ss
      WHERE ss.story_id = p_story_id
        AND ss.owner_id = p_owner_id
        AND ss.shared_with_user_id = auth.uid()
    )
  ) THEN
    RETURN;  -- empty result – caller has no access
  END IF;

  RETURN QUERY
  SELECT
    e.entry_id,
    e.lat,
    e.lon,
    e.title,
    v_line_color,
    v_title
  FROM public.entries e
  JOIN public.stories s
    ON s.user_id = e.user_id
   AND s.story_id = p_story_id
   AND s.user_id = p_owner_id
  WHERE s.entry_ids @> jsonb_build_array(e.entry_id)
  ORDER BY e.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
