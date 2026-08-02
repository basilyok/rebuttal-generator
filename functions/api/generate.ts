// Instant mode: the one endpoint where OUR key pays for the reply. Everything
// about its shape follows from that: it accepts structured fields and builds
// the prompt itself (nobody turns our key into a general LLM API), the
// recipient hint is demoted to untrusted, and a missing envelope is an error —
// the raw-output fallback that is correct UX on BYOK would be an exfiltration
// channel here. Spend is bounded twice: our daily cap in the limiter DO, and
// the provisioned key's own daily limit enforced on OpenRouter's servers.
import { instantPrompt, hasMessageEnvelope, type PromptContext } from '../../src/prompts'
import type { Citation } from '../../src/providers'
import { getSession, jsonResponse } from '../_lib/session.js'
import { INSTANT } from '../_lib/instant.js'

// Structural types on purpose — the repo does not depend on
// @cloudflare/workers-types, and these two methods are all we use.
interface Env {
  OPENROUTER_PROXY_KEY?: string
  TURNSTILE_SECRET?: string
  INSTANT_TEST_ECHO?: string
  LIMITER?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
  ACCOUNTS?: { get(key: string): Promise<string | null> }
}

const DEVICE_COOKIE = 'rb_device'
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/

// Same gate as functions/api/share.js:32-45 — browser-set headers only.
function isSameOriginBrowserRequest(request: Request): boolean {
  const self = new URL(request.url).origin
  const origin = request.headers.get('Origin')
  if (origin) return origin === self
  const site = request.headers.get('Sec-Fetch-Site')
  if (site) return site === 'same-origin'
  const referer = request.headers.get('Referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === self
  } catch {
    return false
  }
}

function readDeviceId(request: Request): string | null {
  const cookies = request.headers.get('Cookie') || ''
  const match = cookies.match(/(?:^|;\s*)rb_device=([A-Za-z0-9-]{8,64})/)
  return match ? match[1] : null
}

function cleanCitations(value: unknown): Citation[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > INSTANT.maxCitations) return null
  const out: Citation[] = []
  for (const item of value) {
    const url = typeof item?.url === 'string' ? item.url.slice(0, 2000) : ''
    if (!/^https?:\/\//i.test(url)) return null
    out.push({
      url,
      title: typeof item?.title === 'string' ? item.title.slice(0, 300) : '',
      snippet: typeof item?.snippet === 'string' ? item.snippet.slice(0, 500) : undefined,
    })
  }
  return out
}

async function verifyTurnstile(env: Env, token: unknown, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true // not configured (local dev) — skip
  if (typeof token !== 'string' || !token) return false
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    // Verification outage must not take the funnel down — the quota and the
    // spend caps still hold. Fail open, count it.
    return true
  }
}

async function consume(env: Env, key: string, cap: number) {
  if (!env.LIMITER) {
    // Missing binding = misconfigured deploy. Fail open ON PURPOSE: the
    // provisioned key's OpenRouter-side daily limit still bounds the damage,
    // and refusing everyone would hand an outage to every legitimate visitor.
    return { allowed: true, remaining: cap - 1, first: false, resetAt: '' }
  }
  const res = await env.LIMITER.fetch('https://limiter/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, cap }),
  })
  if (!res.ok) return { allowed: true, remaining: cap - 1, first: false, resetAt: '' }
  return (await res.json()) as { allowed: boolean; remaining: number; first: boolean; resetAt: string }
}

function metric(ctx: { waitUntil(p: Promise<unknown>): void }, env: Env, name: string) {
  if (!env.LIMITER) return
  ctx.waitUntil(
    env.LIMITER.fetch('https://limiter/metric', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => {})
  )
}

async function callUpstream(env: Env, model: string, system: string, userContent: string) {
  if (env.INSTANT_TEST_ECHO) {
    // Test seam: full pipeline, zero spend. Never set in production.
    return {
      ok: true as const,
      status: 200,
      text: '<<<STRATEGY>>>\nEcho.\n<<<CONTEXT>>>\ntest | test | short\n<<<MESSAGE>>>\nEcho reply for testing.\n<<<WEAKLINK>>>\nEcho weak link.',
    }
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_PROXY_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rebuttal.m36x.com',
      'X-Title': 'Rebuttal Generator (Instant)',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      max_tokens: INSTANT.maxTokens,
      // 'low', not 'none': Nemotron is a reasoning model and fully starving it
      // yields empty output (the bug fixed for BYOK in providers.ts) — low keeps
      // it cheap without re-introducing that failure.
      reasoning: { effort: 'low' },
    }),
    signal: AbortSignal.timeout(INSTANT.upstreamTimeoutMs),
  })
  if (!res.ok) return { ok: false as const, status: res.status, text: '' }
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const text = data?.choices?.[0]?.message?.content?.trim() || ''
  return { ok: text.length > 0, status: res.status, text }
}

