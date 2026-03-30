// Approval handler — single authority for Mission Control → Postiz publish pipeline.
//
// Trigger: POST /api/content-calendar/approve
// Does NOT listen to Discord. Discord is informational only.
// Errors are thrown to the caller — never swallowed silently.

import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { publishToPostiz } from '@/lib/postiz-publisher'

// Scout Instagram integration ID — from discord-bot.json postizInstagramIntegrationId
const SCOUT_CHANNEL_ID = 'cmmnp5zzx05g3qn0y727qbpd6'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface ApprovalInput {
  content_calendar_id: string
  title: string
  output: string            // final copy (draft_content)
  asset_url?: string | null
  publish_date?: string | null  // date string or ISO timestamp
  postiz_post_id?: string | null  // idempotency — present if already published
}

export interface ApprovalResult {
  postiz_post_id: string
  mode: 'publish_now' | 'schedule'
  status: 'posted' | 'scheduled'
}

// Normalise date-only strings to ISO timestamp (9 AM UTC).
// Returns undefined if the date is in the past or not provided → publish now.
function resolvePublishAt(publishDate: string | null | undefined): string | undefined {
  if (!publishDate) return undefined
  const ts = publishDate.includes('T') ? publishDate : `${publishDate}T09:00:00Z`
  return new Date(ts) > new Date() ? ts : undefined
}

export async function onContentApproved(input: ApprovalInput): Promise<ApprovalResult> {
  logger.info({ content_calendar_id: input.content_calendar_id }, 'MC_APPROVAL_RECEIVED')

  // Idempotency guard — prevent double-posts on re-approve or accidental retry
  if (input.postiz_post_id) {
    logger.warn({ content_calendar_id: input.content_calendar_id, postiz_post_id: input.postiz_post_id }, 'POSTIZ_ALREADY_PUBLISHED')
    throw new Error(`Already published to Postiz (post ID: ${input.postiz_post_id}). Reset postiz_post_id to republish.`)
  }

  const publishAt = resolvePublishAt(input.publish_date)
  const mode: 'publish_now' | 'schedule' = publishAt ? 'schedule' : 'publish_now'

  logger.info({ mode, content_calendar_id: input.content_calendar_id }, 'POSTIZ_PUBLISH_START')

  let publishResult: { postId: string; mode: 'publish_now' | 'schedule' }
  try {
    publishResult = await publishToPostiz({
      content: input.output,
      integrationId: SCOUT_CHANNEL_ID,
      assetUrl: input.asset_url ?? undefined,
      publishAt,
    })
  } catch (err) {
    logger.error({ err, content_calendar_id: input.content_calendar_id }, 'POSTIZ_PUBLISH_FAILED')
    throw err  // surface to UI — do NOT swallow
  }

  logger.info({ postiz_post_id: publishResult.postId }, 'POSTIZ_PUBLISH_SUCCESS')

  const newStatus = mode === 'schedule' ? 'scheduled' : 'posted'
  const supabase = getSupabase()

  const { error } = await supabase
    .from('content_calendar')
    .update({
      postiz_post_id: publishResult.postId,
      ...(mode === 'publish_now' ? { posted_at: new Date().toISOString() } : {}),
      ...(mode === 'schedule' ? { scheduled_at: publishAt } : {}),
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.content_calendar_id)

  if (error) throw new Error(`DB update failed after Postiz publish: ${error.message}`)

  return { postiz_post_id: publishResult.postId, mode, status: newStatus }
}
