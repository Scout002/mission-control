import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDatabase } from '@/lib/db'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  if (!SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }

  let body: { id: string; title: string; platform: string; content_type: string | null; scheduled_date: string | null; brief: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, title, platform, content_type, scheduled_date, brief } = body
  if (!id || !title) {
    return NextResponse.json({ error: 'id and title are required' }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1. Update content_calendar status → assigned (Supabase — where calendar data lives)
  const { error: calendarErr } = await supabase
    .from('content_calendar')
    .update({ status: 'assigned', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'approved')

  if (calendarErr) {
    return NextResponse.json({ error: `Failed to update content_calendar: ${calendarErr.message}` }, { status: 500 })
  }

  // 2. Fetch the full content calendar item to get brief fields (hook, key_points, cta, etc.)
  const { data: calendarItem } = await supabase
    .from('content_calendar')
    .select('*')
    .eq('id', id)
    .single()

  const hook = calendarItem?.hook || (calendarItem?.metadata as any)?.hook || ''
  const keyPoints: string[] = calendarItem?.key_points || (calendarItem?.metadata as any)?.key_points || []
  const cta = calendarItem?.cta || (calendarItem?.metadata as any)?.cta || ''
  const brand = calendarItem?.brand || (calendarItem?.metadata as any)?.brand || 'scout'
  const assetType = calendarItem?.asset_type || (calendarItem?.metadata as any)?.asset_mode || ''
  const postType = content_type || calendarItem?.content_type || 'social_post'

  // 3. Determine the correct skill based on post type
  const isVisualAsset = ['image', 'carousel', 'short_video', 'reel', 'story'].includes(postType)
  // Build a metaphorical/abstract background image prompt (NO TEXT on image)
  const bgImagePrompt = [
    `Abstract metaphorical image representing: "${title}".`,
    hook ? `Mood/theme: ${hook}` : '',
    keyPoints.length > 0 ? `Visual themes: ${keyPoints.join('; ')}` : '',
    `IMPORTANT: Do NOT put any text, words, letters, numbers, or logos on the image.`,
    `This is a background image only — text will be overlaid separately.`,
    `Style: Dark, cinematic, editorial photography or abstract art. Moody lighting.`,
    `Aspect ratio: 1080x1350 vertical (4:5). Dark tones preferred.`,
  ].filter(Boolean).join(' ')

  const bgBasePrompt = 'Abstract cinematic background image. NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, NO LOGOS on the image. Dark moody tones. Editorial photography or abstract art style. 1080x1350 vertical.'

  const escapedBgPrompt = bgImagePrompt.replace(/"/g, '\\"')
  const escapedHook = (hook || title).replace(/"/g, '\\"')
  const escapedSubtext = (keyPoints.length > 0 ? keyPoints[0] : '').replace(/"/g, '\\"')
  const escapedCta = (cta || '').replace(/"/g, '\\"')

  const skillInstruction = isVisualAsset
    ? [
      `EXECUTE THIS YOURSELF — do NOT delegate to Herald or any subagent.`,
      `This is a visual ad asset (${postType}). You must run shell commands to generate it.`,
      ``,
      `## Two-step pipeline: AI background + branded template overlay`,
      ``,
      `## Step 1: Generate abstract background image (NO TEXT on it)`,
      `\`\`\`bash`,
      `mkdir -p /tmp/content-calendar-${id}`,
      `cat > /tmp/content-calendar-${id}/prompts.json << 'PROMPT_EOF'`,
      `{"base": "${bgBasePrompt}", "slides": ["${escapedBgPrompt}"]}`,
      `PROMPT_EOF`,
      `\`\`\``,
      `\`\`\`bash`,
      `node ~/.openclaw/workspace/skills/larry-marketing/scripts/generate-slides.cjs \\`,
      `  --config ~/.openclaw/workspace/skills/larry-marketing/config.json \\`,
      `  --output /tmp/content-calendar-${id} \\`,
      `  --prompts /tmp/content-calendar-${id}/prompts.json`,
      `\`\`\``,
      ``,
      `## Step 2: Run Scout brand template (composites text + logo on background)`,
      `\`\`\`bash`,
      `BG_IMAGE=$(ls /tmp/content-calendar-${id}/slide1_raw.png 2>/dev/null || ls /tmp/content-calendar-${id}/*.png 2>/dev/null | head -1)`,
      `node ~/.openclaw/workspace/skills/larry-marketing/scripts/scout-template.cjs \\`,
      `  --hook "${escapedHook}" \\`,
      `  --subtext "${escapedSubtext}" \\`,
      `  --cta "${escapedCta}" \\`,
      `  --background "$BG_IMAGE" \\`,
      `  --output /tmp/content-calendar-${id}/final \\`,
      `  --brand ${brand}`,
      `\`\`\``,
      ``,
      `## Step 3: Verify output`,
      `\`\`\`bash`,
      `ls -la /tmp/content-calendar-${id}/final/`,
      `\`\`\``,
      ``,
      `## Step 4: Upload to Supabase`,
      `\`\`\`bash`,
      `curl -X POST "${SUPABASE_URL}/storage/v1/object/content-assets/${id}.png" \\`,
      `  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \\`,
      `  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \\`,
      `  -H "Content-Type: image/png" \\`,
      `  --data-binary @/tmp/content-calendar-${id}/final/scout-post.png`,
      `\`\`\``,
      `Public URL: ${SUPABASE_URL}/storage/v1/object/public/content-assets/${id}.png`,
      ``,
      `## Step 5: Post to Discord #approvals`,
      `\`\`\`bash`,
      `openclaw message send --channel discord --account neo -t 1481422729264627912 -m "📸 **Content Ready for Approval**\\n\\n**${title}**\\nBrand: ${brand} | Platform: ${platform} | Type: ${postType}\\n${hook ? `Hook: ${hook}\\n` : ''}${cta ? `CTA: ${cta}\\n` : ''}\\nAsset: ${SUPABASE_URL}/storage/v1/object/public/content-assets/${id}.png\\n\\nContent Calendar ID: ${id}\\n\\nReply approve, reject, or retry."`,
      `\`\`\``,
      ``,
      `## Step 6: Update content calendar`,
      `\`\`\`bash`,
      `curl -X PATCH "${SUPABASE_URL}/rest/v1/content_calendar?id=eq.${id}" \\`,
      `  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \\`,
      `  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Prefer: return=minimal" \\`,
      `  -d '{"status":"ready","asset_url":"${SUPABASE_URL}/storage/v1/object/public/content-assets/${id}.png"}'`,
      `\`\`\``,
      ``,
      `CRITICAL: Run each step using your exec/bash tool. Do NOT just describe what you would do.`,
    ].join('\n')
    : `Write the content draft for this ${postType} piece yourself. Do NOT delegate. Post the draft to Discord #approvals when done.`

  // 4. Create task in Mission Control SQLite — this is where the dispatcher reads from.
  //    Assigned to Neo so he triages and delegates to Herald.
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const taskTitle = `Write content: ${title}`
  const description = [
    `Content brief approved. EXECUTE THIS YOURSELF — do not delegate to any subagent.`,
    '',
    `## Brief`,
    `**Title:** ${title}`,
    `**Brand:** ${brand}`,
    `**Platform:** ${platform}`,
    `**Post Type:** ${postType}`,
    `**Scheduled:** ${scheduled_date || 'TBD'}`,
    '',
    hook ? `**Hook:** ${hook}` : '',
    keyPoints.length > 0 ? `**Key Points:**\n${keyPoints.map((p: string) => `- ${p}`).join('\n')}` : '',
    cta ? `**CTA:** ${cta}` : '',
    brief ? `\n**Additional Brief:** ${brief}` : '',
    '',
    `## Instructions`,
    skillInstruction,
    `Run each bash command step yourself using exec/bash. Do NOT delegate.`,
    '',
    `Content Calendar ID: ${id}`,
  ].filter(Boolean).join('\n')

  const metadata = JSON.stringify({
    content_calendar_id: id,
    platform,
    content_type: postType,
    post_type: postType,
    scheduled_date,
    brand,
    execution_mode: 'direct',
    required_skill: isVisualAsset ? 'larrybrain' : 'writing',
  })

  try {
    const result = db.prepare(`
      INSERT INTO tasks (title, description, status, priority, assigned_to, created_by, metadata, workspace_id, created_at, updated_at)
      VALUES (?, ?, 'assigned', 'high', 'Neo', 'content-calendar', ?, 1, ?, ?)
    `).run(taskTitle, description, metadata, now, now)

    const taskId = result.lastInsertRowid

    return NextResponse.json({
      ok: true,
      task_id: taskId,
      message: `Task #${taskId} assigned to Neo for direct execution.`,
    })
  } catch (err) {
    // Rollback content_calendar status
    await supabase
      .from('content_calendar')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({
      error: `Failed to create task: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}
