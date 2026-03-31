// Server-only Postiz API client — do NOT import from client components.
// Public API docs: https://docs.postiz.com/public-api/introduction
// Base URL: https://api.postiz.com/public/v1
// Auth: Authorization header with raw API key (no Bearer prefix)

import fs from 'fs'
import path from 'path'
import os from 'os'

// Override via POSTIZ_BASE_URL for self-hosted instances
const BASE_URL = (process.env.POSTIZ_BASE_URL || 'https://api.postiz.com/public/v1').replace(/\/$/, '')

function getApiKey(): string {
  if (process.env.POSTIZ_API_KEY) return process.env.POSTIZ_API_KEY
  // Fallback: openclaw secrets file (dev only)
  try {
    const raw = fs.readFileSync(
      path.join(os.homedir(), '.openclaw', 'workspace', '.secrets', 'postiz-api-key.json'),
      'utf-8'
    )
    return JSON.parse(raw).apiKey
  } catch {
    throw new Error('POSTIZ_API_KEY not configured. Set env var or add .secrets/postiz-api-key.json')
  }
}

export interface PostizPublishInput {
  content: string
  integrationId: string   // Postiz channel integration ID
  assetUrl?: string       // optional — uploaded before posting
  publishAt?: string      // ISO timestamp — omit for immediate publish
}

export interface PostizPublishResult {
  postId: string
  mode: 'publish_now' | 'schedule'
}

export async function publishToPostiz(input: PostizPublishInput): Promise<PostizPublishResult> {
  const apiKey = getApiKey()
  // Public API uses raw key — no "Bearer" prefix
  const headers = { Authorization: apiKey, 'Content-Type': 'application/json' }
  const mode: 'publish_now' | 'schedule' = input.publishAt ? 'schedule' : 'publish_now'

  // Optional media upload from URL
  let imagePayload: { id: string; path: string }[] = []
  if (input.assetUrl) {
    const up = await fetch(`${BASE_URL}/upload-from-url`, {
      method: 'POST', headers, body: JSON.stringify({ url: input.assetUrl }),
    })
    if (up.ok) {
      const m = await up.json() as { id?: string; path?: string }
      if (m.id) imagePayload = [{ id: m.id, path: m.path || '' }]
    }
  }

  // date is required by the API even for "now" posts
  const date = input.publishAt ?? new Date().toISOString()

  const payload: Record<string, unknown> = {
    type: input.publishAt ? 'schedule' : 'now',
    date,
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: input.integrationId },
      value: [{ content: input.content, image: imagePayload }],
      settings: { __type: 'instagram-standalone', post_type: 'post' },
    }],
  }

  const res = await fetch(`${BASE_URL}/posts`, { method: 'POST', headers, body: JSON.stringify(payload) })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Postiz API error (${res.status}): ${err}`)
  }

  // Response: [{ postId: string, integration: string }]
  const result = await res.json() as Record<string, unknown> | Array<Record<string, unknown>>
  const arr = Array.isArray(result) ? result : [result]
  const postId = (arr[0]?.postId as string) || (arr[0]?.id as string) || 'unknown'

  return { postId, mode }
}
