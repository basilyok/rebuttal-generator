// Interface translation.
//
// No dependency: a translation library would be larger than the dictionaries it
// manages, and this app needs exactly two features — lookup and interpolation.
//
// Only the active locale is downloaded. English is bundled statically because it is
// also the fallback: a key missing from a translation renders in English rather than
// showing a raw key to the user.
//
// The UI language is deliberately NOT the language the reply is written in. That
// follows the argument's own language — see src/lang.ts — because the reply is aimed
// at the person who wrote it.

import en from './locales/en'

export type Dict = Record<string, string>

export const SUPPORTED = ['en', 'es', 'fr', 'de', 'pt-BR', 'it', 'ja', 'ko', 'zh-Hans', 'ar', 'hi', 'el'] as const
export type Language = (typeof SUPPORTED)[number]

export const LANGUAGE_STORAGE = 'ui_language'

const LOADERS: Record<string, () => Promise<{ default: Dict }>> = {
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
  de: () => import('./locales/de'),
  'pt-BR': () => import('./locales/pt-BR'),
  it: () => import('./locales/it'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
  'zh-Hans': () => import('./locales/zh-Hans'),
  ar: () => import('./locales/ar'),
  hi: () => import('./locales/hi'),
  el: () => import('./locales/el'),
}

export const english = en

/**
 * Map a BCP-47 tag from the browser onto a supported locale.
 * Handles the cases that actually occur: pt-PT → pt-BR (same dictionary is far
 * better than English), and every zh variant → Simplified.
 */
export function normaliseTag(tag: string): Language | '' {
  if (!tag) return ''
  const lower = tag.toLowerCase()
  if (SUPPORTED.includes(tag as Language)) return tag as Language

  const base = lower.split('-')[0]
  if (base === 'pt') return 'pt-BR'
  if (base === 'zh') return 'zh-Hans'
  // Norwegian, Bokmål etc. have no dictionary here; fall through to ''
  const direct = SUPPORTED.find((code) => code.toLowerCase() === lower || code.split('-')[0] === base)
  return (direct as Language) || ''
}

/**
 * Which language to start in, before any account has loaded.
 *
 * Order matters: an explicit choice always wins, because someone who picked a
 * language did so precisely because the automatic guess was wrong for them.
 */
export function detectInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE) || ''
    const normalised = normaliseTag(stored)
    if (normalised) return normalised
  } catch {
    // storage blocked; fall through to the browser's own preference
  }

  for (const tag of navigator.languages || [navigator.language]) {
    const normalised = normaliseTag(tag || '')
    if (normalised) return normalised
  }
  return 'en'
}

const cache = new Map<string, Dict>([['en', en]])

export async function loadLocale(language: string): Promise<Dict> {
  if (cache.has(language)) return cache.get(language)!
  const loader = LOADERS[language]
  if (!loader) return en
  try {
    const module = await loader()
    // Merge over English so a key added since translation still renders as words
    const dict = { ...en, ...module.default }
    cache.set(language, dict)
    return dict
  } catch {
    return en
  }
}

/**
 * Build the lookup function. Placeholders are `{name}`; a missing value renders the
 * placeholder unchanged rather than "undefined", which at least reads as a bug
 * rather than as content.
 */
export function makeT(dict: Dict) {
  return function t(key: string, params?: Record<string, string | number>): string {
    const template = dict[key] ?? en[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] === undefined ? match : String(params[name])
    )
  }
}

export type TFunction = ReturnType<typeof makeT>