export async function onRequestPost(context: { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }) {
  const { request, env } = context
  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }
  if (!env.OPENROUTER_PROXY_KEY) {
    return jsonResponse({ error: 'Instant mode is not configured on this deployment.' }, 501)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const argument = typeof body.argument === 'string' ? body.argument.trim() : ''
  if (!argument) return jsonResponse({ error: 'An argument is required.' }, 400)
  if (argument.length > INSTANT.inputMaxChars) {
    return jsonResponse(
      {
        error: `That text is too long for Instant mode (limit ${INSTANT.inputMaxChars} characters). Shorten it, or use your own API key.`,
      },
      413
    )
  }
  const recipientLine =
    typeof body.recipientLine === 'string' ? body.recipientLine.trim().slice(0, INSTANT.recipientMaxChars) : ''
  const replyLanguage = typeof body.replyLanguage === 'string' && LANG.test(body.replyLanguage) ? body.replyLanguage : 'en'
  const briefingLanguage =
    typeof body.briefingLanguage === 'string' && LANG.test(body.briefingLanguage) ? body.briefingLanguage : 'en'
  const citations = cleanCitations(body.citations)
  if (citations === null) return jsonResponse({ error: 'Malformed citations.' }, 400)

  const ip = request.headers.get('CF-Connecting-IP')
  if (!(await verifyTurnstile(env, body.turnstileToken, ip))) {
    metric(context, env, 'turnstile_reject')
    return jsonResponse({ error: 'Verification failed — reload the page and try again.', code: 'turnstile' }, 403)
  }

  // Quota identity: the session when signed in, a device cookie otherwise.
  // Never the IP — CGNAT makes an IP a whole campus (spec, Section 1).
  const session = env.ACCOUNTS ? await getSession(request, env) : null
  const entitledCap = (session?.user as { entitlements?: { instantCap?: number } } | undefined)?.entitlements
    ?.instantCap
  const cap = Number.isInteger(entitledCap) && entitledCap! > 0 ? entitledCap! : session ? INSTANT.userCap : INSTANT.anonCap
  let device = session ? null : readDeviceId(request)
  const newDevice = !session && !device ? crypto.randomUUID() : null
  if (newDevice) device = newDevice
  const quotaKey = session ? `u:${session.userId}` : `d:${device}`

  const quota = await consume(env, quotaKey, cap)
  const headers: Record<string, string> = {}
  if (newDevice) {
    headers['Set-Cookie'] = `${DEVICE_COOKIE}=${newDevice}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
  }
  if (!quota.allowed) {
    metric(context, env, 'instant_exhausted')
    return jsonResponse(
      { error: 'Free replies are done for today.', resetAt: quota.resetAt, remaining: 0, cap, signedIn: !!session },
      429,
      headers
    )
  }

  const promptContext: PromptContext = {
    audience: recipientLine || undefined,
    isArticle: false,
    replyLanguage,
    briefingLanguage,
    audienceTrusted: false, // ALWAYS untrusted on this path
  }
  const system = instantPrompt(promptContext, citations)

  // The availability ladder (spec, Section 2): first-ever reply goes paid;
  // after that try the shared free pool and fall back to paid when it is busy.
  // Free-pool starvation is an expected state, not an exception.
  const primary = quota.first ? INSTANT.paidModel : INSTANT.freeModel
  let used = primary
  let result = await callUpstream(env, primary, system, argument)
  if (!result.ok && primary === INSTANT.freeModel) {
    metric(context, env, 'instant_free_fallback')
    used = INSTANT.paidModel
    result = await callUpstream(env, used, system, argument)
  }
  // Envelope enforcement: one retry, then refuse. Raw output never leaves.
  if (result.ok && !hasMessageEnvelope(result.text)) {
    metric(context, env, 'instant_envelope_retry')
    result = await callUpstream(env, used, system, argument)
    if (result.ok && !hasMessageEnvelope(result.text)) result = { ok: false, status: 502, text: '' }
  }
  if (!result.ok) {
    metric(context, env, 'instant_upstream_error')
    return jsonResponse(
      {
        error: 'The reply could not be generated right now — try again in a moment, or use your own API key.',
        remaining: quota.remaining,
        cap,
      },
      502,
      headers
    )
  }

  metric(context, env, 'instant_reply')
  return jsonResponse(
    { text: result.text, model: used, remaining: quota.remaining, cap, resetAt: quota.resetAt },
    200,
    headers
  )
}
