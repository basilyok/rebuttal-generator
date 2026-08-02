import { useState, useRef, useEffect, useMemo } from 'react'
import './App.css'
import {
  PROVIDERS,
  getProvider,
  generateText,
  supportsParallelCalls,
  modelsFor,
  fetchLiveModels,
  saveCachedCatalog,
  loadCachedCatalog,
  clearCachedCatalog,
  estimateCost,
  costOf,
  formatCost,
  isFreeModel,
  describeModel,
  canSearchWeb,
  type ModelOption,
  type Usage,
  type Citation,
} from './providers'
import { fetchArticle, ArticleError, type Article } from './article'
import { RichText, hostOf } from './RichText'
import {
  messagePrompt,
  honestCheckPrompt,
  theirCasePrompt,
  parseMessage,
  parseCheck,
  parseTheirCase,
  section,
  type PromptContext,
} from './prompts'
import {
  searchForEvidence,
  queryFor,
  stripUnverifiedUrls,
  loadTavilyKey,
  SearchError,
  TAVILY_KEY_STORAGE,
} from './search'
import {
  publishResult,
  loadSharedResult,
  shareUrlFor,
  sharedIdFromLocation,
  clearSharedIdFromLocation,
  type SharedRebuttal,
} from './share'
import {
  detectInitialLanguage,
  loadLocale,
  makeT,
  english,
  LANGUAGE_STORAGE,
  SUPPORTED,
  type Dict,
} from './i18n'
import { detectLanguage, isRtl, displayLanguageName } from './lang'
import { fetchAuthState, signIn, signOut, saveLanguagePreference, authErrorMessage, SIGNED_OUT, type AuthState } from './auth'
import { generateInstant, InstantQuotaError, InstantTurnstileError } from './instant'
import { getTurnstileToken } from './turnstile'
import {
  fetchVault,
  saveVault,
  deleteVault,
  seal,
  unlock,
  unlockWithDeviceKey,
  resealWithDeviceKey,
  forgetDeviceKey,
  WrongPassphraseError,
  type KeyBundle,
  type VaultBlob,
} from './vault'
import { AccountBar, VaultDialog, type VaultUiState } from './AccountBar'

/**
 * One generated reply. `message` is the only part that is ever sent to anyone —
 * everything else is private briefing for the sender. See CONSTITUTION.md.
 */
interface Reply {
  message: string
  strategy: string
  context: { goal: string; audience: string; length: string } | null
  citations: Citation[]
  /** URLs the model invented that were stripped before display */
  strippedUrls: string[]
  /** Sources retrieved but not used in the message */
  unusedCitations: Citation[]
  weakLink?: string
  toVerify?: string[]
  theirCase?: string
  answered?: string[]
  /** True when this reply came from Instant mode (no key, our server paid) */
  instant?: boolean
}

const keyStorageId = (providerId: string) => `api_key_${providerId}`

function loadStoredKey(providerId: string): string {
  return (localStorage.getItem(keyStorageId(providerId)) || '').trim()
}

/**
 * Every API key this browser holds, as the vault stores them.
 *
 * localStorage stays the working store — nothing downstream had to change — and the
 * vault is a synced mirror of it. Keeping that direction (local is truth, vault is a
 * copy) means a signed-out user, a failed decrypt, or a blocked IndexedDB all
 * degrade to exactly the behaviour the app had before accounts existed.
 */
function collectKeyBundle(): KeyBundle {
  const bundle: KeyBundle = {}
  for (const provider of PROVIDERS) {
    if (!provider.requiresKey) continue
    const key = loadStoredKey(provider.id)
    if (key) bundle[provider.id] = key
  }
  const tavily = (localStorage.getItem(TAVILY_KEY_STORAGE) || '').trim()
  if (tavily) bundle.tavily = tavily
  return bundle
}

/** Write a decrypted bundle into local storage. Never clears keys this device already has. */
function applyKeyBundle(bundle: KeyBundle): void {
  for (const [id, key] of Object.entries(bundle)) {
    if (typeof key !== 'string' || !key) continue
    if (id === 'tavily') localStorage.setItem(TAVILY_KEY_STORAGE, key)
    else localStorage.setItem(keyStorageId(id), key)
  }
}

// One-time migration from the single-provider era
if (localStorage.getItem('anthropic_api_key') && !localStorage.getItem(keyStorageId('anthropic'))) {
  localStorage.setItem(keyStorageId('anthropic'), (localStorage.getItem('anthropic_api_key') || '').trim())
  localStorage.removeItem('anthropic_api_key')
}

/**
 * The saved provider, resolved against the current catalog. Providers get retired, so a
 * stored id may no longer exist — getProvider falls back, and returning the *resolved* id
 * keeps every lookup keyed off it (cached catalog, stored key) pointing at the same
 * provider the user actually ends up on.
 */
const storedProviderId = () => getProvider(localStorage.getItem('ai_provider') || 'anthropic').id

