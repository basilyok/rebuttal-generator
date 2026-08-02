// Client half of Instant mode. The server assembles the prompt; this module
// only ships structured fields and interprets the three failure shapes the
// UI must distinguish: out of quota (a product state), turnstile (reload),
// and everything else (a plain error).
import type { Citation } from './providers'

export interface InstantReply {
  text: string
  model: string
  remaining: number
  cap: number
  resetAt: string
}

export class InstantQuotaError extends Error {
  constructor(
    readonly resetAt: string,
    readonly signedIn: boolean
  ) {
    super('quota')
  }
}

export class InstantTurnstileError extends Error {
  constructor() {
    super('turnstile')
  }
}

export async function generateInstant(args: {
  argument: string
  recipientLine?: string
  replyLanguage?: string
  briefingLanguage?: string
  citations?: Citation[]
  turnstileToken?: string
}): Promise<InstantReply> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(120_000),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 429) throw new InstantQuotaError(data.resetAt || '', !!data.signedIn)
  if (res.status === 403 && data.code === 'turnstile') throw new InstantTurnstileError()
  if (!res.ok) throw new Error(data.error || 'Instant mode is unavailable right now.')
  return data as InstantReply
}
