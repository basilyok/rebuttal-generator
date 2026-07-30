// Which language is the argument written in?
//
// This is a separate question from which language the interface is in, and getting
// it wrong defeats the app's purpose: the reply is aimed at the person who wrote
// the argument, and an English reply to a Spanish post persuades nobody. So the
// reply follows the ARGUMENT, and the UI language is left out of it entirely.
//
// No dependency, because a language-detection library would dwarf the rest of the
// bundle. Two cheap signals get us most of the way:
//   1. Script. Arabic, Greek, Devanagari, Hangul and kana are unambiguous by
//      codepoint — that settles ar, el, hi, ko, ja outright.
//   2. Stopwords. The Latin-script languages need discriminating, and function
//      words are both the most frequent tokens and the most distinctive.
//
// It only has to choose between the twelve languages the app supports, and the
// user can override it, so a wrong guess is a visible annoyance rather than a
// silent failure.

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  'pt-BR': 'Portuguese',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-Hans': 'Chinese (Simplified)',
  ar: 'Arabic',
  hi: 'Hindi',
  el: 'Greek',
}

/** Endonyms, for the language picker — people look for their own language's name. */
export const LANGUAGE_ENDONYMS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-BR': 'Português',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  'zh-Hans': '简体中文',
  ar: 'العربية',
  hi: 'हिन्दी',
  el: 'Ελληνικά',
}

export const RTL_LANGUAGES = new Set(['ar'])

export const isRtl = (language: string) => RTL_LANGUAGES.has(language)

/**
 * A language's name written in the reader's own language — "Spanish" in an English
 * UI, "الإسبانية" in an Arabic one.
 *
 * LANGUAGE_NAMES above is deliberately English-only because it also feeds the
 * PROMPT, which addresses the model in English. Using it in the interface too
 * produced "الرد بلغة Arabic" — an English word stranded mid-sentence. Intl does
 * this properly and ships with the browser.
 */
export function displayLanguageName(code: string, inLocale: string): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(code)
    if (name && name !== code) return name
  } catch {
    // Older engines, or an unknown tag — fall through to the English table
  }
  return LANGUAGE_NAMES[code] || code
}

/** Scripts that identify a language on sight. Order matters: kana before Han. */
const SCRIPTS: Array<{ language: string; pattern: RegExp }> = [
  { language: 'el', pattern: /[Ͱ-Ͽἀ-῿]/g },
  { language: 'ar', pattern: /[؀-ۿݐ-ݿ]/g },
  { language: 'hi', pattern: /[ऀ-ॿ]/g },
  { language: 'ko', pattern: /[가-힯ᄀ-ᇿ]/g },
  // Kana is exclusively Japanese; Han alone is not, so kana is tested first
  { language: 'ja', pattern: /[぀-ゟ゠-ヿ]/g },
  { language: 'zh-Hans', pattern: /[一-鿿]/g },
]

/**
 * Function words, chosen to be frequent in their own language and rare in the
 * others. Deliberately excludes words shared across Romance languages ("la", "in",
 * "a"), which carry no signal and just add noise.
 */
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'that', 'is', 'of', 'to', 'it', 'you', 'this', 'but', 'they', 'have', 'not', 'with', 'because'],
  es: ['que', 'de', 'los', 'las', 'una', 'por', 'para', 'con', 'como', 'pero', 'más', 'este', 'son', 'porque', 'está'],
  fr: ['les', 'des', 'est', 'une', 'qui', 'pour', 'dans', 'pas', 'sur', 'plus', 'avec', 'mais', 'cette', 'sont', 'parce'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'auch', 'sich', 'mit', 'aber', 'sind', 'werden', 'weil'],
  'pt-BR': ['que', 'não', 'uma', 'para', 'com', 'como', 'mais', 'por', 'são', 'está', 'isso', 'você', 'porque', 'também', 'dos'],
  it: ['che', 'non', 'per', 'una', 'con', 'sono', 'come', 'più', 'questo', 'anche', 'della', 'perché', 'delle', 'nel', 'ma'],
}

const LATIN_LANGUAGES = Object.keys(STOPWORDS)

export interface Detection {
  language: string
  /** 'high' when a script settles it, 'low' when the text was too short to tell */
  confidence: 'high' | 'medium' | 'low'
}

export function detectLanguage(text: string): Detection {
  const sample = (text || '').slice(0, 4000)
  const letters = sample.replace(/[^\p{L}]/gu, '')
  if (letters.length < 12) return { language: 'en', confidence: 'low' }

  // 1. Script. A modest share is enough — quoted Latin text is common in every language.
  for (const { language, pattern } of SCRIPTS) {
    const matches = sample.match(pattern)
    if (matches && matches.length / letters.length > 0.15) {
      return { language, confidence: 'high' }
    }
  }

  // 2. Stopwords, scored as a share of the words seen so length does not bias it.
  const words = sample.toLowerCase().match(/[\p{L}']+/gu) || []
  if (words.length < 8) return { language: 'en', confidence: 'low' }

  const counts = new Map<string, number>()
  for (const language of LATIN_LANGUAGES) counts.set(language, 0)
  for (const word of words) {
    for (const language of LATIN_LANGUAGES) {
      if (STOPWORDS[language].includes(word)) counts.set(language, counts.get(language)! + 1)
    }
  }

  let best = 'en'
  let bestScore = 0
  let runnerUp = 0
  for (const [language, score] of counts) {
    if (score > bestScore) {
      runnerUp = bestScore
      bestScore = score
      best = language
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }

  if (bestScore === 0) return { language: 'en', confidence: 'low' }
  // A clear winner needs to beat the next language, not merely appear
  const decisive = bestScore >= runnerUp * 2 && bestScore / words.length > 0.04
  return { language: best, confidence: decisive ? 'high' : 'medium' }
}
