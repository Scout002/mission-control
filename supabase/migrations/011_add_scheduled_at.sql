-- Add scheduled_at to preserve the source-of-truth timestamp for scheduled posts.
-- posted_at = when immediately-published posts went live.
-- scheduled_at = when scheduled posts are set to publish (persisted at approval time).
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