/** Real, retrieved sources. Rendered only when the model actually returned some. */
function SourceList({ citations, title }: { citations?: Citation[]; title: string }) {
  if (!citations?.length) return null
  return (
    <div className="sources">
      <div className="sources-title">{title}</div>
      <ol className="sources-list">
        {citations.map((c) => (
          <li key={c.url}>
            <a href={c.url} target="_blank" rel="noopener noreferrer nofollow">
              {c.title || hostOf(c.url)}
            </a>{' '}
            <span className="token-detail">{hostOf(c.url)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [providerId, setProviderId] = useState(() => getProvider(storedProviderId()).id)
  const [models, setModels] = useState<ModelOption[]>(() => modelsFor(getProvider(storedProviderId())))
  const [modelId, setModelId] = useState(() => {
    const provider = getProvider(storedProviderId())
    const stored = localStorage.getItem('ai_model') || ''
    return modelsFor(provider).some((m) => m.id === stored) ? stored : provider.defaultModel
  })
  const [catalogFetchedAt, setCatalogFetchedAt] = useState<number | null>(
    () => loadCachedCatalog(storedProviderId())?.fetchedAt ?? null
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [apiKey, setApiKey] = useState(() => loadStoredKey(getProvider(storedProviderId()).id))
  const [keyDraft, setKeyDraft] = useState('')
  const [showApiKeyInput, setShowApiKeyInput] = useState(() => {
    const provider = getProvider(storedProviderId())
    return provider.requiresKey && !loadStoredKey(provider.id)
  })
  const [providerStatus, setProviderStatus] = useState('')
  const [lastRun, setLastRun] = useState<{ usage: Usage; cost: number | null } | null>(null)
  const [sessionCost, setSessionCost] = useState(0)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // Settings start collapsed once a key is stored — open on first run so the
  // key form is reachable without hunting for it
  const [showSettings, setShowSettings] = useState(() => {
    const p = getProvider(storedProviderId())
    return p.requiresKey && !loadStoredKey(p.id)
  })
  const [shared, setShared] = useState<SharedRebuttal | null>(null)
  const [sharedError, setSharedError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [useSources, setUseSources] = useState(true)
  const [audience, setAudience] = useState('')

  // --- Instant mode: no key, our server pays, spend bounded by daily quota ---
  const [instantQuota, setInstantQuota] = useState<{ remaining: number; cap: number } | null>(null)
  const [instantDone, setInstantDone] = useState<{ resetAt: string; signedIn: boolean } | null>(null)

  // --- language ------------------------------------------------------------
  // Typed as string, not the Language union: values also arrive from the account
  // record and from <select>, and are validated against SUPPORTED at those edges.
  const [language, setLanguage] = useState<string>(detectInitialLanguage)
  const [dict, setDict] = useState<Dict>(english)
  const t = useMemo(() => makeT(dict), [dict])
  /** Explicit override of the reply language; empty means follow the argument. */
  const [replyLanguageOverride, setReplyLanguageOverride] = useState('')
  const [showReplyLangPicker, setShowReplyLangPicker] = useState(false)

  // --- account and vault ---------------------------------------------------
  const [auth, setAuth] = useState<AuthState>(SIGNED_OUT)
  const [vaultBlob, setVaultBlob] = useState<VaultBlob | null>(null)
  const [vaultState, setVaultState] = useState<VaultUiState>('none')
  const [vaultPrompt, setVaultPrompt] = useState<'setup' | 'unlock' | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultError, setVaultError] = useState('')

  // Always-current translator, for callbacks registered once (speech recognition)
  const tRef = useRef(t)
  tRef.current = t
  const [tavilyDraft, setTavilyDraft] = useState(() => loadTavilyKey())
  const [tavilySaved, setTavilySaved] = useState(false)
  const [messageCopied, setMessageCopied] = useState(false)
  const [showClaims, setShowClaims] = useState(false)
  const [isBriefingOpen, setIsBriefingOpen] = useState(false)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState('')
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text')
  const [articleUrl, setArticleUrl] = useState('')
  const [article, setArticle] = useState<Article | null>(null)
  const [isFetchingArticle, setIsFetchingArticle] = useState(false)
  const [articleStatus, setArticleStatus] = useState('')

  const provider = getProvider(providerId)
  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId])

  const recognitionRef = useRef<any>(null)
  // Finalized speech segments; interim hypotheses are displayed but never persisted
  const finalTranscriptRef = useRef('')
  // Whether the user still intends to be recording (drives auto-restart after silence)
  const wantRecordingRef = useRef(false)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)
  // What the last reply was built from, so the briefing can be generated later
  // against exactly the same input and context
  const lastRequestRef = useRef<{
    userContent: string
    promptContext: PromptContext
    citations: Citation[]
    modelSearch: boolean
  } | null>(null)

  // Load the active locale, and tell the document what it is. `lang` matters for
  // screen readers and hyphenation; `dir` is what actually makes Arabic legible.
  useEffect(() => {
    let cancelled = false
    loadLocale(language).then((next) => {
      if (!cancelled) setDict(next)
    })
    document.documentElement.lang = language
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr'
    return () => {
      cancelled = true
    }
  }, [language])

  // Sign-in state, plus the account's saved language. A preference stored on the
  // account wins over this device's locale — that is what "maintained across logins"
  // means — but never over a choice made explicitly on this device in this session.
  useEffect(() => {
    let cancelled = false
    fetchAuthState().then((state) => {
      if (cancelled) return
      setAuth(state)
      const saved = state.user?.language
      const chosenHere = localStorage.getItem(LANGUAGE_STORAGE)
      if (saved && SUPPORTED.includes(saved as never) && !chosenHere) setLanguage(saved)
    })

    // Report a failed sign-in once, then clean the URL so a refresh does not repeat it
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError) {
      const message = authErrorMessage(authError)
      if (message) setError(message)
      params.delete('auth_error')
      const query = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Pull the encrypted vault once signed in, and open it silently if this device
  // already holds the derived key — the whole point is not asking again.
  useEffect(() => {
    if (!auth.user) {
      setVaultState('none')
      setVaultBlob(null)
      return
    }
    let cancelled = false
    fetchVault()
      .then(async (blob) => {
        if (cancelled) return
        setVaultBlob(blob)
        if (!blob) {
          setVaultState('none')
          return
        }
        const bundle = await unlockWithDeviceKey(blob)
        if (cancelled) return
        if (bundle) {
          applyKeyBundle(bundle)
          setApiKey(loadStoredKey(providerId))
          setTavilyDraft(loadTavilyKey())
          setShowApiKeyInput(getProvider(providerId).requiresKey && !loadStoredKey(providerId))
          setVaultState('unlocked')
        } else {
          setVaultState('locked')
        }
      })
      .catch(() => {
        if (!cancelled) setVaultState('none')
      })
    return () => {
      cancelled = true
    }
    // providerId is intentionally omitted: this must run on sign-in, not on every
    // provider switch, and the key it applies is re-read by applyProvider anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id])

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true

    const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ')

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscriptRef.current = join(finalTranscriptRef.current, text)
        } else {
          interim += text
        }
      }
      setTranscript(join(finalTranscriptRef.current, interim))
    }

    recognition.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are routine — not worth alarming the user
      if (event.error === 'no-speech') return
      if (event.error === 'aborted') {
        wantRecordingRef.current = false
        return
      }
      wantRecordingRef.current = false
      // tRef, not t: this effect runs once, so capturing `t` directly would freeze
      // these messages in whatever language was active at mount.
      const messages: Record<string, string> = {
        'not-allowed': tRef.current('error.micDenied'),
        'service-not-allowed': tRef.current('error.micDenied'),
        'audio-capture': tRef.current('error.micMissing'),
        network: tRef.current('error.speechNetwork'),
      }
      setError(messages[event.error] || `Speech recognition error: ${event.error}`)
    }

    recognition.onend = () => {
      // Browsers stop recognition after a few seconds of silence; restart while
      // the user still intends to record so pauses don't lose the tail of speech.
      if (wantRecordingRef.current) {
        try {
          recognition.start()
          return
        } catch {
          wantRecordingRef.current = false
        }
      }
      setIsRecording(false)
    }

    return () => {
      wantRecordingRef.current = false
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // not started — nothing to abort
      }
      recognitionRef.current = null
    }
  }, [])

  // Service worker update flow: show a banner when a new version is waiting,
  // reload once the new worker takes control.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let hadController = !!navigator.serviceWorker.controller
    let reloading = false
    const onControllerChange = () => {
      // First-install claim also fires controllerchange — only reload on a real swap
      if (!hadController) {
        hadController = true
        return
      }
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    let registration: ServiceWorkerRegistration | undefined
    const onUpdateFound = () => {
      const newWorker = registration?.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorkerRef.current = registration?.waiting ?? newWorker
          setUpdateAvailable(true)
        }
      })
    }

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg
      // A worker may already be waiting from a previous session
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorkerRef.current = reg.waiting
        setUpdateAvailable(true)
      }
      reg.addEventListener('updatefound', onUpdateFound)
    })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      registration?.removeEventListener('updatefound', onUpdateFound)
    }
  }, [])

  // A ?s= link opens straight into the shared result
  useEffect(() => {
    const id = sharedIdFromLocation()
    if (!id) return
    loadSharedResult(id)
      .then(setShared)
      .catch((err) => setSharedError(err instanceof Error ? err.message : t('error.loadShared')))
  }, [])

  const dismissShared = () => {
    setShared(null)
    setSharedError('')
    clearSharedIdFromLocation()
  }

  const handleShare = async () => {
    if (!reply) return
    setIsSharing(true)
    setError('')
    try {
      const id = await publishResult({
        // In URL mode the "argument" is the whole extracted article; publish the
        // reference instead of dumping the publisher's full text into our store
        argument: article ? `${article.title} — ${article.url}` : transcript.trim(),
        message: reply.message,
        strategy: reply.strategy,
        citations: reply.citations,
        modelLabel: model?.label,
        providerLabel: provider.label,
        articleUrl: article?.url,
        articleTitle: article?.title,
      })
      setShareUrl(shareUrlFor(id))
      setShareCopied(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.publish'))
    } finally {
      setIsSharing(false)
    }
  }

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
    } catch {
      setShareCopied(false)
    }
  }

  const toggleRecording = () => {
    const recognition = recognitionRef.current
    if (!recognition) {
      setError(t('error.speechUnsupported'))
      return
    }

    if (isRecording) {
      wantRecordingRef.current = false
      recognition.stop()
      setIsRecording(false)
    } else {
      setError('')
      // Dictating is a fresh argument, not a rebuttal of the fetched article
      setArticle(null)
      wantRecordingRef.current = true
      // Dictate in the interface language. Set here rather than at construction so a
      // language change takes effect without tearing down the recogniser.
      try {
        recognition.lang = language
      } catch {
        // Some engines reject unknown tags; the browser default is a fine fallback
      }
      try {
        recognition.start()
      } catch {
        // already started — keep going
      }
      setIsRecording(true)
    }
  }

  const clearTranscript = () => {
    finalTranscriptRef.current = ''
    setTranscript('')
    setReply(null)
    setError('')
    setLastRun(null)
    setArticle(null)
  }

  const handleFetchArticle = async () => {
    setIsFetchingArticle(true)
    setError('')
    setArticle(null)
    setReply(null)
    setLastRun(null)
    try {
      const result = await fetchArticle(articleUrl, setArticleStatus)
      setArticle(result)
      setTranscript(result.text)
      finalTranscriptRef.current = result.text
    } catch (err) {
      setError(
        err instanceof ArticleError || err instanceof Error
          ? err.message
          : t('error.article')
      )
    } finally {
      setIsFetchingArticle(false)
      setArticleStatus('')
    }
  }

  /** Fold one call's usage into the running totals so cost stays truthful. */
  const addUsage = (usage: Usage | null) => {
    if (!usage || !model) return
    const cost = costOf(model, usage)
    setLastRun((prev) =>
      prev
        ? {
            usage: {
              inputTokens: prev.usage.inputTokens + usage.inputTokens,
              outputTokens: prev.usage.outputTokens + usage.outputTokens,
              reasoningTokens: (prev.usage.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
              reportedCostUsd:
                typeof prev.usage.reportedCostUsd === 'number' || typeof usage.reportedCostUsd === 'number'
                  ? (prev.usage.reportedCostUsd ?? 0) + (usage.reportedCostUsd ?? 0)
                  : undefined,
            },
            cost: (prev.cost ?? 0) + (cost ?? 0),
          }
        : { usage, cost }
    )
    if (cost) setSessionCost((current) => current + cost)
  }

  const generateReply = async () => {
    const argument = transcript.trim()
    if (!argument) {
      setError(t('error.needArgument'))
      return
    }
    if (!model) {
      setError(t('error.needModel'))
      return
    }
    // No key on file: Instant mode picks up the reply instead of dead-ending here.
    const instant = provider.requiresKey && !apiKey

    setIsLoading(true)
    setError('')
    setReply(null)
    setLastRun(null)
    setShareUrl('')
    setIsBriefingOpen(false)
    setBriefingError('')
    setShowClaims(false)
    setInstantDone(null)
    // A BYOK run makes any earlier Instant quota/exhaustion state stale — a
    // key on file means neither applies anymore.
    if (!instant) setInstantQuota(null)

    // Article text is delimited so the model can tell content from instructions.
    // Neutralise any closing tag in the page content itself, or it could break
    // out of the delimiter and have its text read as instructions.
    const isArticle = !!article
    const sealDelimiter = (value: string) => value.replace(/<\/?article/gi, '&lt;article')
    const userContent = isArticle
      ? `<article title="${sealDelimiter(article.title).replace(/"/g, "'")}">\n${sealDelimiter(argument)}\n</article>`
      : argument

    // The publication host is venue context the app already has and used to withhold
    let venue: string | undefined
    if (article?.url) {
      try {
        venue = new URL(article.url).hostname.replace(/^www\./, '')
      } catch {
        venue = undefined
      }
    }
    // The message follows the argument's language; the private notes follow the
    // sender's interface language. They differ precisely when someone answers an
    // argument written in a language other than the one they are reading the app in.
    const promptContext: PromptContext = {
      audience,
      venue,
      isArticle,
      replyLanguage,
      briefingLanguage: language,
    }

    try {
      // Evidence first: search results become the ONLY citable set, which is what
      // makes a fabricated URL structurally impossible rather than merely discouraged.
      let citations: Citation[] = []
      let searchNote = ''
      if (useSources) {
        setProviderStatus(t('generate.searching'))
        try {
          const found = await searchForEvidence(queryFor(argument, article?.title), {
            apiKey: loadTavilyKey(),
          })
          citations = found.citations
          if (found.note) searchNote = found.note
        } catch (err) {
          // Never fail a reply because search failed — fall back to the model's own
          // search where it has one, and say so if there is nothing at all.
          searchNote = err instanceof SearchError ? err.message : t('error.searchUnavailable')
        }
      }

      // Only ask the model to search if we could not supply sources ourselves
      const modelSearch = useSources && !citations.length && canSearchWeb(provider, model)
      lastRequestRef.current = { userContent, promptContext, citations, modelSearch }

      if (instant) {
        // Instant mode: no key, our server pays. One upstream call — the
        // honest check arrives folded into the same envelope (see instantPrompt).
        setProviderStatus(t('instant.working'))
        const token = await getTurnstileToken(localStorage.getItem('ai_provider') || 'anon')
        const instantReply = await generateInstant({
          argument,
          recipientLine: audience || undefined,
          replyLanguage: promptContext.replyLanguage,
          briefingLanguage: promptContext.briefingLanguage,
          citations,
          turnstileToken: token || undefined,
        })
        const parsed = parseMessage(instantReply.text)
        const verified = stripUnverifiedUrls(parsed.message, citations)
        setReply({
          message: verified.text,
          strategy: parsed.strategy,
          context: parsed.context,
          citations: verified.used,
          strippedUrls: verified.strippedUrls,
          unusedCitations: [],
          weakLink: section(instantReply.text, 'WEAKLINK'),
          toVerify: [],
          instant: true,
        })
        setInstantQuota({ remaining: instantReply.remaining, cap: instantReply.cap })
        setInstantDone(null)
        if (searchNote) setError(searchNote)
        return
      }

      setProviderStatus(t('generate.writing'))
      const call = (system: string, webSearch = false) =>
        generateText({
          provider,
          model,
          apiKey,
          system,
          userContent,
          length: 'detailed',
          webSearch,
          onStatus: setProviderStatus,
        })

      // Two eager calls, as before — the message and the honest check run together
      let messageResult, checkResult
      if (supportsParallelCalls(provider)) {
        ;[messageResult, checkResult] = await Promise.all([
          call(messagePrompt(promptContext, citations), modelSearch),
          call(honestCheckPrompt(promptContext)),
        ])
      } else {
        messageResult = await call(messagePrompt(promptContext, citations), modelSearch)
        checkResult = await call(honestCheckPrompt(promptContext))
      }

      const parsed = parseMessage(messageResult.text)
      const check = parseCheck(checkResult.text)

      // Enforce the citation set: strip any URL the model invented
      const allowed = citations.length ? citations : messageResult.citations ?? []
      const verified = stripUnverifiedUrls(parsed.message, allowed)
      const usedKeys = new Set(verified.used.map((c) => c.url))

      setReply({
        message: verified.text,
        strategy: parsed.strategy,
        context: parsed.context,
        citations: verified.used,
        strippedUrls: verified.strippedUrls,
        unusedCitations: allowed.filter((c) => !usedKeys.has(c.url)),
        weakLink: check.weakLink,
        toVerify: check.toVerify,
      })
      if (searchNote) setError(searchNote)

      addUsage(messageResult.usage)
      addUsage(checkResult.usage)
    } catch (err) {
      if (err instanceof InstantQuotaError) {
        setInstantDone({ resetAt: err.resetAt, signedIn: err.signedIn })
      } else if (err instanceof InstantTurnstileError) {
        setError(t('instant.turnstile'))
      } else if (err instanceof DOMException && err.name === 'TimeoutError') {
        setError(t('error.timeout'))
      } else {
        setError(err instanceof Error ? err.message : instant ? t('instant.error') : t('error.generic'))
      }
    } finally {
      setIsLoading(false)
      setProviderStatus('')
    }
  }

  /**
   * Their strongest case, and where the message answers it. Briefing only — never
   * sendable. Generated on first expand, so replies nobody inspects cost nothing extra.
   */
  const toggleBriefing = async () => {
    // No key paid for an Instant reply, and there is nothing to steelman it
    // against on our own dime — the panel itself stays hidden for these
    // replies, but guard here too in case this is ever reached another way.
    if (reply?.instant) return
    const opening = !isBriefingOpen
    setIsBriefingOpen(opening)
    const context = lastRequestRef.current
    if (!opening || !context || !model || !reply || reply.theirCase || briefingLoading) return

    setBriefingLoading(true)
    setBriefingError('')
    try {
      const result = await generateText({
        provider,
        model,
        apiKey,
        system: theirCasePrompt(context.promptContext, reply.message),
        userContent: context.userContent,
        length: 'detailed',
        onStatus: setProviderStatus,
      })
      const parsed = parseTheirCase(result.text)
      setReply((prev) => (prev ? { ...prev, theirCase: parsed.theirCase, answered: parsed.answered } : prev))
      addUsage(result.usage)
    } catch (err) {
      setBriefingError(err instanceof Error ? err.message : t('error.briefing'))
    } finally {
      setBriefingLoading(false)
      setProviderStatus('')
    }
  }

  const saveTavilyKey = () => {
    const key = tavilyDraft.trim()
    if (key) localStorage.setItem(TAVILY_KEY_STORAGE, key)
    else localStorage.removeItem(TAVILY_KEY_STORAGE)
    afterKeyChange()
    setTavilySaved(true)
    setTimeout(() => setTavilySaved(false), 2000)
  }

  const copyMessage = async () => {
    if (!reply) return
    try {
      // Only the message — never the strategy line, weak-link note, or briefing
      await navigator.clipboard.writeText(reply.message)
      setMessageCopied(true)
      setTimeout(() => setMessageCopied(false), 2500)
    } catch {
      setMessageCopied(false)
    }
  }

  const applyProvider = (next: ReturnType<typeof getProvider>) => {
    const nextModels = modelsFor(next)
    const storedKey = loadStoredKey(next.id)
    // Resolve the id ONCE and persist that. Writing next.defaultModel unconditionally
    // could store an id absent from a cached catalog, and the reload path re-adopts it
    // without a membership check — leaving no model selected at all.
    const nextModelId = nextModels.some((m) => m.id === next.defaultModel) ? next.defaultModel : nextModels[0].id
    setProviderId(next.id)
    setModels(nextModels)
    setModelId(nextModelId)
    setCatalogFetchedAt(loadCachedCatalog(next.id)?.fetchedAt ?? null)
    setApiKey(storedKey)
    setShowApiKeyInput(next.requiresKey && !storedKey)
    setKeyDraft('')
    setError('')
    setLastRun(null)
    localStorage.setItem('ai_provider', next.id)
    localStorage.setItem('ai_model', nextModelId)
  }

  /**
   * Change interface language. Saved locally so it survives a reload while signed
   * out, and to the account so it survives a sign-in on a different device.
   */
  const handleLanguageChange = (next: string) => {
    setLanguage(next)
    try {
      localStorage.setItem(LANGUAGE_STORAGE, next)
    } catch {
      // storage blocked — the choice still applies for this session
    }
    if (auth.user) void saveLanguagePreference(next)
  }

  const handleSignOut = async () => {
    await signOut()
    // Drop the derived key too. Without this, "sign out" on a shared machine would
    // leave the next person able to decrypt the vault by simply signing back in.
    await forgetDeviceKey()
    setAuth((current) => ({ ...current, user: null }))
    setVaultState('none')
    setVaultBlob(null)
    setVaultPrompt(null)
  }

  /**
   * Push the current keys into the vault. Called after any key change while
   * unlocked, so the vault never drifts from what this browser is actually using.
   */
  const syncVault = async () => {
    if (!auth.user || vaultState !== 'unlocked' || !vaultBlob) return
    const bundle = collectKeyBundle()
    if (!Object.keys(bundle).length) return
    setVaultState('saving')
    try {
      const sealed = await resealWithDeviceKey(bundle, vaultBlob)
      if (sealed) {
        await saveVault(sealed)
        setVaultBlob(sealed)
      }
    } catch {
      // A failed sync is not worth interrupting the user; the keys still work locally
    } finally {
      setVaultState('unlocked')
    }
  }

  const handleVaultSubmit = async (passphrase: string) => {
    setVaultBusy(true)
    setVaultError('')
    try {
      if (vaultPrompt === 'setup') {
        const bundle = collectKeyBundle()
        const sealed = await seal(bundle, passphrase)
        await saveVault(sealed)
        setVaultBlob(sealed)
        setVaultState('unlocked')
      } else if (vaultBlob) {
        const bundle = await unlock(vaultBlob, passphrase)
        applyKeyBundle(bundle)
        setApiKey(loadStoredKey(providerId))
        setTavilyDraft(loadTavilyKey())
        setShowApiKeyInput(provider.requiresKey && !loadStoredKey(providerId))
        setVaultState('unlocked')
      }
      setVaultPrompt(null)
    } catch (err) {
      setVaultError(
        err instanceof WrongPassphraseError ? t('account.wrongPassphrase') : t('error.generic')
      )
    } finally {
      setVaultBusy(false)
    }
  }

  const handleForgetVault = async () => {
    if (!window.confirm(t('account.forgetKeysConfirm'))) return
    await deleteVault()
    setVaultBlob(null)
    setVaultState('none')
    setVaultPrompt(null)
  }

  /** Back to the curated list after a refresh pulled in the provider's whole catalog. */
  const handleResetCatalog = () => {
    clearCachedCatalog(provider.id)
    setModels(provider.models)
    setCatalogFetchedAt(null)
    if (!provider.models.some((m) => m.id === modelId)) handleModelChange(provider.defaultModel)
  }

  const handleModelChange = (id: string) => {
    setModelId(id)
    setLastRun(null)
    localStorage.setItem('ai_model', id)
  }

  const handleRefreshModels = async () => {
    if (provider.requiresKey && !apiKey && provider.id !== 'openrouter') {
      setError(t('error.needKeyForModels'))
      setShowApiKeyInput(true)
      return
    }
    setIsRefreshing(true)
    setError('')
    try {
      const live = await fetchLiveModels(provider, apiKey)
      const { fetchedAt } = saveCachedCatalog(provider.id, live)
      setModels(live)
      setCatalogFetchedAt(fetchedAt)
      if (!live.some((m) => m.id === modelId)) handleModelChange(live[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.refreshModels'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const openApiKeyForm = () => {
    setKeyDraft(apiKey)
    setShowApiKeyInput(true)
  }

  const handleSaveApiKey = () => {
    const key = keyDraft.trim()
    if (!key) {
      setError(t('error.needKey'))
      return
    }
    localStorage.setItem(keyStorageId(provider.id), key)
    setApiKey(key)
    setShowApiKeyInput(false)
    setError('')
    afterKeyChange()
  }

  /**
   * A key just changed. If the vault is open, mirror it; if the user is signed in
   * with no vault yet, this is the natural moment to offer one — they have just
   * demonstrated they have a key worth not typing again.
   */
  const afterKeyChange = () => {
    if (vaultState === 'unlocked') void syncVault()
    else if (auth.user && vaultState === 'none' && !vaultBlob) setVaultPrompt('setup')
  }

  const estimate = estimateCost(model, transcript)
  const costLine = () => {
    if (provider.kind === 'webllm') return t('settings.costFreeLocal')
    if (model?.unknownPrice) return t('settings.costUnknown')
    if (isFreeModel(model)) return t('settings.costFreeModel')
    if (estimate === null) return null
    const cost = formatCost(estimate)
    return model?.reasoning ? t('settings.costIncludesReasoning', { cost }) : t('settings.costPerReply', { cost })
  }

  /** Which language the sendable message will be written in. */
  const detectedLanguage = useMemo(() => detectLanguage(transcript).language, [transcript])
  const replyLanguage = replyLanguageOverride || detectedLanguage

  const handleUpdateClick = () => {
    const waiting = waitingWorkerRef.current
    if (waiting) {
      // The controllerchange listener reloads once the new worker activates
      waiting.postMessage({ type: 'SKIP_WAITING' })
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="container">
      <AccountBar
        t={t}
        language={language}
        onLanguageChange={handleLanguageChange}
        auth={auth}
        vaultState={vaultState}
        onSignIn={() => signIn('google')}
        onSignOut={handleSignOut}
        onUnlockClick={() => setVaultPrompt('unlock')}
      />

      {updateAvailable && (
        <div className="success update-banner" role="status">
          {t('app.updateAvailable')}{' '}
          <button className="link-button" onClick={handleUpdateClick}>
            {t('app.reload')}
          </button>
        </div>
      )}
      <h1>{t('app.title')}</h1>
      <p className="subtitle">{t('app.subtitle')}</p>

      {vaultPrompt && (
        <VaultDialog
          t={t}
          mode={vaultPrompt}
          busy={vaultBusy}
          error={vaultError}
          onSubmit={handleVaultSubmit}
          onDismiss={() => {
            setVaultPrompt(null)
            setVaultError('')
          }}
          onForget={vaultPrompt === 'unlock' ? handleForgetVault : undefined}
        />
      )}

      {sharedError && (
        <div className="error" role="alert">
          ⚠️ {sharedError}{' '}
          <button className="link-button" onClick={dismissShared}>
            {t('share.startFresh')}
          </button>
        </div>
      )}

      {shared && (
        <div className="shared-view">
          <div className="shared-banner">
            <strong>{t('share.banner')}</strong>
            <span className="token-detail">
              {shared.modelLabel
                ? t('share.generatedWith', { model: shared.modelLabel })
                : t('share.generatedWithAI')}
              {shared.createdAt ? ` · ${new Date(shared.createdAt).toLocaleDateString(language)}` : ''}
            </span>
          </div>

          <h3 className="shared-heading">{t('share.theArgument')}</h3>
          {shared.articleUrl && (
            <p className="key-help">
              {t('share.from')}{' '}
              <a href={shared.articleUrl} target="_blank" rel="noopener noreferrer nofollow">
                {shared.articleTitle || hostOf(shared.articleUrl)}
              </a>
            </p>
          )}
          <div className="transcript-area shared-argument">{shared.argument}</div>

          <h3 className="shared-heading">{t('share.theReply')}</h3>
          {/* Current shape is a single message; older links carry brief + detailed */}
          {shared.message ? (
            <div className="rebuttal-detailed-content shared-detailed">
              <RichText text={shared.message} />
              <SourceList citations={shared.citations} title={t('reply.sourcesTitle')} />
            </div>
          ) : (
            <>
              {shared.brief && <div className="rebuttal-brief">{shared.brief}</div>}
              {shared.detailed && (
                <div className="rebuttal-detailed-content shared-detailed">
                  <RichText text={shared.detailed} />
                  <SourceList citations={shared.citations} title={t('reply.sourcesTitle')} />
                </div>
              )}
            </>
          )}

          {shared.steelman && (
            <>
              <h3 className="shared-heading">{t('share.steelmanHeading')}</h3>
              <div className="rebuttal-detailed-content steelman-content shared-detailed">
                <RichText text={shared.steelman} />
                <SourceList citations={shared.steelmanCitations} title={t('reply.sourcesTitle')} />
              </div>
            </>
          )}

          <button className="button button-primary shared-cta" onClick={dismissShared}>
            {t('share.writeYourOwn')}
          </button>
        </div>
      )}

      {!shared && (
        <>
      <button
        type="button"
        className="expander-header settings-header"
        onClick={() => setShowSettings(!showSettings)}
        aria-expanded={showSettings}
        aria-controls="ai-settings"
      >
        <span className={`expander-arrow ${showSettings ? 'open' : ''}`}>▼</span>
        <span className="settings-summary">
          <span className="settings-model">{model?.label ?? t('settings.chooseModel')}</span>
          <span className="settings-blurb">{describeModel(model, provider)}</span>
        </span>
        <span className="settings-action">{showSettings ? t('settings.hide') : t('settings.change')}</span>
      </button>

      <div id="ai-settings" className={`collapsible ${showSettings ? '' : 'collapsed'}`} aria-hidden={!showSettings}>
        <div className="collapsible-clip">
          <div className="settings-body">
      <div className="input-section">
        <div className="provider-grid">
          <div>
            <label className="label" htmlFor="ai-provider">
              {t('settings.provider')}
            </label>
            <select
              id="ai-provider"
              className="select"
              value={providerId}
              onChange={(e) => applyProvider(getProvider(e.target.value))}
              disabled={isLoading}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label-row">
              <label className="label" htmlFor="ai-model">
                {t('settings.model')}
              </label>
              {provider.modelsUrl && (
                <button
                  className="link-button subtle"
                  onClick={handleRefreshModels}
                  disabled={isLoading || isRefreshing}
                  title={t('settings.refreshTitle')}
                >
                  {isRefreshing ? t('settings.refreshing') : t('settings.refresh')}
                </button>
              )}
            </div>
            <select
              id="ai-model"
              className="select"
              value={modelId}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={isLoading}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="meta-row">
          {costLine() && <span className="cost-estimate">{costLine()}</span>}
          {catalogFetchedAt && (
            <span className="catalog-age">
              {t('settings.modelsUpdated', {
                count: models.length,
                date: new Date(catalogFetchedAt).toLocaleDateString(language),
              })}{' '}
              ·{' '}
              <button
                className="link-button subtle"
                onClick={handleResetCatalog}
                disabled={isLoading || isRefreshing}
                title={t('settings.useShortListTitle')}
              >
                {t('settings.useShortList')}
              </button>
            </span>
          )}
        </div>
        {provider.note && <p className="key-help">{provider.note}</p>}
      </div>

      {provider.requiresKey && showApiKeyInput && (
        <div className="input-section">
          <label className="label" htmlFor="api-key">
            {t('settings.apiKeyLabel', { provider: provider.label.replace(/ \(.*\)$/, '') })}
          </label>
          <div className="controls">
            <input
              id="api-key"
              className="text-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={provider.keyPlaceholder || t('settings.apiKeyPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
            />
            <button className="button button-primary" onClick={handleSaveApiKey}>
              {t('settings.saveKey')}
            </button>
            {apiKey && (
              <button className="button button-secondary" onClick={() => setShowApiKeyInput(false)}>
                {t('settings.cancel')}
              </button>
            )}
          </div>
          <p className="key-help">
            {vaultState === 'unlocked'
              ? t('settings.keyHelpSynced')
              : provider.keyIsFree
                ? t('settings.keyHelpFree')
                : t('settings.keyHelpPaid')}
            {provider.keyUrl && (
              <>
                {t('settings.getOneFrom')}{' '}
                <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">
                  {provider.keyUrl.replace(/^https:\/\//, '')}
                </a>
                .{' '}
              </>
            )}
            {t('settings.preferNoKey', { option: t('settings.localOption') })}
          </p>
        </div>
      )}

      {provider.requiresKey && !showApiKeyInput && (
        <button className="button button-secondary change-key-button" onClick={openApiKeyForm}>
          {t('settings.changeKey')}
        </button>
      )}

      <div className="input-section">
        <label className="label" htmlFor="tavily-key">
          {t('settings.tavilyLabel')} <span className="label-optional">{t('settings.optional')}</span>
        </label>
        <div className="controls">
          <input
            id="tavily-key"
            className="text-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={tavilyDraft}
            onChange={(e) => setTavilyDraft(e.target.value)}
            placeholder="tvly-…"
            onKeyDown={(e) => e.key === 'Enter' && saveTavilyKey()}
          />
          <button className="button button-secondary" onClick={saveTavilyKey}>
            {tavilySaved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>
        <p className="key-help">
          {/* Split on the {link} placeholder so the anchor survives translation */}
          {t('settings.tavilyHelp').split('{link}').map((part, i, all) => (
            <span key={i}>
              {part}
              {i < all.length - 1 && (
                <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
                  Tavily
                </a>
              )}
            </span>
          ))}
        </p>
      </div>
          </div>
        </div>
      </div>

      <div className="input-section">
        <div className="label-row">
          <label className="label" htmlFor="argument-input">
            {t('input.label')}
          </label>
          <div className="mode-toggle" role="group" aria-label={t('input.modeGroup')}>
            <button
              className={`mode-button ${inputMode === 'text' ? 'active' : ''}`}
              onClick={() => {
                setInputMode('text')
                // Switching away means the user is supplying their own argument,
                // so the article-specific prompt must no longer apply
                setArticle(null)
              }}
              disabled={isLoading}
              aria-pressed={inputMode === 'text'}
            >
              {t('input.modeText')}
            </button>
            <button
              className={`mode-button ${inputMode === 'url' ? 'active' : ''}`}
              onClick={() => setInputMode('url')}
              disabled={isLoading}
              aria-pressed={inputMode === 'url'}
            >
              {t('input.modeUrl')}
            </button>
          </div>
        </div>

        {inputMode === 'url' ? (
          <>
            <div className="controls">
              <input
                id="article-url"
                className="text-input"
                type="url"
                inputMode="url"
                spellCheck={false}
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder="https://example.com/the-article"
                onKeyDown={(e) => e.key === 'Enter' && !isFetchingArticle && handleFetchArticle()}
                disabled={isLoading || isFetchingArticle}
              />
              <button
                className="button button-primary"
                onClick={handleFetchArticle}
                disabled={isLoading || isFetchingArticle || !articleUrl.trim()}
              >
                {isFetchingArticle ? (
                  <>
                    <span className="spinner"></span>
                    {t('input.fetching')}
                  </>
                ) : (
                  t('input.fetchArticle')
                )}
              </button>
            </div>
            {isFetchingArticle && articleStatus && (
              <p className="provider-status" role="status">
                {articleStatus}
              </p>
            )}
            {article && (
              <div className="article-badge" role="status">
                <strong>✓ {article.title}</strong>
                <span className="token-detail">
                  {t('input.articleWords', { count: article.words.toLocaleString(language) })}
                  {article.via === 'archive' && t('input.articleViaArchive')}
                  {article.truncated && t('input.articleTruncated')}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="controls">
            <button
              className={`button ${isRecording ? 'button-danger' : 'button-primary'}`}
              onClick={toggleRecording}
              disabled={isLoading}
              aria-pressed={isRecording}
            >
              {isRecording ? t('input.stopRecording') : t('input.startRecording')}
            </button>
            {isRecording && (
              <div className="recording-indicator" role="status">
                <span className="recording-dot"></span>
                {t('input.recording')}
              </div>
            )}
            {transcript && !isRecording && (
              <button className="button button-secondary" onClick={clearTranscript} disabled={isLoading}>
                {t('input.clear')}
              </button>
            )}
          </div>
        )}

        <textarea
          id="argument-input"
          className="transcript-area"
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value)
            finalTranscriptRef.current = e.target.value
            // Clearing the box out entirely discards the article context too
            if (!e.target.value.trim()) setArticle(null)
          }}
          placeholder={inputMode === 'url' ? t('input.placeholderUrl') : t('input.placeholderText')}
          readOnly={isRecording}
          disabled={isLoading}
          rows={inputMode === 'url' ? 8 : 4}
        />
        {inputMode === 'url' && transcript && (
          <button className="button button-secondary clear-article" onClick={clearTranscript} disabled={isLoading}>
            {t('input.clear')}
          </button>
        )}
      </div>

      <div className="input-section audience-section">
        <label className="label" htmlFor="audience-input">
          {t('audience.label')} <span className="label-optional">{t('audience.optional')}</span>
        </label>
        <input
          id="audience-input"
          className="text-input"
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={t('audience.placeholder')}
          disabled={isLoading}
        />
        <p className="key-help">{t('audience.help')}</p>
      </div>

      {/* Which language the reply will be written in. Shown only once there is enough
          text to have detected something, and always overridable — a wrong guess here
          would send someone a reply in a language they do not speak. */}
      {transcript.trim().length > 40 && (
        <div className="reply-language" role="status">
          🌐 {t('replyLang.detected', { language: displayLanguageName(replyLanguage, language) })}{' '}
          <button className="link-button subtle" onClick={() => setShowReplyLangPicker(!showReplyLangPicker)}>
            {t('replyLang.change')}
          </button>
          {showReplyLangPicker && (
            <span className="reply-language-picker">
              <label className="visually-hidden" htmlFor="reply-language">
                {t('replyLang.label')}
              </label>
              <select
                id="reply-language"
                className="language-select"
                value={replyLanguageOverride}
                onChange={(e) => setReplyLanguageOverride(e.target.value)}
                disabled={isLoading}
              >
                <option value="">
                  {t('replyLang.auto', { language: displayLanguageName(detectedLanguage, language) })}
                </option>
                {SUPPORTED.map((code) => (
                  <option key={code} value={code}>
                    {displayLanguageName(code, language)}
                  </option>
                ))}
              </select>
              <span className="key-help">{t('replyLang.help')}</span>
            </span>
          )}
        </div>
      )}

      <label className="sources-toggle">
        <input
          type="checkbox"
          checked={useSources}
          onChange={(e) => setUseSources(e.target.checked)}
          disabled={isLoading}
        />
        <span>
          {t('sources.toggle')}
          <span className="sources-hint">{t('sources.hint')}</span>
        </span>
      </label>

      <button
        className="button button-primary submit-button"
        onClick={generateReply}
        disabled={!transcript.trim() || isLoading || isRecording}
      >
        {isLoading ? (
          <>
            <span className="spinner"></span>
            {t('generate.working')}
          </>
        ) : (
          t('generate.submit')
        )}
      </button>
      {isLoading && providerStatus && (
        <p className="provider-status" role="status">
          {providerStatus}
        </p>
      )}
      <span className="visually-hidden" role="status">
        {isLoading ? t('generate.srStatus') : ''}
      </span>

      {instantQuota && !instantDone && (
        <p className="instant-quota">
          {t(instantQuota.remaining === 1 ? 'instant.leftOne' : 'instant.left', { n: instantQuota.remaining })}
        </p>
      )}

      {instantDone && (
        <div className="instant-done">
          <h3>{t('instant.done.title')}</h3>
          <p>
            {t('instant.done.body', {
              time: instantDone.resetAt
                ? new Date(instantDone.resetAt).toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' })
                : '',
            })}
          </p>
          {!auth.user && auth.configured && (
            <button className="button button-primary" onClick={() => signIn('google')}>
              {t('instant.done.signIn')}
            </button>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setShowSettings(true)
              setShowApiKeyInput(true)
            }}
          >
            {t('instant.done.byok')}
          </button>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          ⚠️ {error}
        </div>
      )}

      {reply && (
        <div className="rebuttal-section">
          {reply.strategy && <p className="strategy-line">{reply.strategy}</p>}

          {reply.context && (
            <div className="context-chips">
              {reply.context.goal && <span className="chip">🎯 {reply.context.goal}</span>}
              {reply.context.audience && <span className="chip">👤 {reply.context.audience}</span>}
              {reply.context.length && <span className="chip">📏 {reply.context.length}</span>}
            </div>
          )}

          <div className="send-zone">
            <div className="send-zone-head">
              <h2 className="rebuttal-title">{t('reply.title')}</h2>
              <button className="button button-primary copy-message" onClick={copyMessage}>
                {messageCopied ? t('reply.copied') : t('reply.copy')}
              </button>
            </div>
            <div className="message-body">
              <RichText text={reply.message} />
            </div>

            <button
              type="button"
              className={`claim-badge ${reply.strippedUrls.length ? 'claim-badge-warn' : ''}`}
              onClick={() => setShowClaims(!showClaims)}
              aria-expanded={showClaims}
              aria-controls="claim-panel"
            >
              {reply.citations.length === 0
                ? t('reply.noSources')
                : reply.citations.length === 1
                  ? t('reply.sourcesCitedOne')
                  : t('reply.sourcesCited', { count: reply.citations.length })}
              {reply.strippedUrls.length === 1 && t('reply.linksRemovedOne')}
              {reply.strippedUrls.length > 1 && t('reply.linksRemoved', { count: reply.strippedUrls.length })}
              {reply.toVerify?.length ? t('reply.toCheck', { count: reply.toVerify.length }) : ''}
            </button>

            <div id="claim-panel" className={`collapsible ${showClaims ? '' : 'collapsed'}`} aria-hidden={!showClaims}>
              <div className="collapsible-clip">
                <div className="claim-panel-body">
                  {reply.citations.length > 0 && <SourceList citations={reply.citations} title={t('reply.sourcesTitle')} />}
                  {reply.strippedUrls.length > 0 && (
                    <p className="claim-warn">
                      {reply.strippedUrls.length === 1
                        ? t('reply.claimWarnOne')
                        : t('reply.claimWarn', { count: reply.strippedUrls.length })}
                    </p>
                  )}
                  {reply.toVerify?.length ? (
                    <>
                      <div className="sources-title">{t('reply.checkBeforeSending')}</div>
                      <ul className="sources-list">
                        {reply.toVerify.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {!reply.citations.length && !reply.toVerify?.length && (
                    <p className="token-detail">{t('reply.noSourcesRetrieved')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {reply.weakLink && (
            <div className="weak-link" role="note">
              <div className="weak-link-title">{t('weakLink.title')}</div>
              <RichText text={reply.weakLink} />
            </div>
          )}

          {/* Instant replies had no key paying for a second call, so there is nothing
              behind this expander — hide it rather than offer something that would
              silently do nothing. */}
          {!reply.instant && (
            <>
              <button
                type="button"
                className="expander-header briefing-header"
                onClick={toggleBriefing}
                aria-expanded={isBriefingOpen}
                aria-controls="briefing-panel"
                disabled={briefingLoading}
              >
                <span className={`expander-arrow ${isBriefingOpen ? 'open' : ''}`}>▼</span>
                <span className="expander-text">
                  {t('briefing.title')}
                  {briefingLoading && <span className="spinner steelman-spinner"></span>}
                </span>
                <span className="briefing-tag">{t('briefing.tag')}</span>
              </button>

              <div
                id="briefing-panel"
                className={`collapsible ${isBriefingOpen ? '' : 'collapsed'}`}
                aria-hidden={!isBriefingOpen}
              >
                <div className="collapsible-clip">
                  <div className="rebuttal-detailed-content steelman-content">
                    {briefingError ? (
                      <span className="steelman-error">⚠️ {briefingError}</span>
                    ) : reply.theirCase ? (
                      <>
                        <RichText text={reply.theirCase} />
                        {reply.answered?.length ? (
                          <>
                            <div className="sources-title">{t('briefing.answered')}</div>
                            <ul className="sources-list answered-list">
                              {reply.answered.map((line, i) => (
                                <li key={i} className={/unanswered/i.test(line) ? 'unanswered' : undefined}>
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {reply.unusedCitations.length > 0 && (
                          <>
                            <div className="sources-title">{t('briefing.unused')}</div>
                            <SourceList citations={reply.unusedCitations} title={t('reply.sourcesTitle')} />
                          </>
                        )}
                      </>
                    ) : (
                      <span className="token-detail">{t('briefing.building')}</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="share-row">
            {shareUrl ? (
              <div className="share-result">
                <div className="controls">
                  <input className="text-input" value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
                  <button className="button button-secondary" onClick={copyShareUrl}>
                    {shareCopied ? t('reply.copied') : t('share.copyLink')}
                  </button>
                </div>
                <p className="key-help">{t('share.help')}</p>
              </div>
            ) : (
              <>
                <button className="button button-secondary" onClick={handleShare} disabled={isSharing}>
                  {isSharing ? (
                    <>
                      <span className="spinner"></span>
                      {t('share.creating')}
                    </>
                  ) : (
                    t('share.get')
                  )}
                </button>
                <span className="token-detail share-caveat">{t('share.caveat')}</span>
              </>
            )}
          </div>

          {lastRun && (
            <p className="cost-actual">
              {t('cost.actual')} <strong>{formatCost(lastRun.cost)}</strong>{' '}
              <span className="token-detail">
                {lastRun.usage.reasoningTokens
                  ? t('cost.tokensWithReasoning', {
                      in: lastRun.usage.inputTokens.toLocaleString(language),
                      out: lastRun.usage.outputTokens.toLocaleString(language),
                      reasoning: lastRun.usage.reasoningTokens.toLocaleString(language),
                    })
                  : t('cost.tokens', {
                      in: lastRun.usage.inputTokens.toLocaleString(language),
                      out: lastRun.usage.outputTokens.toLocaleString(language),
                    })}
              </span>
              {sessionCost > 0 && (
                <span className="token-detail">{t('cost.sessionTotal', { total: formatCost(sessionCost) })}</span>
              )}
            </p>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
