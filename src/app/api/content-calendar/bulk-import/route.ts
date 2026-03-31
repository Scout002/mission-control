import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** CSV column header → DB field mapping (case-insensitive) */
const COLUMN_MAP: Record<string, string> = {
  title: 'title',
  description: 'description',
  brand: 'brand',
  platform: 'platform',
  'post type': 'content_type',
  post_type: 'content_type',
  hook: 'hook',
  'key points': 'key_points',
  key_points: 'key_points',
  cta: 'cta',
  asset: 'asset_type',
  'asset type': 'asset_type',
  asset_type: 'asset_type',
  'asset url': 'asset_url',
  asset_url: 'asset_url',
  'scheduled date': 'scheduled_date',
  scheduled_date: 'scheduled_date',
  date: 'scheduled_date',
  status: 'status',
  'content type': 'content_type',
  content_type: 'content_type',
  tags: 'tags',
  'draft content': 'draft_content',
  draft_content: 'draft_content',
  brief: 'brief',
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function normalizeValue(field: string, raw: string): unknown {
  const v = raw.trim()
  if (!v) return null
  switch (field) {
    case 'brand': {
      const b = v.toLowerCase()
      return b === 'scout' || b === 'nexus' ? b : null
    }
    case 'platform': {
      const p = v.toLowerCase().replace(/\s+/g, '')
      if (p === 'ig' || p === 'insta' || p === 'instagram') return 'instagram'
      if (p === 'tiktok' || p === 'tt') return 'tiktok'
      if (p === 'both') return 'both'
      if (p === 'linkedin' || p === 'li') return 'linkedin'
      if (p === 'blog') return 'blog'
      if (p === 'social') return 'social'
      if (p === 'email') return 'email'
      return p
    }
    case 'content_type': {
      const t = v.toLowerCase().replace(/\s+/g, '_')
      if (t === 'image' || t === 'photo') return 'image'
      if (t === 'carousel') return 'carousel'
      if (t === 'short_video' || t === 'video' || t === 'reel') return 'short_video'
      if (t === 'story') return 'story'
      return t
    }
    case 'asset_type': {
      const a = v.toLowerCase()
      if (a === 'upload') return 'upload'
      if (a === 'link') return 'link'
      if (a === 'generate' || a === 'gen' || a === 'ai') return 'generate'
      return null
    }
    case 'key_points':
      return v.split(/[;\n]|(?:\d+[\.\)]\s*)/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    case 'tags':
      return v.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    case 'status': {
      const s = v.toLowerCase().replace(/\s+/g, '_')
      if (['draft', 'suggested', 'pending_review', 'approved', 'published', 'rejected', 'assigned', 'cancelled'].includes(s)) return s
      return 'draft'
    }
    default:
      return v
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
    }

    const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/^["']|["']$/g, ''))
    const today = new Date().toISOString().split('T')[0]
    const errors: string[] = []
    const rows: Record<string, unknown>[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i])
      if (values.every(v => !v.trim())) continue

      const record: Record<string, unknown> = {}

      for (let j = 0; j < headers.length; j++) {
        const dbField = COLUMN_MAP[headers[j]]
        if (!dbField || !values[j]?.trim()) continue
        record[dbField] = normalizeValue(dbField, values[j].replace(/^["']|["']$/g, ''))
      }

      if (!record.title) {
        errors.push(`Row ${i}: missing title`)
        continue
      }

      // Defaults
      if (!record.scheduled_date) record.scheduled_date = today
      if (!record.status) record.status = 'draft'
      if (!record.platform && record.hook) record.platform = 'instagram'
      if (!record.content_type && (record.platform === 'instagram' || record.platform === 'tiktok')) {
        record.content_type = 'social_post'
      }
      if (!record.platform) record.platform = 'blog'
      record.creator_agent = 'operator'
      record.assigned_agent = 'herald'

      // Store social brief in metadata too (for backward compat with SocialBriefEditor)
      if (record.brand || record.hook || record.key_points || record.cta) {
        record.metadata = {
          ...(record.brand ? { brand: record.brand } : {}),
          ...(record.hook ? { social_brand: record.brand, hook: record.hook } : {}),
          ...(record.key_points ? { key_points: record.key_points } : {}),
          ...(record.cta ? { cta: record.cta } : {}),
          ...(record.asset_type ? { asset_mode: record.asset_type } : {}),
          ...(record.asset_url ? { asset_url: record.asset_url } : {}),
        }
      }

      rows.push(record)
    }

    if (rows.length === 0) {
      return NextResponse.json({
        inserted: 0,
        errors: errors.length ? errors : ['No valid rows found in CSV'],
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    let inserted = 0

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error } = await supabase.from('content_calendar').insert(batch)
      if (error) {
        errors.push(`Batch ${Math.floor(i / 50) + 1}: ${error.message}`)
      } else {
        inserted += batch.length
      }
    }

    return NextResponse.json({ inserted, total: rows.length, errors })
  } catch (err) {
    console.error('Bulk import error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    )
  }
}
