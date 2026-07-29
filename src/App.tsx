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
}

const keyStorageId = (providerId: string) => `api_key_${providerId}`

function loadStoredKey(providerId: string): string {
  return (localStorage.getItem(keyStorageId(providerId)) || '').trim()
}

// One-time migration from the single-provider era
if (localStorage.getItem('anthropic_api_key') && !localStorage.getItem(keyStorageId('anthropic'))) {
  localStorage.setItem(keyStorageId('anthropic'), (localStorage.getItem('anthropic_api_key') || '').trim())
  localStorage.removeItem('anthropic_api_key')
}

const storedProviderId = () => localStorage.getItem('ai_provider') || 'anthropic'

/** Real, retrieved sources. Rendered only when the model actually returned some. */
function SourceList({ citations }: { citations?: Citation[] }) {
  if (!citations?.length) return null
  return (
    <div className="sources">
      <div className="sources-title">Sources</div>
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
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone access was denied. Allow microphone access for this site and try again.',
        'service-not-allowed': 'Microphone access was denied. Allow microphone access for this site and try again.',
        'audio-capture': 'No microphone was found. Check that a microphone is connected and try again.',
        network: 'The speech service hit a network error. Check your connection and try again.',
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
      .catch((err) => setSharedError(err instanceof Error ? err.message : 'That shared rebuttal could not be loaded.'))
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
      setError(err instanceof Error ? err.message : 'Could not publish this rebuttal.')
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
      setError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.')
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
          : 'Could not load that article. Try pasting the text instead.'
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
      setError('Add the argument you want to respond to first')
      return
    }
    if (!model) {
      setError('Please choose a model')
      return
    }
    if (provider.requiresKey && !apiKey) {
      setError(`Please set your ${provider.label.replace(/ \(.*\)$/, '')} API key`)
      setShowApiKeyInput(true)
      // The key form lives inside the collapsed settings — open it or the error
      // points at something the user cannot see
      setShowSettings(true)
      return
    }

    setIsLoading(true)
    setError('')
    setReply(null)
    setLastRun(null)
    setShareUrl('')
    setIsBriefingOpen(false)
    setBriefingError('')
    setShowClaims(false)

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
    const promptContext: PromptContext = { audience, venue, isArticle }

    try {
      // Evidence first: search results become the ONLY citable set, which is what
      // makes a fabricated URL structurally impossible rather than merely discouraged.
      let citations: Citation[] = []
      let searchNote = ''
      if (useSources) {
        setProviderStatus('Searching for evidence…')
        try {
          const found = await searchForEvidence(queryFor(argument, article?.title), {
            apiKey: loadTavilyKey(),
          })
          citations = found.citations
          if (found.note) searchNote = found.note
        } catch (err) {
          // Never fail a reply because search failed — fall back to the model's own
          // search where it has one, and say so if there is nothing at all.
          searchNote = err instanceof SearchError ? err.message : 'Evidence search was unavailable.'
        }
      }

      // Only ask the model to search if we could not supply sources ourselves
      const modelSearch = useSources && !citations.length && canSearchWeb(provider, model)
      lastRequestRef.current = { userContent, promptContext, citations, modelSearch }

      setProviderStatus('Writing the reply…')
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
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setError('The request timed out. Please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not write the reply')
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
      setBriefingError(err instanceof Error ? err.message : 'Could not build their case.')
    } finally {
      setBriefingLoading(false)
      setProviderStatus('')
    }
  }

  const saveTavilyKey = () => {
    const key = tavilyDraft.trim()
    if (key) localStorage.setItem(TAVILY_KEY_STORAGE, key)
    else localStorage.removeItem(TAVILY_KEY_STORAGE)
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
    setProviderId(next.id)
    setModels(nextModels)
    setModelId(nextModels.some((m) => m.id === next.defaultModel) ? next.defaultModel : nextModels[0].id)
    setCatalogFetchedAt(loadCachedCatalog(next.id)?.fetchedAt ?? null)
    setApiKey(storedKey)
    setShowApiKeyInput(next.requiresKey && !storedKey)
    setKeyDraft('')
    setError('')
    setLastRun(null)
    localStorage.setItem('ai_provider', next.id)
    localStorage.setItem('ai_model', next.defaultModel)
  }

  const handleModelChange = (id: string) => {
    setModelId(id)
    setLastRun(null)
    localStorage.setItem('ai_model', id)
  }

  const handleRefreshModels = async () => {
    if (provider.requiresKey && !apiKey && provider.id !== 'openrouter') {
      setError('Enter your API key first — the model list comes from the provider.')
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
      setError(err instanceof Error ? err.message : 'Could not refresh the model list')
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
      setError('Please enter a valid API key')
      return
    }
    localStorage.setItem(keyStorageId(provider.id), key)
    setApiKey(key)
    setShowApiKeyInput(false)
    setError('')
  }

  const handleUpdateClick = () => {
    const waiting = waitingWorkerRef.current
    if (waiting) {
      // The controllerchange listener reloads once the new worker activates
      waiting.postMessage({ type: 'SKIP_WAITING' })
    } else {
      window.location.reload()
    }
  }

  const estimate = estimateCost(model, transcript)
  const costLine = () => {
    if (provider.kind === 'webllm') return 'Free — runs on your device, nothing is billed'
    if (model?.unknownPrice) return 'Pricing unknown for this model'
    if (isFreeModel(model)) return 'Free model — no charge'
    if (estimate === null) return null
    return `≈ ${formatCost(estimate)} per reply${model?.reasoning ? ' (includes hidden reasoning tokens)' : ''}`
  }

  return (
    <div className="container">
      {updateAvailable && (
        <div className="success update-banner" role="status">
          🎉 A new version is available!{' '}
          <button className="link-button" onClick={handleUpdateClick}>
            Reload
          </button>
        </div>
      )}
      <h1>🎤 Rebuttal Generator</h1>
      <p className="subtitle">Write the reply that actually changes their mind</p>

      {sharedError && (
        <div className="error" role="alert">
          ⚠️ {sharedError}{' '}
          <button className="link-button" onClick={dismissShared}>
            Start fresh
          </button>
        </div>
      )}

      {shared && (
        <div className="shared-view">
          <div className="shared-banner">
            <strong>Someone shared this reply with you</strong>
            <span className="token-detail">
              {shared.modelLabel ? `Generated with ${shared.modelLabel}` : 'Generated with AI'}
              {shared.createdAt ? ` · ${new Date(shared.createdAt).toLocaleDateString()}` : ''}
            </span>
          </div>

          <h3 className="shared-heading">The argument</h3>
          {shared.articleUrl && (
            <p className="key-help">
              From{' '}
              <a href={shared.articleUrl} target="_blank" rel="noopener noreferrer nofollow">
                {shared.articleTitle || hostOf(shared.articleUrl)}
              </a>
            </p>
          )}
          <div className="transcript-area shared-argument">{shared.argument}</div>

          <h3 className="shared-heading">The reply</h3>
          {/* Current shape is a single message; older links carry brief + detailed */}
          {shared.message ? (
            <div className="rebuttal-detailed-content shared-detailed">
              <RichText text={shared.message} />
              <SourceList citations={shared.citations} />
            </div>
          ) : (
            <>
              {shared.brief && <div className="rebuttal-brief">{shared.brief}</div>}
              {shared.detailed && (
                <div className="rebuttal-detailed-content shared-detailed">
                  <RichText text={shared.detailed} />
                  <SourceList citations={shared.citations} />
                </div>
              )}
            </>
          )}

          {shared.steelman && (
            <>
              <h3 className="shared-heading">The strongest case FOR the argument</h3>
              <div className="rebuttal-detailed-content steelman-content shared-detailed">
                <RichText text={shared.steelman} />
                <SourceList citations={shared.steelmanCitations} />
              </div>
            </>
          )}

          <button className="button button-primary shared-cta" onClick={dismissShared}>
            ✍️ Write your own reply
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
          <span className="settings-model">{model?.label ?? 'Choose a model'}</span>
          <span className="settings-blurb">{describeModel(model, provider)}</span>
        </span>
        <span className="settings-action">{showSettings ? 'Hide' : 'Change'}</span>
      </button>

      <div id="ai-settings" className={`collapsible ${showSettings ? '' : 'collapsed'}`} aria-hidden={!showSettings}>
        <div className="collapsible-clip">
          <div className="settings-body">
      <div className="input-section">
        <div className="provider-grid">
          <div>
            <label className="label" htmlFor="ai-provider">
              AI Provider
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
                Model
              </label>
              {provider.modelsUrl && (
                <button
                  className="link-button subtle"
                  onClick={handleRefreshModels}
                  disabled={isLoading || isRefreshing}
                  title="Fetch the provider's current model list"
                >
                  {isRefreshing ? 'Refreshing…' : '↻ Refresh'}
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
              {models.length} models · updated {new Date(catalogFetchedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {provider.note && <p className="key-help">{provider.note}</p>}
      </div>

      {provider.requiresKey && showApiKeyInput && (
        <div className="input-section">
          <label className="label" htmlFor="api-key">
            {provider.label.replace(/ \(.*\)$/, '')} API Key
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
              placeholder={provider.keyPlaceholder || 'Enter your API key'}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
            />
            <button className="button button-primary" onClick={handleSaveApiKey}>
              Save Key
            </button>
            {apiKey && (
              <button className="button button-secondary" onClick={() => setShowApiKeyInput(false)}>
                Cancel
              </button>
            )}
          </div>
          <p className="key-help">
            {provider.keyIsFree
              ? 'This provider needs an API key even for its free models, but creating one is free — no payment details required. '
              : 'Your key is saved in this browser only, and sent only to this provider. You will not need to enter it again. '}
            {provider.keyUrl && (
              <>
                Get one from{' '}
                <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">
                  {provider.keyUrl.replace(/^https:\/\//, '')}
                </a>
                .{' '}
              </>
            )}
            Prefer no key at all? Pick <strong>Local in-browser (FREE, no key)</strong> in the AI Provider
            dropdown.
          </p>
        </div>
      )}

      {provider.requiresKey && !showApiKeyInput && (
        <button className="button button-secondary change-key-button" onClick={openApiKeyForm}>
          Change API Key
        </button>
      )}

      <div className="input-section">
        <label className="label" htmlFor="tavily-key">
          Evidence search key <span className="label-optional">optional</span>
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
            {tavilySaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <p className="key-help">
          Evidence search already works with no key at all. A free{' '}
          <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
            Tavily
          </a>{' '}
          key (1,000 searches a month, no card) only raises the rate limit if you hit it.
        </p>
      </div>
          </div>
        </div>
      </div>

      <div className="input-section">
        <div className="label-row">
          <label className="label" htmlFor="argument-input">
            What are you responding to?
          </label>
          <div className="mode-toggle" role="group" aria-label="Input mode">
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
              ✍️ Speak or type
            </button>
            <button
              className={`mode-button ${inputMode === 'url' ? 'active' : ''}`}
              onClick={() => setInputMode('url')}
              disabled={isLoading}
              aria-pressed={inputMode === 'url'}
            >
              🔗 Article URL
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
                    Fetching…
                  </>
                ) : (
                  'Fetch article'
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
                  {article.words.toLocaleString()} words
                  {article.via === 'archive' && ' · read from an Internet Archive snapshot'}
                  {article.truncated && ' · trimmed to keep the request small'}
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
              {isRecording ? '⏹ Stop Recording' : '🎙 Start Recording'}
            </button>
            {isRecording && (
              <div className="recording-indicator" role="status">
                <span className="recording-dot"></span>
                Recording…
              </div>
            )}
            {transcript && !isRecording && (
              <button className="button button-secondary" onClick={clearTranscript} disabled={isLoading}>
                Clear
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
          placeholder={
            inputMode === 'url'
              ? 'The article text will appear here once fetched — you can edit it before generating.'
              : 'Type the argument here, or use Start Recording to dictate it…'
          }
          readOnly={isRecording}
          disabled={isLoading}
          rows={inputMode === 'url' ? 8 : 4}
        />
        {inputMode === 'url' && transcript && (
          <button className="button button-secondary clear-article" onClick={clearTranscript} disabled={isLoading}>
            Clear
          </button>
        )}
      </div>

      <div className="input-section audience-section">
        <label className="label" htmlFor="audience-input">
          Who wrote it, and where? <span className="label-optional">optional — but it changes how this is written</span>
        </label>
        <input
          id="audience-input"
          className="text-input"
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g. my father-in-law, over text · a stranger on LinkedIn"
          disabled={isLoading}
        />
        <p className="key-help">
          Leave it blank and this gets inferred from the text. Saying who they are lets the reply use sources they
          already trust and match how they actually talk.
        </p>
      </div>

      <label className="sources-toggle">
        <input
          type="checkbox"
          checked={useSources}
          onChange={(e) => setUseSources(e.target.checked)}
          disabled={isLoading}
        />
        <span>
          Find real evidence to cite
          <span className="sources-hint">
            {' '}
            — searches the web first, and the reply may only cite what was actually found. Works on every model, no
            key needed.
          </span>
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
            Writing…
          </>
        ) : (
          '✨ Write my reply'
        )}
      </button>
      {isLoading && providerStatus && (
        <p className="provider-status" role="status">
          {providerStatus}
        </p>
      )}
      <span className="visually-hidden" role="status">
        {isLoading ? 'Generating rebuttal' : ''}
      </span>

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
              <h2 className="rebuttal-title">Your reply</h2>
              <button className="button button-primary copy-message" onClick={copyMessage}>
                {messageCopied ? '✓ Copied' : '📋 Copy message'}
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
              {reply.citations.length > 0
                ? `${reply.citations.length} source${reply.citations.length === 1 ? '' : 's'} cited`
                : 'No sources cited'}
              {reply.strippedUrls.length > 0 &&
                ` · ${reply.strippedUrls.length} unverified link${reply.strippedUrls.length === 1 ? '' : 's'} removed`}
              {reply.toVerify?.length ? ` · ${reply.toVerify.length} to check` : ''}
            </button>

            <div id="claim-panel" className={`collapsible ${showClaims ? '' : 'collapsed'}`} aria-hidden={!showClaims}>
              <div className="collapsible-clip">
                <div className="claim-panel-body">
                  {reply.citations.length > 0 && <SourceList citations={reply.citations} />}
                  {reply.strippedUrls.length > 0 && (
                    <p className="claim-warn">
                      The model produced {reply.strippedUrls.length} link
                      {reply.strippedUrls.length === 1 ? '' : 's'} that were not among the sources actually
                      retrieved. They were removed rather than shown to you, because an invented citation is
                      worse than none.
                    </p>
                  )}
                  {reply.toVerify?.length ? (
                    <>
                      <div className="sources-title">Check before sending</div>
                      <ul className="sources-list">
                        {reply.toVerify.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {!reply.citations.length && !reply.toVerify?.length && (
                    <p className="token-detail">
                      No sources were retrieved for this reply. Every factual claim in it is unverified — check
                      anything you plan to lean on.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {reply.weakLink && (
            <div className="weak-link" role="note">
              <div className="weak-link-title">⚠️ Before you send — the weak point in your position</div>
              <RichText text={reply.weakLink} />
            </div>
          )}

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
              Their best case — and where you answer it
              {briefingLoading && <span className="spinner steelman-spinner"></span>}
            </span>
            <span className="briefing-tag">for you — don’t send</span>
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
                        <div className="sources-title">Does your reply answer it?</div>
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
                        <div className="sources-title">Retrieved but not used</div>
                        <SourceList citations={reply.unusedCitations} />
                      </>
                    )}
                  </>
                ) : (
                  <span className="token-detail">Building their strongest case…</span>
                )}
              </div>
            </div>
          </div>

          <div className="share-row">
            {shareUrl ? (
              <div className="share-result">
                <div className="controls">
                  <input className="text-input" value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
                  <button className="button button-secondary" onClick={copyShareUrl}>
                    {shareCopied ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
                <p className="key-help">
                  Anyone with this link can read the argument and the rebuttal. It is unlisted — not indexed and not
                  browsable — but it is not private. Links expire after a year.
                </p>
              </div>
            ) : (
              <>
                <button className="button button-secondary" onClick={handleShare} disabled={isSharing}>
                  {isSharing ? (
                    <>
                      <span className="spinner"></span>
                      Creating link…
                    </>
                  ) : (
                    '🔗 Get a shareable link'
                  )}
                </button>
                <span className="token-detail share-caveat">
                  Publishes this argument and rebuttal so anyone with the link can read them
                </span>
              </>
            )}
          </div>

          {lastRun && (
            <p className="cost-actual">
              Cost: <strong>{formatCost(lastRun.cost)}</strong>{' '}
              <span className="token-detail">
                ({lastRun.usage.inputTokens.toLocaleString()} in / {lastRun.usage.outputTokens.toLocaleString()} out
                {lastRun.usage.reasoningTokens ? `, ${lastRun.usage.reasoningTokens.toLocaleString()} reasoning` : ''})
              </span>
              {sessionCost > 0 && <span className="token-detail"> · session total {formatCost(sessionCost)}</span>}
            </p>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
