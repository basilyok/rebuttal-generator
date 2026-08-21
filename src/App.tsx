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
  shorterPrompt,
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
  adoptKey,
  sealJson,
  openBlob,
  cachedKey,
  WrongPassphraseError,
  // Only the DEK tag is named here now: every seal site takes its era from
  // sealEra() rather than choosing a constant, which is the point of the helper.
  BLOB_VERSION_DEK,
  type BlobKeys,
  type KeyBundle,
  type VaultBlob,
} from './vault'
import {
  fetchDek,
  unwrapDekWithPrevious,
  importWrappingKey,
  ensureMigrated,
  isFullyMigrated,
  recoveryStatusFor,
  sealEra,
  setupRecovery,
  type RecoveryStatus,
} from './recovery'
import {
  INITIAL_RECOVERY_STATUS,
  shouldOfferSetupPrompt,
  hasAcknowledgedRecovery,
  markRecoveryAcknowledged,
} from './recoveryUi'
import { AccountBar, VaultDialog, type VaultUiState } from './AccountBar'
import { AuthDialog, type AuthMode } from './AuthDialog'
import RecoveryDialog from './RecoveryDialog'
import {
  register as registerAccount,
  loginLocal,
  UsernameTakenError,
  BadCredentialsError,
  RateLimitedError,
  EmailInvalidError,
  UsernameInvalidError,
  AuthServerError,
} from './account'
import HistoryPanel from './HistoryPanel'
import {
  listEntries,
  saveEntry,
  deleteEntry,
  clearAllEntries,
  pushHistory,
  pullAndMergeHistory,
  type HistoryEntry,
} from './history'

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
  /**
   * The one-to-two-sentence version, generated on first toggle and cached here.
   * Sendable, unlike everything else optional on this object — it is the same
   * message, condensed, and it has been through the same URL check.
   */
  shorter?: string
  /** URLs the shortening call invented, stripped before it was ever displayed */
  shorterStrippedUrls?: string[]
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

/**
 * Which translated line the auth dialog shows for a failed register/login.
 *
 * Every error src/account.ts throws carries a machine code as its `message`
 * (never a sentence), so this table is the only place that decides what a user
 * reads — the server's own English `error` text is deliberately never rendered.
 * The fallback covers a bare AccountError ('auth-failed', 'malformed-response')
 * and anything fetch itself threw, e.g. an offline TypeError.
 */
