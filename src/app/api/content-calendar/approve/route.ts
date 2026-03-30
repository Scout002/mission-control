// Content calendar approval authority — single entry point for all approvals.
// Handles: status update → Postiz publish/schedule → DB persistence → logging.
//
// Only triggers Postiz if draft_content is present. Items without copy
// (pending Herald generation) are approved in status only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onContentApproved } from '@/lib/approval-handler'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  let body: { id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Update status → approved
  const { data: item, error: updateErr } = await supabase
    .from('content_calendar')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, title, draft_content, asset_url, scheduled_date, postiz_post_id')
    .single()

  if (updateErr || !item) {
    logger.error({ err: updateErr, id }, 'content_calendar approve DB update failed')
    return NextResponse.json({ error: updateErr?.message ?? 'Item not found' }, { status: 500 })
  }

  // 2. Trigger Postiz only if copy is ready
  let postizResult = null
  let postizError: string | null = null

  if (item.draft_content) {
    try {
      postizResult = await onContentApproved({
        content_calendar_id: item.id,
        title: item.title,
        output: item.draft_content,
        asset_url: item.asset_url ?? null,
        publish_date: item.scheduled_date ?? null,
        postiz_post_id: item.postiz_post_id ?? null,
      })
    } catch (err) {
      postizError = err instanceof Error ? err.message : String(err)
      // Do not fail the approval — status is already approved. Surface error to UI.
      logger.error({ err, id }, 'Postiz publish failed after approval')
    }
  } else {
    logger.info({ id }, 'Approved without copy — skipping Postiz (Herald will generate)')
  }

  return NextResponse.json({
    ok: true,
    status: postizResult?.status ?? 'approved',
    _postizResult: postizResult,
    _postizError: postizError,
  })
}
