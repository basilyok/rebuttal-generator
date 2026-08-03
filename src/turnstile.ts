// Invisible-until-challenged bot check. One managed widget with
// appearance 'interaction-only': honest users see nothing; an address the
// signals distrust gets the interactive challenge. Tokens are single-use, so
// every generation fetches a fresh one.
//
// The public sitekey for the rebuttal.m36x.com managed widget. Public and
// committable by design (the secret key lives in TURNSTILE_SECRET, set via
// wrangler). Empty string = Turnstile disabled end to end (the server skips
// verification when TURNSTILE_SECRET is unset, so dev works with no setup).
export const TURNSTILE_SITE_KEY = '0x4AAAAAAEE1TV8KH-Jmmpr5'

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
// The resolver for whichever getTurnstileToken() call is currently in
// flight. The widget is rendered exactly once; its callback (fixed at render
// time) always forwards here, so reset()-driven re-challenges on later calls
// still reach the right caller.
let pendingResolve: ((token: string) => void) | null = null

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
    const timeout = setTimeout(() => finish(''), 20_000) // never block a reply on the checker
    const finish = (token: string) => {
      clearTimeout(timeout)
      pendingResolve = null
      resolve(token)
    }
    pendingResolve = finish

    // The widget API validates its options and throws synchronously on a bad
    // value — inside this executor that would REJECT the promise and surface
    // as a generation error, which is exactly the "never block a reply on the
    // checker" failure this module must not have. Catch and finish('').
    try {
      if (widgetId !== null) {
        // Cloudflare's documented pattern: reset() alone runs a fresh challenge
        // and re-invokes the callback fixed at render time (below) with a new
        // token — no re-render needed. Rendering again into the same,
        // never-cleared container is undocumented and orphans an iframe per
        // call, so it must not happen here. One tradeoff: cData is fixed at
        // the first render and cannot be updated per reset(), so later calls'
        // deviceHint is ignored — acceptable since it is only diagnostic.
        window.turnstile!.reset(widgetId)
        return
      }
      widgetId = window.turnstile!.render(container!, {
        sitekey: TURNSTILE_SITE_KEY,
        // NB: 'interaction-only' is the documented value — 'interactive-only'
        // (the plan's original spelling) is rejected by the widget at runtime.
        appearance: 'interaction-only',
        cData: deviceHint.slice(0, 255),
        callback: (token: string) => pendingResolve?.(token),
        'error-callback': () => pendingResolve?.(''),
      })
    } catch {
      finish('')
    }
  })
}
