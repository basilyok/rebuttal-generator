// Invisible-until-challenged bot check. One managed widget with
// appearance 'interactive-only': honest users see nothing; an address the
// signals distrust gets the interactive challenge. Tokens are single-use, so
// every generation fetches a fresh one.
//
// Operator fills this after creating the site in the Cloudflare dashboard
// (a later task). Empty string = Turnstile disabled end to end (the server
// skips verification when TURNSTILE_SECRET is unset, so dev works with no setup).
export const TURNSTILE_SITE_KEY = ''

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: Record<string, unknown>): string
      reset(id: string): void
    }
  }
}

let scriptPromise: Promise<void> | null = null
let widgetId: string | null = null
let container: HTMLElement | null = null

function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => reject(new Error('turnstile-load'))
      document.head.appendChild(el)
    })
  }
  return scriptPromise
}

/** Resolve a fresh single-use token, or '' when Turnstile is not configured. */
export async function getTurnstileToken(deviceHint: string): Promise<string> {
  if (!TURNSTILE_SITE_KEY) return ''
  try {
    await loadScript()
  } catch {
    return '' // script blocked or offline — never block a reply on the checker
  }
  if (!window.turnstile) return ''
  if (!container) {
    container = document.createElement('div')
    container.className = 'turnstile-slot'
    document.body.appendChild(container)
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(''), 20_000) // never block a reply on the checker
    const finish = (token: string) => {
      clearTimeout(timeout)
      resolve(token)
    }
    if (widgetId !== null) {
      window.turnstile!.reset(widgetId)
    }
    widgetId = window.turnstile!.render(container!, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interactive-only',
      cData: deviceHint.slice(0, 255),
      callback: finish,
      'error-callback': () => finish(''),
    })
  })
}