const authErrorKey = (err: unknown): string => {
  if (err instanceof UsernameTakenError) return 'account.usernameTaken'
  if (err instanceof BadCredentialsError) return 'account.badCredentials'
  if (err instanceof RateLimitedError) return 'account.rateLimited'
  if (err instanceof EmailInvalidError) return 'account.emailInvalid'
  if (err instanceof UsernameInvalidError) return 'account.usernameInvalid'
  if (err instanceof AuthServerError) return 'account.serverError'
  return 'account.authError'
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
  const [authDialog, setAuthDialog] = useState<AuthMode | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  // A password account's vault key, held for this session — still works where
  // IndexedDB is blocked and the persistent cache is a no-op. Cleared on sign-out.
  const localKeyRef = useRef<CryptoKey | null>(null)
  /**
   * The account's DEK, unwrapped for this session. Present only once recovery
   * has been provisioned, and only for password accounts. While it is set it is
   * the key EVERY new write uses — a reset replaces the master key and keeps
   * this one, so a blob sealed under the master key after migration would be
   * the thing a reset strands. Cleared on sign-out beside localKeyRef.
   */
  const dekKeyRef = useRef<CryptoKey | null>(null)
  // `unknown`, not `none` — see INITIAL_RECOVERY_STATUS. `none` is a claim the
  // server has made; before the first fetchDek() we have not heard it.
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>(INITIAL_RECOVERY_STATUS)
  /**
   * The code to show, held only for as long as the card is on screen. It is
   * never written to localStorage, never put in the URL, and never logged: the
   * whole security model is that the server cannot read it, which is worth
   * nothing if the client leaves it somewhere durable.
   */
  const [recoveryCode, setRecoveryCode] = useState<{ code: string; replacesOld: boolean } | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  // Per-session, deliberately not persisted: someone who dismissed the prompt
  // last week and still has no recovery code should be asked again. Dismissing
  // it costs them nothing, because the account bar keeps the same offer.
  const [recoveryPromptDismissed, setRecoveryPromptDismissed] = useState(false)
  /**
   * The reset card is open. Separate from `authDialog` rather than a third mode
   * of it: this flow signs nobody in until it has finished, it owns two steps of
   * its own state, and the one thing it must never become is a place where an
   * ordinary sign-in can be attempted — the account it is about to rewrite is
   * identified by a recovery code, not by a session.
   */
  const [resetOpen, setResetOpen] = useState(false)
  /**
   * The username to start the sign-in field with, set only when a reset landed
   * but the sign-in that follows it did not. Not a lock — see AuthDialog's
   * prefillUsername — and cleared with the rest of the account state.
   */
  const [resetUsername, setResetUsername] = useState('')
  /**
   * Whether anyone on this device has confirmed saving a code for this account.
   * The server cannot answer this: it knows a record exists, not that the
   * one-time display survived long enough to be read. Without it, a first
   * display lost to a reload leaves an account that reports `ready` and a user
   * holding nothing, and nothing ever asks again.
   */
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false)
  /**
   * The real mutual exclusion for runRecoverySetup. `recoveryBusy` is a render
   * signal and nothing more: reading it in the guard tested a value captured at
   * the last render, so two clicks dispatched before React re-rendered both saw
   * `false` and both ran. Two runs mint two codes, the second overwrites the
   * first server-side, and the card the user is reading may be the dead one.
   * A ref is set synchronously, in the same tick as the check.
   */
  const recoveryRunRef = useRef(false)

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
  // Which version of the message is on screen. `false` means the full one; this is
  // the single switch that both the rendered body and the copy button read.
  const [showShorter, setShowShorter] = useState(false)
  const [shorterLoading, setShorterLoading] = useState(false)
  const [shorterError, setShorterError] = useState('')
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text')
  const [articleUrl, setArticleUrl] = useState('')
  const [article, setArticle] = useState<Article | null>(null)
  const [isFetchingArticle, setIsFetchingArticle] = useState(false)
  const [articleStatus, setArticleStatus] = useState('')

  /** Every path that replaces the reply must also drop the shortened view. */
  const resetShorter = () => {
    setShowShorter(false)
    setShorterError('')
  }

  /**
   * The text the user is actually looking at, and therefore the text the copy button
   * must put on the clipboard. Deriving both from this one expression is the whole
   * defence against the bug where someone copies what they believe is the short
   * version and pastes the long one. Falls back to the full message whenever the
   * short one is not ready — while it is still generating, or after it failed.
   */
  const shownMessage = reply ? (showShorter && reply.shorter ? reply.shorter : reply.message) : ''

  /** The invented-URL count for whichever version is on screen, for the same reason. */
  const shownStrippedUrls =
    reply && showShorter && reply.shorter ? reply.shorterStrippedUrls ?? [] : reply?.strippedUrls ?? []

  // --- history: local-first, encrypted-sync second (see src/history.ts) ---
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

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

  // Local history is available immediately, signed in or not — it lives in this
  // device's IndexedDB regardless of account state (see src/history.ts).
  useEffect(() => {
    listEntries().then(setHistoryEntries)
  }, [])

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
    // Not `authError`: that name is now the auth dialog's error state, and a
    // shadow here would read like the dialog's while being the OAuth redirect's.
    const oauthFailure = params.get('auth_error')
    if (oauthFailure) {
      const message = authErrorMessage(oauthFailure)
      if (message) setError(message)
      params.delete('auth_error')
      const query = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
    }
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * A decrypted bundle just arrived: apply keys and pull history. One path for
   * every unlock — the vault effect, the passphrase dialog, and a password
   * login all land here.
   *
   * `isStale` exists only for the effect, whose cleanup must be able to
   * suppress the history write after the effect re-runs or unmounts. Callers
   * that are not effects (the two dialogs) pass nothing, which matches what
   * they did before this was shared.
   */
  const onVaultOpened = (bundle: KeyBundle, isStale: () => boolean = () => false) => {
    applyKeyBundle(bundle)
    setApiKey(loadStoredKey(providerId))
    setTavilyDraft(loadTavilyKey())
    setShowApiKeyInput(getProvider(providerId).requiresKey && !loadStoredKey(providerId))
    setVaultState('unlocked')
    void mergeAndSyncHistory(isStale)
  }

  /** The password account's vault key: this session's, or the device cache. */
  const localVaultKey = async (): Promise<CryptoKey | null> => localKeyRef.current ?? (await cachedKey())

  /**
   * The two eras this session can open, each in its OWN slot. Until this task
   * the master key sat in both, which was inert while nothing wrote v2 and
   * actively wrong the moment something did: a genuine v2 blob would have been
   * handed the master key and failed as a raw AES error instead of the
   * MissingKeyError the routing exists to produce.
   *
   * Either slot may be empty and that is a real state, not a defect: a password
   * account before recovery is provisioned has only a master key, and one
   * signed in on a device whose DEK could not be unwrapped has only that too.
   * openBlob raises rather than reaching for the other one.
   *
   * Not identical to the cachedKey() lookup history.ts used to do: with
   * IndexedDB blocked, a password account has its key in the ref but not in the
   * cache, so history syncs where it used to stay silently local.
   */
  const blobKeys = async (): Promise<BlobKeys> => {
    const masterKey = await localVaultKey()
    return { masterKey: masterKey ?? undefined, dekKey: dekKeyRef.current ?? undefined }
  }

  /**
   * Pull remote history, show the merge, push it back. Shared because the guard
   * that matters is easy to drop: `pullAndMergeHistory` returns null for a blob
   * it could not open but that another key can, and pushing then overwrites it.
   *
   * ON MissingKeyError, WHICH IS NOW REACHABLE. pullAndMergeHistory still folds
   * it into that same null, and that is deliberate: null is the only signal
   * that stops the push, and a history blob whose era we lack a key for is
   * precisely the blob that must not be overwritten. Surfacing it here as an
   * error would also put a migration bug in front of a user who can do nothing
   * about it, in a panel that must keep working.
   *
   * It is not swallowed silently, though. "I hold the wrong key for a stored
   * blob" is exactly the condition isFullyMigrated() reports, and adoptRecovery
   * turns that into recoveryStatus === 'incomplete' on every sign-in — where it
   * will drive the UI and refuse a reset, the one operation the mislabel would
   * turn into data loss. The visibility lives on the status, not on the read
   * path. ("will", not "does": recoveryStatus is computed here but nothing
   * consumes it until the dialogs land in Tasks 6 and 7.)
   */
  const mergeAndSyncHistory = async (isStale: () => boolean = () => false) => {
    const merged = await pullAndMergeHistory(await blobKeys())
    if (isStale() || !merged) return
    setHistoryEntries(merged)
    // Sign-in uploads the device backlog: entries generated while signed out
    // are already in the merge, so pushing it completes the sync.
    await syncHistory(merged)
  }

  /**
   * Push under the key this device holds — with none, history stays local, silently.
   *
   * The key and the era tag come from sealEra() as one value, never chosen
   * separately here. A blob sealed under the master key but tagged v2 passes
   * reset's "refuse while any blob is v1" gate — the check that exists to stop
   * exactly it — and the reset then rewraps the DEK and strands this history.
   */
  const syncHistory = async (entries: HistoryEntry[]) => {
    const era = sealEra(dekKeyRef.current, await localVaultKey())
    if (era) await pushHistory(entries, era.key, era.version)
  }

  /**
   * Adopt this account's DEK for the session, then finish any migration that
   * was interrupted. Runs wherever the master key first becomes available — the
   * vault effect on load and handleAuthSubmit on a fresh sign-in — because a
   * signed-in client holding BOTH keys is the only moment migration can happen,
   * and that is what makes it safe to leave half-done.
   *
   * Never throws. Every failure here means "recovery is not usable this
   * session", and none of them should stop the vault from opening.
   *
   * `isStale` is checked after every await that precedes a write to component
   * state or to dekKeyRef, because sign-out can land in any of those gaps and
   * this would otherwise write the departed session's answer over the 'none'
   * handleSignOut just set — or restore a dekKeyRef it just cleared.
   */
  const adoptRecovery = async (isStale: () => boolean = () => false) => {
    const masterKey = await localVaultKey()
    if (!masterKey) return
    try {
      const record = await fetchDek()
      if (isStale()) return
      // Only the server answering "no record" is `none`. Every failure below is
      // `unknown`: a UI that treats "we could not tell" as "never provisioned"
      // offers first-time setup to someone who already has a recovery code.
      if (!record) {
        setRecoveryStatus('none')
        return
      }
      // Both generations of the password copy, never just the current one. A
      // reset interrupted between complete's writes 1 and 3 leaves this
      // password still authenticating while the CURRENT byPassword has already
      // moved to the new password's key — reading only that field reports the
      // session as unable to open its own DEK and leaves a v2 vault locked,
      // which is precisely the state `previous` was added to cover.
      const { dek, fromPrevious } = await unwrapDekWithPrevious(
        masterKey,
        record.byPassword,
        record.previous?.byPassword
      )
      const dekKey = await importWrappingKey(dek)
      if (isStale()) return
      dekKeyRef.current = dekKey
      await ensureMigrated({ masterKey, dekKey })
      // Hoisted out of the setState argument: it is two round trips long, and
      // evaluating isStale() before them checked a session that was still live.
      const migrated = await isFullyMigrated()
      // `fromPrevious` outranks the migration answer, and this is the ONLY
      // place that flag is read. It means this session's password opened the
      // previous generation of the DEK — which can only happen if a reset
      // stopped between complete's writes 1 and 3, which means `recovery:` now
      // holds either the old code's verifier or the verifier for a code that
      // was minted and never shown to anybody. Data is fine; the escape hatch
      // may be gone. Without this the account computes `ready`, the prompt
      // stays suppressed by this device's acknowledgement, and the user is
      // never told their recovery code might open nothing — until the day they
      // need it, which is the one day it cannot be fixed.
      if (!isStale()) setRecoveryStatus(fromPrevious ? 'stale' : recoveryStatusFor(true, migrated))
    } catch {
      // A record this password cannot open means the account was reset from
      // another device, so this session's master key is stale; a failed fetch
      // means we simply do not know. Either way, leave the DEK unadopted rather
      // than guessing. The next successful sign-in resolves it.
      if (!isStale()) setRecoveryStatus('unknown')
    }
  }

  /**
   * Provision recovery, or re-provision it. One function for both, because
   * setupRecovery makes no distinction: it reuses the stored DEK when there is
   * one and mints a fresh code either way, so "set up" and "generate a new
   * code" are literally the same call. That is what lets the account bar offer
   * it in every status, including `ready` — see the comment on the button in
   * AccountBar.tsx for why a `ready` account still needs the offer.
   *
   * `username` is passed explicitly on the sign-up path: `auth` is refetched
   * after this runs, so auth.user is still the pre-registration value (null)
   * at the moment we need the name to salt the code's derivation with.
   *
   * Staleness is measured against localKeyRef, exactly as adoptRecovery does:
   * if a sign-out or account switch replaced the key mid-flight, every write
   * below belongs to a session that is gone.
   */
  const runRecoverySetup = async (options: { username?: string; firstTime?: boolean } = {}) => {
    const name = options.username ?? (auth.user?.provider === 'local' ? auth.user.name : null)
    const masterKey = localKeyRef.current
    if (!name || !masterKey) {
      // Reachable: a password account whose key was lost to a blocked
      // IndexedDB plus a reload is signed in with no master key in hand. Say
      // so — the alternative is a button that does nothing when clicked, which
      // reads as a broken app rather than as an instruction.
      setRecoveryError(t('recovery.setupFailed'))
      return
    }
    // One at a time. Two overlapping runs mint two codes and the second
    // overwrites the first server-side, so whichever card the user is reading
    // may be the dead one — and a code that looks fine but opens nothing is the
    // exact failure this feature exists to prevent. The same guard covers a
    // click arriving while a code is still on screen unacknowledged.
    if (recoveryRunRef.current || recoveryCode) return
    recoveryRunRef.current = true

    /**
     * Is this creating a first code, or destroying an existing one?
     *
     * `firstTime` is passed by the sign-up path rather than read from
     * recoveryStatus, because adoptRecovery's setState has not reached this
     * closure yet — the status here is still the pre-registration value, and
     * trusting it would put a "this replaces your existing code" confirmation
     * in front of someone who has never had one.
     */
    const replacesOld = !options.firstTime && recoveryStatus !== 'none'

    // Rotation is destructive and irreversible: saveDek overwrites byRecovery,
    // so the code on the user's paper stops working the instant this lands,
    // BEFORE they have seen its replacement. That must not be one stray click
    // on a 13px link two elements from Sign out. First-time setup destroys
    // nothing and stays a single click.
    if (replacesOld && !window.confirm(t('recovery.rotateConfirm'))) {
      recoveryRunRef.current = false
      return
    }

    const isStale = () => localKeyRef.current !== masterKey
    setRecoveryBusy(true)
    setRecoveryError('')
    try {
      const { code, dekKey } = await setupRecovery(name, masterKey)
      if (isStale()) return
      dekKeyRef.current = dekKey
      const migrated = await isFullyMigrated()
      if (isStale()) return
      setRecoveryStatus(recoveryStatusFor(true, migrated))
      // Shown only now, after setupRecovery has resolved. It returns the code
      // only once BOTH the wrapped-DEK record and the code's verifier have
      // landed; a code displayed before that would verify against nothing, and
      // the user would file it away believing it works.
      setRecoveryCode({ code, replacesOld })
    } catch {
      // One message for every failure. The distinctions setupRecovery draws
      // (stale master key, unreadable record, a DEK era already begun) are all
      // "not right now" from here: none of them is something the user can act
      // on differently, and the safe next step is the same in each — try again,
      // or sign in again and try. Nothing has been shown, so nothing false is
      // believed.
      if (!isStale()) setRecoveryError(t('recovery.setupFailed'))
    } finally {
      // Unconditional, unlike the writes above. `busy` describes this control,
      // not the account: leaving it stuck true because the session changed
      // mid-flight would lock the next signed-in user out of setup entirely,
      // and no run can be in flight to be misrepresented (the guard above
      // permits only one).
      setRecoveryBusy(false)
      recoveryRunRef.current = false
    }
  }

  /**
   * First seal for a password account — no passphrase dialog, the
   * login-derived key IS the vault key. Quietly does nothing when there are no
   * keys to save yet or no key survived (blocked IndexedDB + reload); the next
   * key change or sign-in repairs both.
   *
   * `isStale` mirrors onVaultOpened's: the vault effect passes its cancelled
   * flag so a sign-out (or account switch) mid-seal neither uploads a vault
   * for the departed session nor writes state over the new one's.
   */
  const setupLocalVault = async (isStale: () => boolean = () => false) => {
    // The DEK when there is one, the login-derived key otherwise — paired with
    // its tag by sealEra so the two cannot drift apart.
    const era = sealEra(dekKeyRef.current, await localVaultKey())
    const bundle = collectKeyBundle()
    if (isStale()) return
    if (!era || !Object.keys(bundle).length) {
      setVaultState('none')
      return
    }
    try {
      const sealed = await sealJson(era.key, bundle, era.version)
      if (isStale()) return
      await saveVault(sealed)
      if (isStale()) return
      setVaultBlob(sealed)
      setVaultState('unlocked')
    } catch {
      if (!isStale()) setVaultState('none')
    }
  }

  /**
   * Read this device's acknowledgement for whoever is signed in.
   *
   * Keyed on the account id, so switching accounts re-reads rather than
   * carrying the previous user's answer over — one browser, two accounts, and
   * only one of them may have seen a code.
   */
  useEffect(() => {
    const id = auth.user?.id
    setRecoveryAcknowledged(id ? hasAcknowledgedRecovery(id) : false)
  }, [auth.user?.id])

  /**
   * While a code is on screen it has been shown once and will not be shown
   * again, so a reload, a back gesture or a closed tab loses it for good.
   * Browsers ignore custom text here and show their own wording — the point is
   * the interstitial, not the sentence. Registered only while a code is up, so
   * it never interferes with an ordinary reload.
   */
  useEffect(() => {
    if (!recoveryCode) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [recoveryCode])

  // Pull the encrypted vault once signed in, and open it silently if this device
  // already holds the derived key — the whole point is not asking again.
  useEffect(() => {
    if (!auth.user) {
      setVaultState('none')
      setVaultBlob(null)
      return
    }
    let cancelled = false
    const isStale = () => cancelled
    void (async () => {
      try {
        // BEFORE the vault is read, not after. Adopting the DEK decides which
        // key opens the blob we are about to fetch, and ensureMigrated may
        // rewrite that blob on the way. Reading first would hand a v2 vault an
        // empty dekKey slot and tell the user their passphrase was wrong.
        if (auth.user?.provider === 'local') await adoptRecovery(isStale)
        const blob = await fetchVault()
        if (cancelled) return
        setVaultBlob(blob)
        if (!blob) {
          // A password account seals silently: login already produced the key,
          // so the passphrase-setup dialog would be a second secret for nothing.
          if (auth.user?.provider === 'local') void setupLocalVault(isStale)
          else setVaultState('none')
          return
        }
        let bundle: KeyBundle | null = null
        if (auth.user?.provider === 'local') {
          try {
            // Routed by the blob's own tag rather than by which key we happen
            // to hold: a v2 vault opens under the DEK, a v1 under the master
            // key, and one tagged with neither raises instead of quietly trying
            // the other.
            bundle = await openBlob<KeyBundle>(await blobKeys(), blob)
          } catch {
            bundle = null
          }
        }
        // The device cache only ever holds a master-era key — adoptKey() and
        // seal() are the only writers — so it cannot open a v2 blob, and
        // unlockWithDeviceKey DELETES the cached key when it fails. Trying it
        // here would throw away a working master key over a blob it was never
        // meant to open.
        if (!bundle && blob.version !== BLOB_VERSION_DEK) bundle = await unlockWithDeviceKey(blob)
        if (cancelled) return
        if (bundle) onVaultOpened(bundle, isStale)
        else setVaultState('locked')
      } catch {
        if (!cancelled) setVaultState('none')
      }
    })()
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
    // Aggregate loop-conversion signal — a name, nothing else
    try {
      navigator.sendBeacon('/api/metric', new Blob([JSON.stringify({ name: 'share_cta' })], { type: 'application/json' }))
    } catch {
      /* metrics must never break navigation */
    }
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
        language: lastRequestRef.current?.promptContext.replyLanguage,
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

  /** Repopulate the transcript and reply from a saved history entry. */
  const restoreFromHistory = (entry: HistoryEntry) => {
    finalTranscriptRef.current = entry.argument
    setTranscript(entry.argument)
    setArticle(null)
    setError('')
    setShareUrl('')
    setShowClaims(false)
    setIsBriefingOpen(false)
    resetShorter()
    setLastRun(null)
    setInstantDone(null)
    setReply({
      message: entry.message,
      strategy: entry.strategy || '',
      context: null,
      citations: entry.citations || [],
      strippedUrls: [],
      unusedCitations: [],
      weakLink: entry.weakLink || '',
      toVerify: [],
      // A restored reply has no lastRequestRef (that briefing context was never
      // saved), same as an Instant reply — so it hides the BYOK-only briefing
      // expander the same way Instant does.
      instant: true,
    })
    setShowHistory(false)
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

  /**
   * Save a successful generation to local history, then sync it if the vault is
   * unlocked. Called from both the Instant and BYOK reply paths — every
   * successful generation, regardless of which one produced it.
   */
  const recordHistory = (message: string, strategy: string, weakLink: string, citationsUsed: Citation[]) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      argument: transcript.trim(),
      message,
      strategy,
      weakLink,
      citations: citationsUsed,
      modelLabel: model?.label,
      articleTitle: article?.title,
      articleUrl: article?.url,
    }
    saveEntry(entry).then(async () => {
      const all = await listEntries()
      setHistoryEntries(all)
      if (vaultState === 'unlocked') void syncHistory(all) // one KV write per save, ciphertext only
    })
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
    resetShorter()
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
        recordHistory(verified.text, parsed.strategy, section(instantReply.text, 'WEAKLINK'), verified.used)
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
      recordHistory(verified.text, parsed.strategy, check.weakLink, verified.used)
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
      } else if (instant) {
        // Every failure on this path — a server-side error() string or a raw
        // fetch rejection (e.g. "Failed to fetch") — is `instanceof Error`, so
        // checking that first (as the branch below does) would always win and
        // the hand-translated instant.error string would never show for a
        // non-English reader. Show the translated string always; keep the raw
        // detail alongside for anyone who needs to diagnose it.
        const detail = err instanceof Error ? err.message : ''
        setError(detail ? `${t('instant.error')} (${detail})` : t('instant.error'))
      } else {
        setError(err instanceof Error ? err.message : t('error.generic'))
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

  /**
   * The "Shorter version" toggle. See CONSTITUTION.md rules 1, 4, 6 and 9, and the
   * addendum in docs/superpowers/specs/2026-08-13-password-recovery-design.md — the
   * length was chosen deliberately, and `shorterPrompt` carries the reasons.
   *
   * Lazy like the briefing: one call on the first open, cached on the reply
   * afterwards, so a toggle nobody uses costs nothing. Toggling back shows the full
   * message again; the short version is never the only thing the user can see.
   */
  const toggleShorter = async () => {
    // Instant replies bought one server-paid call and have no key to spend on a
    // second, exactly as with the briefing — the control stays hidden for them,
    // and this guard covers any other route in.
    if (reply?.instant) return
    const showing = !showShorter
    setShowShorter(showing)
    const context = lastRequestRef.current
    if (!showing || !context || !model || !reply || reply.shorter || shorterLoading) return

    setShorterLoading(true)
    setShorterError('')
    try {
      const result = await generateText({
        provider,
        model,
        apiKey,
        // Condense the message we already produced, never the original argument: that
        // is what keeps the citation set fixed and lets the check below be meaningful.
        system: shorterPrompt(context.promptContext, reply.message),
        userContent: context.userContent,
        length: 'detailed',
        onStatus: setProviderStatus,
      })
      const parsed = parseMessage(result.text)
      // Same gate as the full message, against the same allowed set — a shortening
      // call is still a model call, and a URL it invents must not reach the clipboard.
      const verified = stripUnverifiedUrls(parsed.message, reply.citations)
      if (!verified.text.trim()) throw new Error(t('error.shorter'))
      setReply((prev) =>
        prev ? { ...prev, shorter: verified.text, shorterStrippedUrls: verified.strippedUrls } : prev
      )
      addUsage(result.usage)
    } catch (err) {
      // Fall back to the full message rather than showing an empty send zone: the
      // long version is the one that is always safe to be looking at.
      setShowShorter(false)
      setShorterError(err instanceof Error ? err.message : t('error.shorter'))
    } finally {
      setShorterLoading(false)
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
      // Only the message — never the strategy line, weak-link note, or briefing —
      // and specifically the version currently on screen. `shownMessage` is the one
      // place that choice is made, so what is copied cannot drift from what is read.
      await navigator.clipboard.writeText(shownMessage)
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

  /**
   * Register or sign in with a password. The one place where "logging in" and
   * "unlocking the vault" are the same act: the derived master key is adopted
   * as this device's vault key, so no passphrase dialog ever appears on this
   * path. Google accounts do not reach here at all.
   */
  const handleAuthSubmit = async (username: string, password: string, email: string) => {
    // Captured before anything can close the dialog: the sign-up path owes the
    // user a recovery code, and `authDialog` is null by the time we get there.
    const isSignup = authDialog === 'signup'
    setAuthBusy(true)
    setAuthError('')
    try {
      const result =
        isSignup
          ? await registerAccount(username, password, email)
          : await loginLocal(username, password)
      // REFUSE a different account while one is signed in. By this point the
      // server has already minted the new session and its Set-Cookie has
      // replaced the signed-in user's cookie — but nothing on this device has
      // been handed over yet. Proceeding would: adopt the new key, refire the
      // vault effect under the new user, and either seal collectKeyBundle()
      // (the signed-in user's API keys, still in localStorage) into the new
      // account's vault, or merge this device's un-wiped history into the new
      // account's — both readable by whoever owns the new credentials. That
      // is the account-switch leak, reached without any sign-out. The only
      // honest recovery is a full reset: handleSignOut() destroys the session
      // the cookie now holds (the just-minted one) and runs the same device
      // hygiene a deliberate sign-out runs. The original session cookie is
      // already gone (overwritten), so "still signed in as the old user"
      // stopped being true the moment the response landed.
      if (auth.user && result.user.id !== auth.user.id) {
        await handleSignOut()
        setAuthDialog('signin')
        setAuthError(t('account.signOutFirst'))
        return
      }
      // Login IS unlock: the derived master key becomes this device's vault key
      localKeyRef.current = await adoptKey(result.masterKeyBytes)
      // A password account may or may not have recovery provisioned. If it
      // does, adopt the DEK for this session and finish any migration that was
      // interrupted last time — the self-heal, run on every sign-in because
      // this is where the master key is in hand.
      //
      // Staleness here is "the key this call was for is no longer the adopted
      // one", which covers both sign-out (handleSignOut nulls the ref) and an
      // account switch (it replaces it). The window spans ensureMigrated, so
      // without this a sign-out mid-call would reassign dekKeyRef after
      // handleSignOut had cleared it — handing the next person on this device
      // the previous account's data key. The SERVER writes ensureMigrated makes
      // are deliberately left unguarded: they are correct for the account that
      // was signed in when they started, and the session cookie is what stops
      // them if it is not.
      const adopted = localKeyRef.current
      await adoptRecovery(() => localKeyRef.current !== adopted)
      // A brand-new account is provisioned on the spot rather than prompted
      // later: the master key is in hand, there is no data yet to migrate, and
      // an account that has never had a code is the one that loses everything
      // to a forgotten password. Awaited, so dekKeyRef is populated before the
      // vault effect seals this account's first blob — sealing under the master
      // key first and migrating a moment later would be two writes and a window
      // where the vault is v1, for no gain.
      //
      // A failure here is not a failed sign-up. runRecoverySetup swallows it
      // into recoveryError, the account bar keeps offering setup, and the user
      // is signed in either way.
      if (isSignup && result.user.provider === 'local') {
        await runRecoverySetup({ username: result.user.name || username, firstTime: true })
      }
      // The vault effect runs adoptRecovery again when auth.user.id changes.
      // The duplicate fetch is tolerated rather than overlooked: it is one GET,
      // it is idempotent, and the alternative — a flag saying "already done for
      // this user" — is more state to get wrong than the request costs.
      // Signed-in-but-locked (key lost to a blocked IndexedDB + reload): the
      // effect keys on auth.user.id and will not refire for the same user, so
      // open the vault directly here.
      if (vaultBlob && vaultState === 'locked') {
        try {
          // By tag, not by the master key alone: this blob is v2 whenever the
          // account has already migrated, and only the DEK opens those.
          //
          // `vaultBlob` is this component's copy and may be the PRE-migration
          // object that adoptRecovery just replaced on the server. That is
          // harmless and self-correcting: the stale copy is v1, the master key
          // in the other slot opens it, and the next syncVault writes the v2
          // blob back into state.
          onVaultOpened(await openBlob<KeyBundle>(await blobKeys(), vaultBlob))
        } catch {
          // A blob this account's key cannot open — leave it locked
        }
      }
      setAuthDialog(null)
      // Refetch rather than trusting the response: one source of truth for auth
      // state, and the change of auth.user.id is what fires the vault effect.
      const fresh = await fetchAuthState()
      // fetchAuthState never throws — it swallows network failures into
      // SIGNED_OUT. Right after a successful login that would present as
      // "sign-in failed" while the session cookie is in fact set, so fall
      // back to the user the register/login response itself vouched for.
      if (fresh.user) setAuth(fresh)
      else setAuth((current) => ({ ...current, user: result.user }))
    } catch (err) {
      setAuthError(t(authErrorKey(err)))
    } finally {
      setAuthBusy(false)
    }
  }

  /**
   * The reset landed. Show the rotated code, then sign the user in with the
   * password they just chose.
   *
   * ORDER MATTERS IN BOTH DIRECTIONS HERE. The code is committed to state
   * BEFORE the sign-in is attempted, because by this point the reset is done —
   * the code is live, and it is the only copy of it that will ever exist. A
   * dropped connection on the login that follows must not be what loses it.
   *
   * And the sign-in goes through handleAuthSubmit rather than a bare
   * loginLocal, because everything that makes the vault and the history
   * reappear happens in there: adopting the derived key, adopting the DEK,
   * finishing any migration, opening a locked blob, refetching auth. That is
   * the acceptance criterion "the vault and history both survive" — surviving
   * on the server is not the same as being back on screen.
   *
   * The dialog is opened first so a failed sign-in has somewhere to say so:
   * handleAuthSubmit closes it on success and leaves it up with authError set
   * otherwise, where the user can simply try the new password again.
   */
  const handleResetComplete = async (username: string, password: string, code: string) => {
    setResetOpen(false)
    setRecoveryCode({ code, replacesOld: true })
    setAuthError('')
    // Prefilled before the dialog opens, so if the sign-in below fails the form
    // left behind already names the account instead of asking someone who has
    // just proved they forget things about it to type it again.
    setResetUsername(username)
    setAuthDialog('signin')
    await handleAuthSubmit(username, password, '')
  }

  const handleSignOut = async () => {
    await signOut()
    // Drop the derived key too. Without this, "sign out" on a shared machine would
    // leave the next person able to decrypt the vault by simply signing back in.
    await forgetDeviceKey()
    localKeyRef.current = null
    // The DEK leaves with it. Left behind, the next person to sign in on this
    // device would carry the previous account's data key into their session.
    dekKeyRef.current = null
    // Back to "not checked", not to "has none": the next sign-in on this device
    // re-runs adoptRecovery, and until it answers we know nothing about that
    // account either.
    setRecoveryStatus(INITIAL_RECOVERY_STATUS)
    setRecoveryAcknowledged(false)
    // Drop an undismissed code with the session. It belongs to the account that
    // just left, and the next person on this device must not read it off the
    // screen. The prompt's dismissal resets too, so the next sign-in is judged
    // on its own account's status.
    setRecoveryCode(null)
    setRecoveryError('')
    setRecoveryPromptDismissed(false)
    // Nothing half-typed in a reset survives a sign-out either: the card names
    // an account by username, and the next person here is not that account.
    setResetOpen(false)
    setResetUsername('')
    setAuthDialog(null)
    setAuthError('')
    // Wipe the device's history copy as well — entries AND key both leave this
    // device on sign-out. The server keeps the ciphertext; the next sign-in on
    // this (or any) device pulls it back down once the vault is unlocked again.
    await clearAllEntries()
    setHistoryEntries([])
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
      // sealEra prefers the DEK. After migration it is the only key that MUST
      // be able to open this blob, because a reset replaces the master key and
      // keeps the DEK — reseal under the master key here and the next API-key
      // change silently drags the vault back to v1, where a later reset strands
      // it. This step is easy to miss precisely because nothing looks wrong
      // until the reset. With neither key: a Google account, which keeps using
      // the device key exactly as before.
      const era = sealEra(dekKeyRef.current, auth.user.provider === 'local' ? await localVaultKey() : null)
      const sealed = era
        ? await sealJson(era.key, bundle, era.version)
        : await resealWithDeviceKey(bundle, vaultBlob)
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
        void mergeAndSyncHistory()
      } else if (vaultBlob) {
        onVaultOpened(await unlock(vaultBlob, passphrase))
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
    // A password account never gets the passphrase offer: it already has a key.
    else if (auth.user?.provider === 'local' && vaultState === 'none' && !vaultBlob) void setupLocalVault()
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

  // Computed here rather than inline in the JSX below so the whole decision is
  // one testable call. The inputs are exactly the five facts that matter; if a
  // sixth ever appears it belongs in the function, not in a longer `&&`.
  const setupPrompt = shouldOfferSetupPrompt({
    provider: auth.user?.provider,
    status: recoveryStatus,
    dismissed: recoveryPromptDismissed,
    codeShown: !!recoveryCode,
    acknowledged: recoveryAcknowledged,
  })

  return (
    <div className="container">
      <AccountBar
        t={t}
        language={language}
        onLanguageChange={handleLanguageChange}
        auth={auth}
        vaultState={vaultState}
        onSignInClick={() => {
          setAuthError('')
          setAuthDialog('signin')
        }}
        // Sign out sits in the same bar as the button that opened the card, and
        // it wipes this device — including the code still on screen. That is
        // the likeliest way a first code is lost, so it asks first while one is
        // displayed. Unguarded otherwise.
        onSignOut={async () => {
          if (recoveryCode && !window.confirm(t('recovery.leaveConfirm'))) return
          await handleSignOut()
        }}
        // A password user's "unlock" is re-entering their password — the same
        // secret — never a vault passphrase they were never given.
        onUnlockClick={() =>
          auth.user?.provider === 'local' ? setAuthDialog('signin') : setVaultPrompt('unlock')
        }
        recoveryStatus={recoveryStatus}
        recoveryBusy={recoveryBusy}
        onSetupRecovery={() => void runRecoverySetup()}
      />

      {/* Kept next to the bar the action was taken from. The page-wide `error`
          banner sits far below the fold, which is no use for a control up
          here. */}
      {recoveryError && (
        <div className="error" role="alert">
          ⚠️ {recoveryError}
        </div>
      )}

      {recoveryCode && (
        <RecoveryDialog
          mode="show"
          t={t}
          code={recoveryCode.code}
          replacesOld={recoveryCode.replacesOld}
          onDone={() => {
            // The acknowledgement is recorded HERE, at the checkbox, and
            // nowhere else — it means "a human confirmed they saved this",
            // which is the one fact no server record can carry. Without it a
            // display lost to a reload leaves an account reporting `ready` and
            // a user holding nothing, and nothing asks again. Ever.
            if (auth.user?.id) markRecoveryAcknowledged(auth.user.id)
            setRecoveryAcknowledged(true)
            setRecoveryCode(null)
            // A message from an earlier failed attempt has been overtaken by
            // this success; leaving it up contradicts the code just shown.
            setRecoveryError('')
          }}
        />
      )}

      {/* Two different prompts, and which one (if either) is a decision made in
          shouldOfferSetupPrompt where it can be tested — see recoveryUi.ts.
          `setup` offers a first code; `replace` says there is one out there
          that nobody here has seen. Saying the wrong one is not cosmetic:
          "you have no recovery code" is false and alarming for the second
          user, and the button under it destroys a code that may be on their
          desk. */}
      {setupPrompt && (
        <div className="recovery-prompt" role="status">
          <p>{setupPrompt === 'setup' ? t('recovery.promptBody') : t('recovery.promptLostBody')}</p>
          <p className="key-help">{t('recovery.regenerateHint')}</p>
          <div className="controls">
            <button
              className="button button-primary"
              onClick={() => void runRecoverySetup()}
              disabled={recoveryBusy}
            >
              {recoveryBusy
                ? t('recovery.working')
                : setupPrompt === 'setup'
                  ? t('recovery.promptAction')
                  : t('recovery.promptLostAction')}
            </button>
            {/* Dismissible, and it costs nothing to dismiss: the account bar
                keeps the same offer for as long as it is unanswered. */}
            <button
              className="link-button"
              onClick={() => {
                setRecoveryPromptDismissed(true)
                setRecoveryError('')
              }}
            >
              {t('recovery.promptDismiss')}
            </button>
          </div>
        </div>
      )}

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

      {authDialog && (
        <AuthDialog
          // Keyed on the account context: when the refusal path signs the
          // user out while the dialog stays mounted, the key change remounts
          // it fresh (editable empty username) instead of leaving the old
          // account's read-only name and typed password in component state.
          key={auth.user?.id ?? 'signed-out'}
          t={t}
          mode={authDialog}
          hasGoogle={auth.providers.includes('google')}
          busy={authBusy}
          error={authError}
          // The dialog can only be open while signed in via the locked-vault
          // unlock route (the bar's sign-in button and the Instant CTA both
          // require auth.user to be null), so a signed-in local user here
          // means "re-enter your password": fix the username to the account's.
          fixedUsername={auth.user?.provider === 'local' ? auth.user.name : undefined}
          prefillUsername={resetUsername}
          onModeChange={(m) => {
            setAuthError('')
            setAuthDialog(m)
          }}
          onGoogle={() => signIn('google')}
          onSubmit={handleAuthSubmit}
          // Only on the signed-out sign-in card. AuthDialog hides it whenever
          // the username is fixed, which is the "re-enter your password" render
          // for an account already signed in — a reset from there would rewrite
          // the credentials of whoever is holding this device's data.
          // WITHHELD WHILE A CODE IS ON SCREEN, and that is not cosmetic. The
          // dialog is visible in exactly that state — a reset landed and its
          // auto-sign-in did not — and the handler closes the sign-in form
          // while the reset card stays gated on `!recoveryCode`. One click and
          // both are gone: no sign-in form, no reset card, and a recovery code
          // the user still has to save. Fixed here at the source rather than by
          // loosening that gate, because the gate is what stops a reset being
          // re-entered underneath the code it just produced.
          onForgotPassword={
            recoveryCode
              ? undefined
              : () => {
                  setAuthDialog(null)
                  setAuthError('')
                  setResetOpen(true)
                }
          }
          onDismiss={() => {
            setAuthDialog(null)
            setAuthError('')
          }}
        />
      )}

      {/* Never while a code is on screen: the reset ends by showing one, and
          re-entering the flow underneath it would offer to rotate the code the
          user is still copying down. And never while anyone is signed in — the
          card names its account by username, so from a signed-in page it would
          be a door onto a DIFFERENT account's credentials with this device's
          data still loaded. AuthDialog already withholds the entry point in
          every such render; this is the second lock on the same door. */}
      {resetOpen && !recoveryCode && !auth.user && (
        <RecoveryDialog
          mode="reset"
          t={t}
          onReset={(username, password, code) => void handleResetComplete(username, password, code)}
          onCancel={() => setResetOpen(false)}
        />
      )}

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

      <button type="button" className="link-button history-toggle" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? t('history.hide') : t('history.show')}
      </button>
      {showHistory && (
        <HistoryPanel
          t={t}
          language={language}
          entries={historyEntries}
          synced={vaultState === 'unlocked'}
          onRestore={restoreFromHistory}
          onDelete={(id) => {
            deleteEntry(id).then(async () => {
              const all = await listEntries()
              setHistoryEntries(all)
              // Push immediately, not debounced: a per-entry delete on this device
              // could otherwise be resurrected by a stale local list pushed from
              // another device before this delete's push lands (see history.ts).
              if (vaultState === 'unlocked') void syncHistory(all)
            })
          }}
          onClear={() => {
            if (!window.confirm(t('history.clearConfirm'))) return
            clearAllEntries().then(() => {
              setHistoryEntries([])
              // Push immediately — same delete-resurrection risk as per-entry delete.
              if (vaultState === 'unlocked') void syncHistory([])
            })
          }}
        />
      )}

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
          {/* Opens the same dialog as the bar rather than starting Google
              directly: a deployment can now be password-only, and on one of
              those /api/auth/google/start answers 501 — this button used to
              navigate the user onto that raw JSON. */}
          {!auth.user && auth.configured && (
            <button
              className="button button-primary"
              onClick={() => {
                setAuthError('')
                setAuthDialog('signup')
              }}
            >
              {t('account.signInOrUp')}
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
              <RichText text={shownMessage} />
            </div>

            {/* Instant replies have no key paying for a second call, so this control is
                hidden for them exactly as the briefing expander is. */}
            {!reply.instant && (
              <div className="shorter-row">
                <button
                  type="button"
                  className="shorter-toggle"
                  onClick={toggleShorter}
                  aria-pressed={showShorter}
                  disabled={shorterLoading}
                >
                  {showShorter && reply.shorter ? t('reply.showFull') : t('reply.shorter')}
                  {shorterLoading && <span className="spinner shorter-spinner"></span>}
                </button>
                {shorterLoading && <span className="shorter-note">{t('reply.shorterBuilding')}</span>}
                {/* Says which version is on screen, because the copy button copies THAT
                    one and the two are very different messages to send. */}
                {!shorterLoading && showShorter && reply.shorter && (
                  <span className="shorter-note">{t('reply.shorterShowing')}</span>
                )}
                {shorterError && (
                  <span className="shorter-note shorter-error" role="alert">
                    ⚠️ {shorterError}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              className={`claim-badge ${shownStrippedUrls.length ? 'claim-badge-warn' : ''}`}
              onClick={() => setShowClaims(!showClaims)}
              aria-expanded={showClaims}
              aria-controls="claim-panel"
            >
              {reply.citations.length === 0
                ? t('reply.noSources')
                : reply.citations.length === 1
                  ? t('reply.sourcesCitedOne')
                  : t('reply.sourcesCited', { count: reply.citations.length })}
              {shownStrippedUrls.length === 1 && t('reply.linksRemovedOne')}
              {shownStrippedUrls.length > 1 && t('reply.linksRemoved', { count: shownStrippedUrls.length })}
              {reply.toVerify?.length ? t('reply.toCheck', { count: reply.toVerify.length }) : ''}
            </button>

            <div id="claim-panel" className={`collapsible ${showClaims ? '' : 'collapsed'}`} aria-hidden={!showClaims}>
              <div className="collapsible-clip">
                <div className="claim-panel-body">
                  {reply.citations.length > 0 && <SourceList citations={reply.citations} title={t('reply.sourcesTitle')} />}
                  {shownStrippedUrls.length > 0 && (
                    <p className="claim-warn">
                      {shownStrippedUrls.length === 1
                        ? t('reply.claimWarnOne')
                        : t('reply.claimWarn', { count: shownStrippedUrls.length })}
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
