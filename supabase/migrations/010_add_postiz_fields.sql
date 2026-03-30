-- Add Postiz publish tracking fields to content_calendar
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS postiz_post_id TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

-- Extend status enum to include posted and scheduled states
ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status = ANY (ARRAY[
    'suggested','approved','rejected','assigned','draft',
    'pending_review','published','ready','completed',
    'posted','scheduled'
  ]));
