'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface CalendarItem {
  id: string
  title: string
  platform: string
  status: string
  scheduled_date: string | null
  content_type: string | null
  brief: string | null
  draft_content: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  // Social brief columns (from CSV import)
  brand: string | null
  hook: string | null
  key_points: string[] | null
  cta: string | null
  asset_type: string | null
  asset_url: string | null
}

type AssetMode = 'upload' | 'link' | 'generate'
type SocialPlatform = 'ig' | 'tiktok' | 'both'
type PostType = 'image' | 'carousel' | 'short_video'

interface AssetInfo {
  asset_mode?: AssetMode
  asset_url?: string
  asset_filename?: string
}

interface SocialBrief {
  social_brand?: 'scout' | 'nexus'
  social_platform?: SocialPlatform
  post_type?: PostType
  hook?: string
  key_points?: string[]
  cta?: string
}

/* ── CSV Bulk Import Widget ── */
function CsvBulkImport({ onComplete }: { onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; total: number; errors: string[] } | null>(null)

  function parsePreview(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return null
    function splitLine(line: string): string[] {
      const r: string[] = []; let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
        else if (c === ',' && !inQ) { r.push(cur.trim()); cur = '' }
        else cur += c
      }
      r.push(cur.trim())
      return r
    }
    const headers = splitLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''))
    const rows = lines.slice(1, 11).map(l => splitLine(l).map(v => v.replace(/^["']|["']$/g, '')))
      .filter(r => r.some(v => v.trim()))
    return { headers, rows }
  }

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) { alert('Please upload a .csv file'); return }
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      setPreview(parsePreview(text))
    }
    reader.readAsText(f)
  }

  async function handleImport() {
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/content-calendar/bulk-import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')
      setResult(json)
      if (json.inserted > 0) {
        setTimeout(() => { onComplete(); setOpen(false); setFile(null); setPreview(null); setResult(null) }, 1500)
      }
    } catch (err) {
      setResult({ inserted: 0, total: 0, errors: [err instanceof Error ? err.message : 'Import failed'] })
    } finally {
      setUploading(false)
    }
  }

  function downloadTemplate() {
    const csv = `title,brand,platform,post type,hook,key points,cta,asset,scheduled date,status
"Top 5 interview tips for sales reps",scout,IG,carousel,"Did you know 90% of reps fail their first interview?","Prepare your pitch;Research the company;Ask smart questions","Link in bio",generate,2026-04-01,draft
"Behind the scenes at Nexus HQ",nexus,TikTok,short_video,"What it's really like working in AI sales","Day in the life;Team culture;Real results",DM us,upload,2026-04-03,draft
"How to crush your first 30 days",scout,Both,image,"Your first month matters more than you think","Set daily targets;Shadow top performers;Track everything",,link,2026-04-07,draft`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'content-calendar-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-300 rounded text-xs font-medium transition-colors">
        📤 Import CSV
      </button>
    )
  }

  return (
    <div className="mb-6 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">📤 Bulk Import from CSV</h3>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate}
            className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-1 transition-colors">
            ⬇ Template
          </button>
          <button onClick={() => { setOpen(false); setFile(null); setPreview(null); setResult(null) }}
            className="text-gray-500 hover:text-gray-300 text-sm">✕</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!file ? (
          <>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-green-500/50 bg-green-500/5' : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv'; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }; i.click() }}
            >
              <p className="text-sm text-gray-400 mb-1">Drop CSV file here or click to browse</p>
              <p className="text-[10px] text-gray-600">Columns: title, brand, platform, post type, hook, key points, cta, asset, date, status</p>
            </div>

            {/* Format guide */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Brand</span><span className="text-gray-400 font-mono">Scout | Nexus</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Platform</span><span className="text-gray-400 font-mono">IG | TikTok | Both</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Post Type</span><span className="text-gray-400 font-mono">Image | Carousel | Short Video</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Key Points</span><span className="text-gray-400 font-mono">semicolon-separated; max 3</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Asset</span><span className="text-gray-400 font-mono">Upload | Link | Generate</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-400 font-mono">YYYY-MM-DD</span></div>
            </div>
          </>
        ) : (
          <>
            {/* File info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-400">📄 {file.name}</span>
                <span className="text-xs text-gray-500">{preview ? `${preview.rows.length}+ rows` : ''}</span>
              </div>
              <button onClick={() => { setFile(null); setPreview(null); setResult(null) }}
                className="text-xs text-gray-500 hover:text-gray-300 underline">Change file</button>
            </div>

            {/* Preview table */}
            {preview && (
              <div className="overflow-x-auto border border-gray-700 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-900">
                      {preview.headers.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                        {row.map((val, j) => (
                          <td key={j} className="px-2 py-1 text-gray-300 max-w-[180px] truncate">{val || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length >= 10 && (
                  <p className="text-[10px] text-gray-600 text-center py-1 border-t border-gray-700">Showing first 10 rows</p>
                )}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className={`p-3 rounded border ${result.inserted > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                {result.inserted > 0 && (
                  <p className="text-sm text-green-400">✅ {result.inserted} of {result.total} items imported</p>
                )}
                {result.errors.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {result.errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* Import button */}
            {!result && (
              <button onClick={handleImport} disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600/30 hover:bg-green-600/50 border border-green-500/50 text-green-300 rounded text-sm font-medium transition-colors disabled:opacity-50">
                {uploading ? '⏳ Importing...' : `📤 Import ${preview?.rows.length || 0}+ Items`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

type BrandFilter = 'all' | 'scout' | 'nexus' | 'kinfort'

const BRAND_FILTERS: { value: BrandFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scout', label: 'Scout' },
  { value: 'nexus', label: 'Nexus' },
  { value: 'kinfort', label: 'Kinfort' },
]

const STATUS_COLORS: Record<string, string> = {
  suggested: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  draft: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  approved: 'bg-green-500/20 text-green-300 border-green-500/40',
  assigned: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  ready: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-red-500/10 text-red-400/60 border-red-500/20',
  pending_review: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  published: 'bg-green-600/20 text-green-200 border-green-600/40',
}

function getBrand(item: CalendarItem): string {
  return item.brand || (item.metadata?.brand as string) || 'scout'
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/40'
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${colors}`}>
      {status}
    </span>
  )
}

/* ── Asset Upload Widget ── */
function AssetUploadWidget({
  calendarItemId,
  asset,
  onAssetChange,
}: {
  calendarItemId: string
  asset: AssetInfo
  onAssetChange: (info: AssetInfo) => void
}) {
  const [mode, setMode] = useState<AssetMode>(asset.asset_mode || 'upload')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkValue, setLinkValue] = useState(asset.asset_mode === 'link' ? (asset.asset_url || '') : '')
  const [dragOver, setDragOver] = useState(false)

  const hasAsset = Boolean(asset.asset_url)

  async function handleFile(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      setError('File too large (max 50MB)')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('calendarItemId', calendarItemId)
      const res = await fetch('/api/content-calendar/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      onAssetChange({ asset_mode: 'upload', asset_url: json.url, asset_filename: json.filename })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400">Asset</p>

      {/* Mode tabs */}
      <div className="flex gap-1">
        {([
          { key: 'upload' as AssetMode, label: '📤 Upload' },
          { key: 'link' as AssetMode, label: '🔗 Link' },
          { key: 'generate' as AssetMode, label: '✨ Generate' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
              mode === key
                ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Current asset preview */}
      {hasAsset && (
        <div className="bg-gray-900 border border-gray-700 rounded p-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {asset.asset_url?.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
              <img src={asset.asset_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
            ) : (
              <span className="text-base">📎</span>
            )}
            <div className="min-w-0">
              <p className="text-xs text-gray-300 truncate">{asset.asset_filename || 'Asset'}</p>
              <p className="text-[10px] text-gray-500">{asset.asset_mode || 'uploaded'}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <a href={asset.asset_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">↗</a>
            <button
              onClick={() => onAssetChange({ asset_mode: 'upload', asset_url: undefined, asset_filename: undefined })}
              className="text-xs text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Upload zone */}
      {mode === 'upload' && !hasAsset && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <input
            type="file"
            accept="image/*,video/*,application/pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            className="hidden"
            id={`upload-${calendarItemId}`}
          />
          <label htmlFor={`upload-${calendarItemId}`} className="cursor-pointer">
            {uploading ? (
              <p className="text-xs text-gray-400">⏳ Uploading...</p>
            ) : (
              <>
                <p className="text-sm text-gray-500">📤 Drop file or click to upload</p>
                <p className="text-[10px] text-gray-600 mt-1">Images, videos, PDFs — max 50MB</p>
              </>
            )}
          </label>
        </div>
      )}

      {/* Link input */}
      {mode === 'link' && !hasAsset && (
        <div className="flex gap-2">
          <input
            type="url"
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            placeholder="https://... paste asset URL"
            className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => {
              if (!linkValue.trim()) return
              onAssetChange({ asset_mode: 'link', asset_url: linkValue.trim(), asset_filename: undefined })
            }}
            disabled={!linkValue.trim()}
            className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 rounded text-xs font-medium transition-colors disabled:opacity-30"
          >
            Save
          </button>
        </div>
      )}

      {/* Generate placeholder */}
      {mode === 'generate' && !hasAsset && (
        <div className="border border-dashed border-purple-500/30 bg-purple-500/5 rounded-lg p-3 text-center">
          <p className="text-xs text-purple-400/60">✨ AI generation coming soon</p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">{error}</p>
      )}
    </div>
  )
}

/* ── Social Brief Editor (IG/TikTok) ── */
function SocialBriefEditor({
  brief,
  onSave,
}: {
  brief: SocialBrief
  onSave: (b: SocialBrief) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [brand, setBrand] = useState<'scout' | 'nexus'>(brief.social_brand || 'scout')
  const [platform, setPlatform] = useState<SocialPlatform>(brief.social_platform || 'both')
  const [postType, setPostType] = useState<PostType>(brief.post_type || 'image')
  const [hook, setHook] = useState(brief.hook || '')
  const [points, setPoints] = useState<string[]>(brief.key_points?.length ? brief.key_points : [''])
  const [cta, setCta] = useState(brief.cta || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      social_brand: brand,
      social_platform: platform,
      post_type: postType,
      hook: hook || undefined,
      key_points: points.filter(p => p.trim()),
      cta: cta || undefined,
    })
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-400">Post Brief</p>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Edit Brief
          </button>
        </div>
        {(brief.social_brand || brief.social_platform || brief.post_type) ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {brief.social_brand && (
                <span className={`px-2 py-0.5 rounded border text-xs font-medium ${
                  brief.social_brand === 'scout'
                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                }`}>
                  {brief.social_brand === 'scout' ? 'Scout' : 'Nexus'}
                </span>
              )}
              {brief.social_platform && (
                <span className="px-2 py-0.5 rounded border text-xs font-medium bg-pink-500/20 text-pink-300 border-pink-500/40">
                  {brief.social_platform === 'ig' ? 'IG' : brief.social_platform === 'tiktok' ? 'TikTok' : 'IG + TikTok'}
                </span>
              )}
              {brief.post_type && (
                <span className="px-2 py-0.5 rounded border text-xs font-medium bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                  {brief.post_type === 'short_video' ? 'Short Video' : brief.post_type.charAt(0).toUpperCase() + brief.post_type.slice(1)}
                </span>
              )}
            </div>
            {brief.hook && <p className="text-xs text-gray-300"><span className="text-gray-500">Hook: </span>{brief.hook}</p>}
            {brief.key_points && brief.key_points.length > 0 && (
              <ul className="space-y-0.5">
                {brief.key_points.map((p, i) => (
                  <li key={i} className="text-xs text-gray-400">• {p}</li>
                ))}
              </ul>
            )}
            {brief.cta && <p className="text-xs text-gray-300"><span className="text-gray-500">CTA: </span>{brief.cta}</p>}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">No brief set</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400">Post Brief</p>

      {/* Brand */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase mb-1 block">Brand</label>
        <div className="flex gap-1">
          {(['scout', 'nexus'] as const).map(b => (
            <button key={b} onClick={() => setBrand(b)}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                brand === b
                  ? b === 'scout' ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              {b === 'scout' ? 'Scout' : 'Nexus'}
            </button>
          ))}
        </div>
      </div>

      {/* Platform */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase mb-1 block">Platform</label>
        <div className="flex gap-1">
          {([
            { key: 'ig' as SocialPlatform, label: 'IG' },
            { key: 'tiktok' as SocialPlatform, label: 'TikTok' },
            { key: 'both' as SocialPlatform, label: 'Both' },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setPlatform(key)}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                platform === key
                  ? 'bg-pink-500/20 border-pink-500/40 text-pink-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Post Type */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase mb-1 block">Post Type</label>
        <div className="flex gap-1">
          {([
            { key: 'image' as PostType, label: 'Image' },
            { key: 'carousel' as PostType, label: 'Carousel' },
            { key: 'short_video' as PostType, label: 'Short Video' },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setPostType(key)}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                postType === key
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hook */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase mb-1 block">⚡ Hook</label>
        <input value={hook} onChange={e => setHook(e.target.value)}
          placeholder="Opening hook that grabs attention..."
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Key Points */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase mb-1 block"># Key Points (max 3)</label>
        {points.map((p, idx) => (
          <div key={idx} className="flex gap-1 mb-1">
            <input value={p} onChange={e => { const n = [...points]; n[idx] = e.target.value; setPoints(n) }}
              placeholder={`Point ${idx + 1}`}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            />
            {points.length > 1 && (
              <button onClick={() => setPoints(points.filter((_, i) => i !== idx))}
                className="text-xs text-gray-500 hover:text-red-400 px-1">−</button>
            )}
          </div>
        ))}
        {points.length < 3 && (
          <button onClick={() => setPoints([...points, ''])}
            className="text-[10px] text-gray-500 hover:text-gray-300 mt-0.5">+ Add point</button>
        )}
      </div>

      {/* CTA */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase mb-1 block">📢 CTA (optional)</label>
        <input value={cta} onChange={e => setCta(e.target.value)}
          placeholder="Call to action..."
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 rounded text-xs font-medium transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Brief'}
        </button>
        <button onClick={() => setEditing(false)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded text-xs transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

function CalendarCard({
  item,
  onApprove,
  onReject,
  onStart,
  onRestore,
  onUpdateBrief,
  onUpdateDraft,
  onUpdateMetadata,
  startingId,
}: {
  item: CalendarItem
  onApprove?: (id: string) => Promise<void>
  onReject?: (id: string) => Promise<void>
  onStart?: (item: CalendarItem) => Promise<void>
  onRestore?: (id: string) => Promise<void>
  onUpdateBrief?: (id: string, brief: string) => Promise<void>
  onUpdateDraft?: (id: string, draft: string) => Promise<void>
  onUpdateMetadata?: (id: string, metadata: Record<string, unknown>) => Promise<void>
  startingId?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefValue, setBriefValue] = useState(item.brief ?? '')
  const [editingDraft, setEditingDraft] = useState(false)
  const [draftValue, setDraftValue] = useState(item.draft_content ?? '')
  const [saving, setSaving] = useState<'brief' | 'draft' | null>(null)

  const isDraft = item.status === 'draft'
  const isSuggested = item.status === 'suggested'
  const isApproved = item.status === 'approved'
  const isAssigned = item.status === 'assigned'
  const isReady = item.status === 'ready'
  const isRejected = item.status === 'rejected'

  const handleSaveBrief = async () => {
    setSaving('brief')
    await onUpdateBrief?.(item.id, briefValue)
    setSaving(null)
    setEditingBrief(false)
  }

  const handleSaveDraft = async () => {
    setSaving('draft')
    await onUpdateDraft?.(item.id, draftValue)
    setSaving(null)
    setEditingDraft(false)
  }

  return (
    <div className={`bg-gray-800 border rounded-lg overflow-hidden transition-opacity ${
      isRejected ? 'border-gray-700/50 opacity-50 hover:opacity-75' : 'border-gray-700'
    }`}>
      <div
        className="p-4 cursor-pointer hover:bg-gray-750 select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <StatusBadge status={item.status} />
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                {item.platform}
              </span>
              {item.content_type && (
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                  {item.content_type}
                </span>
              )}
              {item.scheduled_date && (
                <span className="text-xs text-gray-500">
                  📅 {item.scheduled_date}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-white">{item.title}</p>
          </div>
          <span className="text-gray-500 text-xs mt-0.5 shrink-0">
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {expanded && (
          <div
            className="mt-3 pt-3 border-t border-gray-700 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Brief */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-400">Brief</p>
                {!editingBrief && (
                  <button
                    onClick={() => { setEditingBrief(true); setBriefValue(item.brief ?? '') }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Edit Brief
                  </button>
                )}
              </div>
              {editingBrief ? (
                <div className="space-y-2">
                  <textarea
                    value={briefValue}
                    onChange={e => setBriefValue(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-gray-200 resize-y focus:outline-none focus:border-blue-500"
                    placeholder="Enter brief..."
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveBrief}
                      disabled={saving === 'brief'}
                      className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 rounded text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {saving === 'brief' ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingBrief(false)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-300 whitespace-pre-wrap">
                  {item.brief ?? <span className="text-gray-500 italic">No brief yet</span>}
                </p>
              )}
            </div>

            {/* Draft content */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-400">Draft</p>
                {!editingDraft && (
                  <button
                    onClick={() => { setEditingDraft(true); setDraftValue(item.draft_content ?? '') }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Edit Draft
                  </button>
                )}
              </div>
              {editingDraft ? (
                <div className="space-y-2">
                  <textarea
                    value={draftValue}
                    onChange={e => setDraftValue(e.target.value)}
                    rows={6}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-gray-200 resize-y focus:outline-none focus:border-blue-500"
                    placeholder="Enter draft content..."
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDraft}
                      disabled={saving === 'draft'}
                      className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 rounded text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {saving === 'draft' ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingDraft(false)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-300 whitespace-pre-wrap">
                  {item.draft_content ?? <span className="text-gray-500 italic">No draft yet</span>}
                </p>
              )}
            </div>

            {/* Content Brief — shown when DB columns or metadata have brief data */}
            {(() => {
              const meta = (item.metadata || {}) as SocialBrief
              const hasBriefData = item.hook || item.key_points?.length || item.cta || item.brand || meta.hook || meta.key_points?.length || meta.cta || meta.social_brand
              const merged: SocialBrief = {
                social_brand: (item.brand as 'scout' | 'nexus') || meta.social_brand,
                social_platform: meta.social_platform || (item.platform === 'instagram' ? 'ig' : item.platform === 'tiktok' ? 'tiktok' : item.platform === 'both' ? 'both' : undefined),
                post_type: meta.post_type || (item.content_type === 'image' ? 'image' : item.content_type === 'carousel' ? 'carousel' : item.content_type === 'short_video' ? 'short_video' : undefined),
                hook: item.hook || meta.hook,
                key_points: item.key_points?.length ? item.key_points : meta.key_points,
                cta: item.cta || meta.cta,
              }
              return hasBriefData ? (
                <SocialBriefEditor
                  brief={merged}
                  onSave={async (b) => {
                    // Save to both metadata and DB columns
                    await onUpdateMetadata?.(item.id, { ...item.metadata, ...b })
                  }}
                />
              ) : null
            })()}

            {/* Asset Upload — all platforms */}
            <AssetUploadWidget
              calendarItemId={item.id}
              asset={(item.metadata || {}) as AssetInfo}
              onAssetChange={async (info) => {
                await onUpdateMetadata?.(item.id, { ...item.metadata, ...info })
              }}
            />
          </div>
        )}
      </div>

      {/* Action buttons — status-dependent */}
      {(isDraft || isSuggested || isReady) && (
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={() => onApprove?.(item.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 border border-green-600/50 text-green-300 rounded text-xs font-medium transition-colors"
          >
            ✅ Approve
          </button>
          <button
            onClick={() => onReject?.(item.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 text-red-300 rounded text-xs font-medium transition-colors"
          >
            ✕ Reject
          </button>
        </div>
      )}
      {isApproved && (
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={() => onStart?.(item)}
            disabled={startingId === item.id}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/50 text-blue-300 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {startingId === item.id ? '⏳ Starting...' : '▶ Start'}
          </button>
        </div>
      )}
      {isAssigned && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Generating — Neo is executing...
          </div>
        </div>
      )}
      {isReady && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-300">
            ✅ Asset ready
            {(item.metadata as AssetInfo)?.asset_url && (
              <a href={(item.metadata as AssetInfo).asset_url} target="_blank" rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-200 underline ml-auto">View asset ↗</a>
            )}
          </div>
        </div>
      )}
      {isRejected && (
        <div className="px-4 pb-4">
          <button
            onClick={() => onRestore?.(item.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 text-gray-400 hover:text-gray-200 rounded text-xs font-medium transition-colors"
          >
            ↩ Restore to Draft
          </button>
        </div>
      )}
    </div>
  )
}

export function ContentCalendarPanel() {
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all')

  const fetchItems = useCallback(async () => {
    console.log('[ContentCalendar] Fetching from Supabase...')
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('content_calendar')
      .select('*')
      .order('scheduled_date')

    console.log('[ContentCalendar] Result:', { data, error })

    if (error) {
      console.error('[ContentCalendar] Error:', error)
      setError(error.message)
    } else {
      console.log('[ContentCalendar] Got', data?.length, 'items')
      setItems((data as CalendarItem[]) || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Approve: route through /api/content-calendar/approve (status + Postiz publish)
  const handleApprove = async (id: string) => {
    setActionError(null)
    const res = await fetch('/api/content-calendar/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    const result = await res.json().catch(() => ({ error: 'Unknown error' }))

    if (!res.ok) {
      setActionError(result.error ?? `Approve failed (${res.status})`)
      return
    }

    // Surface Postiz errors inline without blocking the approval
    if (result._postizError) {
      setActionError(`Approved — but Postiz publish failed: ${result._postizError}`)
    }

    // If item needs Herald generation, auto-dispatch
    const item = items.find(i => i.id === id)
    const assetMode = (item?.metadata as AssetInfo | null)?.asset_mode
    if (assetMode === 'generate' && item) {
      await handleStart({ ...item, status: 'approved' })
    } else {
      await fetchItems()
    }
  }

  const handleReject = async (id: string) => {
    setActionError(null)
    const { error } = await supabase
      .from('content_calendar')
      .update({ status: 'rejected' })
      .eq('id', id)

    if (error) {
      setActionError(`Reject failed: ${error.message}`)
    } else {
      await fetchItems()
    }
  }

  const handleRestore = async (id: string) => {
    setActionError(null)
    const { error } = await supabase
      .from('content_calendar')
      .update({ status: 'draft' })
      .eq('id', id)

    if (error) {
      setActionError(`Restore failed: ${error.message}`)
    } else {
      await fetchItems()
    }
  }

  const handleStart = async (item: CalendarItem) => {
    setActionError(null)
    setStartingId(item.id)

    try {
      const res = await fetch('/api/content-calendar/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          title: item.title,
          brief: item.brief,
          platform: item.platform,
          content_type: item.content_type,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setActionError(`Start failed: ${json.error ?? res.statusText}`)
      } else {
        await fetchItems()
      }
    } catch (err) {
      setActionError(`Start failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStartingId(null)
    }
  }

  // Bulk actions — route each through the approve API so Postiz gets triggered
  const handleBulkApprove = async () => {
    setActionError(null)
    const approvable = [...drafts, ...ready].filter(i => i.status === 'draft' || i.status === 'suggested' || i.status === 'ready')
    if (approvable.length === 0) return

    const errors: string[] = []
    for (const item of approvable) {
      const res = await fetch('/api/content-calendar/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const result = await res.json().catch(() => ({ error: 'Unknown error' }))
      if (!res.ok) errors.push(`${item.title}: ${result.error ?? res.status}`)
      else if (result._postizError) errors.push(`${item.title}: Postiz error — ${result._postizError}`)
    }

    if (errors.length > 0) setActionError(`Bulk approve issues: ${errors.join(' | ')}`)
    await fetchItems()
  }

  const handleBulkReject = async () => {
    setActionError(null)
    const draftIds = drafts.map(i => i.id)
    if (draftIds.length === 0) return

    const { error } = await supabase
      .from('content_calendar')
      .update({ status: 'rejected' })
      .in('id', draftIds)

    if (error) {
      setActionError(`Bulk reject failed: ${error.message}`)
    } else {
      await fetchItems()
    }
  }

  const handleUpdateBrief = async (id: string, brief: string) => {
    const { error } = await supabase
      .from('content_calendar')
      .update({ brief })
      .eq('id', id)

    if (error) {
      setActionError(`Save failed: ${error.message}`)
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, brief } : i))
    }
  }

  const handleUpdateDraft = async (id: string, draft_content: string) => {
    const { error } = await supabase
      .from('content_calendar')
      .update({ draft_content })
      .eq('id', id)

    if (error) {
      setActionError(`Save failed: ${error.message}`)
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, draft_content } : i))
    }
  }

  const handleUpdateMetadata = async (id: string, metadata: Record<string, unknown>) => {
    const { error } = await supabase
      .from('content_calendar')
      .update({ metadata })
      .eq('id', id)

    if (error) {
      setActionError(`Save failed: ${error.message}`)
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, metadata } : i))
    }
  }

  const filteredItems = brandFilter === 'all'
    ? items
    : items.filter(i => getBrand(i) === brandFilter)

  // Split into sections
  const suggestions = filteredItems.filter(i => i.status === 'suggested')
  const drafts = filteredItems.filter(i => i.status === 'draft')
  const inProgress = filteredItems.filter(i => i.status === 'approved' || i.status === 'assigned')
  const ready = filteredItems.filter(i => i.status === 'ready' || i.status === 'published')
  const rejected = filteredItems.filter(i => i.status === 'rejected')

  const cardProps = {
    onApprove: handleApprove,
    onReject: handleReject,
    onRestore: handleRestore,
    onStart: handleStart,
    onUpdateBrief: handleUpdateBrief,
    onUpdateDraft: handleUpdateDraft,
    onUpdateMetadata: handleUpdateMetadata,
    startingId,
  }

  return (
    <div className="p-6 bg-gray-900 min-h-full text-white">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Content Calendar</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filteredItems.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          <CsvBulkImport onComplete={fetchItems} />
          <button
            onClick={fetchItems}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            {loading ? '⏳ Loading...' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Brand filter */}
      <div className="flex items-center gap-1.5 mb-6">
        {BRAND_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setBrandFilter(f.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              brandFilter === f.value
                ? 'bg-indigo-600/40 border-indigo-500/70 text-indigo-200'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
          <strong>Supabase error:</strong> {error}
        </div>
      )}

      {actionError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg flex items-start justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-300 hover:text-red-100 shrink-0">✕</button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <>
          {/* Beacon Suggestions */}
          {suggestions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-yellow-300 mb-3 flex items-center gap-2">
                💡 Beacon Suggestions
                <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                  {suggestions.length}
                </span>
              </h2>
              <div className="space-y-3">
                {suggestions.map(item => (
                  <CalendarCard key={item.id} item={item} {...cardProps} />
                ))}
              </div>
            </section>
          )}

          {/* Draft Briefs — with bulk actions */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-amber-300 flex items-center gap-2">
                ✏️ Draft Briefs
                <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                  {drafts.length}
                </span>
              </h2>
              {drafts.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkApprove}
                    className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 border border-green-600/50 text-green-300 rounded text-xs font-medium transition-colors"
                  >
                    ✅ Approve All ({drafts.length})
                  </button>
                  <button
                    onClick={handleBulkReject}
                    className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 text-red-400 rounded text-xs font-medium transition-colors"
                  >
                    ✕ Reject All
                  </button>
                </div>
              )}
            </div>
            {drafts.length === 0 ? (
              <p className="text-gray-500 text-sm">No drafts pending review.</p>
            ) : (
              <div className="space-y-3">
                {drafts.map(item => (
                  <CalendarCard key={item.id} item={item} {...cardProps} />
                ))}
              </div>
            )}
          </section>

          {/* In Progress (approved + assigned) */}
          {inProgress.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-blue-300 mb-3 flex items-center gap-2">
                ⚡ In Progress
                <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                  {inProgress.length}
                </span>
              </h2>
              <div className="space-y-3">
                {inProgress.map(item => (
                  <CalendarCard key={item.id} item={item} {...cardProps} />
                ))}
              </div>
            </section>
          )}

          {/* Ready / Published */}
          {ready.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                ✅ Ready
                <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                  {ready.length}
                </span>
              </h2>
              <div className="space-y-3">
                {ready.map(item => (
                  <CalendarCard key={item.id} item={item} {...cardProps} />
                ))}
              </div>
            </section>
          )}

          {/* Rejected */}
          {rejected.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-500 mb-3 flex items-center gap-2">
                ✕ Rejected
                <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                  {rejected.length}
                </span>
              </h2>
              <div className="space-y-3">
                {rejected.map(item => (
                  <CalendarCard key={item.id} item={item} {...cardProps} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
