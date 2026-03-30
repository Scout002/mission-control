// Standalone HTTP boundary for Postiz publishing.
// Reads secrets server-side. No approval logic. No DB writes.
// Used by external callers or direct testing — approval flow uses approval-handler.ts directly.

import { NextRequest, NextResponse } from 'next/server'
import { publishToPostiz } from '@/lib/postiz-publisher'

export async function POST(req: NextRequest) {
  let body: { content?: string; integrationId?: string; assetUrl?: string; publishAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { content, integrationId, assetUrl, publishAt } = body
  if (!content || !integrationId) {
    return NextResponse.json({ error: 'content and integrationId are required' }, { status: 400 })
  }

  try {
    const result = await publishToPostiz({ content, integrationId, assetUrl, publishAt })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
