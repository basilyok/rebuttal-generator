// AI provider registry, call adapters, and cost accounting.
//
// Every cloud provider here was empirically verified to allow CORS calls from
// the browser (this is a client-side-only app — providers that block browser
// CORS, like OpenAI's direct API, cannot be used; OpenAI models are available
// via OpenRouter instead). "webllm" runs models fully in-browser via WebGPU —
// free, no API key, private.
//
// REASONING MODELS: most current models emit hidden reasoning tokens that are
// drawn from the same output budget as the visible answer, and are emitted
// FIRST. A small max_tokens therefore yields empty content with a "length"
// finish reason. Two defences: generous budgets for reasoning models (see
// budgetFor), and per-provider reasoning-reduction parameters (see the request
// builders). Note that "hide reasoning" flags (OpenRouter exclude, Groq
// include_reasoning/reasoning_format) do NOT save tokens — only effort/budget
// controls do.

export interface ModelOption {
  id: string
  label: string
  /** USD per 1,000,000 input tokens */
  inPrice: number
  /** USD per 1,000,000 output tokens */
  outPrice: number
  /** Emits hidden reasoning tokens before visible output */
  reasoning?: boolean
  /** Pricing unknown (e.g. discovered via live refresh with no price data) */
  unknownPrice?: boolean
  /** Can search the web, so it can return real, verifiable source links */
  search?: boolean
  /** One-line description of what this model is good for, shown when settings are collapsed */
  blurb?: string
}

export type ProviderKind = 'anthropic' | 'openai' | 'gemini' | 'cohere' | 'webllm'

export interface Provider {
  id: string
  label: string
  kind: ProviderKind
  requiresKey: boolean
  /** The provider's API key is free to create (no payment method needed) */
  keyIsFree?: boolean
  keyUrl?: string
  keyPlaceholder?: string
  baseUrl?: string
  /** Endpoint listing available models, for the live catalog refresh */
  modelsUrl?: string
  models: ModelOption[]
  defaultModel: string
  note?: string
}

// Pricing and model IDs verified against provider documentation, 2026-07-28.
export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude (paid)',
    kind: 'anthropic',
    requiresKey: true,
    keyUrl: 'https://console.anthropic.com',
    keyPlaceholder: 'sk-ant-…',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    models: [
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5 (fast & cheap)',
        inPrice: 1,
        outPrice: 5,
        search: true,
        blurb: 'Quick and inexpensive, answers directly without hidden reasoning — a solid everyday default',
      },
      {
        id: 'claude-sonnet-5',
        label: 'Claude Sonnet 5',
        inPrice: 2,
        outPrice: 10,
        reasoning: true,
        search: true,
        blurb: 'Balanced pick: reasons carefully about the argument without the cost of the largest models',
      },
      {
        id: 'claude-opus-5',
        label: 'Claude Opus 5',
        inPrice: 5,
        outPrice: 25,
        reasoning: true,
        search: true,
        blurb: 'Strong at picking apart flawed logic and spotting the weak joint in an argument',
      },
      {
        id: 'claude-fable-5',
        label: 'Claude Fable 5 (most capable)',
        inPrice: 10,
        outPrice: 50,
        reasoning: true,
        search: true,
        blurb: 'The most capable option — best for nuanced arguments where the rebuttal has to be airtight',
      },
    ],
    defaultModel: 'claude-haiku-4-5',
    note: 'Claude Sonnet 5 is $2/$10 per Mtok as introductory pricing through 2026-08-31, then $3/$15.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier + paid)',
    kind: 'gemini',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash-Lite (cheapest)',
        inPrice: 0.25,
        outPrice: 1.5,
        reasoning: true,
        search: true,
        blurb: 'Cheapest way to get a grounded rebuttal — searches the web for real sources on a free-tier key',
      },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', inPrice: 0.3, outPrice: 2.5, reasoning: true, search: true },
      {
        id: 'gemini-3.6-flash',
        label: 'Gemini 3.6 Flash (flagship)',
        inPrice: 1.5,
        outPrice: 7.5,
        reasoning: true,
        search: true,
        blurb: 'Google’s current flagship — strong reasoning plus Google Search grounding for verifiable links',
      },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', inPrice: 1.5, outPrice: 9, reasoning: true, search: true },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', inPrice: 0.5, outPrice: 3, reasoning: true, search: true },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview — no free tier)', inPrice: 2, outPrice: 12, reasoning: true, search: true },
    ],
    defaultModel: 'gemini-3.1-flash-lite',
    note: 'Free tier available on every model except Gemini 3.1 Pro — a free key will be rejected by that one.',
  },
  {
    id: 'groq',
    label: 'Groq (free tier, very fast)',
    kind: 'openai',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    models: [
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (cheapest)', inPrice: 0.05, outPrice: 0.08 },
      {
        id: 'llama-3.3-70b-versatile',
        label: 'Llama 3.3 70B Versatile',
        inPrice: 0.59,
        outPrice: 0.79,
        blurb: 'Near-instant replies with no hidden reasoning — the most reliable pick when you want speed',
      },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', inPrice: 0.075, outPrice: 0.3, reasoning: true },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (flagship)', inPrice: 0.15, outPrice: 0.6, reasoning: true },
      { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B', inPrice: 0.6, outPrice: 3, reasoning: true },
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'Free tier with a free key — extremely fast inference.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (free models + paid, incl. GPT)',
    kind: 'openai',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-…',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    models: [
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        label: 'Llama 3.3 70B (no reasoning, reliable)',
        inPrice: 0.13,
        outPrice: 0.4,
        blurb: 'Cheap and dependable, answers directly — a good default when you just want a fast rebuttal',
      },
      { id: 'qwen/qwen3.7-flash', label: 'Qwen3.7 Flash (near-free)', inPrice: 0.03, outPrice: 0.13, reasoning: true },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B (FREE)', inPrice: 0, outPrice: 0, reasoning: true },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B (FREE)', inPrice: 0, outPrice: 0, reasoning: true },
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B (FREE)', inPrice: 0, outPrice: 0, reasoning: true },
      { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (FREE)', inPrice: 0, outPrice: 0, reasoning: true },
      { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (FREE)', inPrice: 0, outPrice: 0, reasoning: true },
      { id: 'perplexity/sonar', label: 'Perplexity Sonar (built for citations)', inPrice: 1, outPrice: 1, search: true, blurb: 'Purpose-built for web-sourced answers — the cheapest way to get a rebuttal backed by real links' },
      { id: 'perplexity/sonar-pro', label: 'Perplexity Sonar Pro', inPrice: 3, outPrice: 15, search: true },
      { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', inPrice: 0.5, outPrice: 3, reasoning: true },
      { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra', inPrice: 1.25, outPrice: 7.5, reasoning: true },
      { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol (most capable GPT)', inPrice: 5, outPrice: 30, reasoning: true },
      { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', inPrice: 2, outPrice: 10, reasoning: true },
      { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5', inPrice: 5, outPrice: 25, reasoning: true },
      { id: 'google/gemini-3.6-flash', label: 'Gemini 3.6 Flash', inPrice: 1.5, outPrice: 7.5, reasoning: true },
      { id: 'x-ai/grok-4.5', label: 'Grok 4.5', inPrice: 2, outPrice: 6, reasoning: true },
      { id: 'moonshotai/kimi-k3', label: 'Kimi K3', inPrice: 3, outPrice: 15, reasoning: true },
    ],
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    note: 'One free key unlocks genuinely free models, plus paid access to GPT, Claude, Gemini and 350+ others. Refresh the model list to pull the full live catalog with current prices.',
  },
  {
    id: 'mistral',
    label: 'Mistral (free tier + paid)',
    kind: 'openai',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small 4', inPrice: 0.15, outPrice: 0.6, reasoning: true },
      { id: 'mistral-large-latest', label: 'Mistral Large 3', inPrice: 0.5, outPrice: 1.5 },
      { id: 'mistral-medium-latest', label: 'Mistral Medium 3.5 (flagship)', inPrice: 1.5, outPrice: 7.5, reasoning: true },
      { id: 'magistral-medium-latest', label: 'Magistral Medium (reasoning)', inPrice: 2, outPrice: 5, reasoning: true },
    ],
    defaultModel: 'mistral-small-latest',
    note: 'Free experimentation tier available with a free key.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek (paid, very cheap)',
    kind: 'openai',
    requiresKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-…',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    modelsUrl: 'https://api.deepseek.com/models',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', inPrice: 0.14, outPrice: 0.28, reasoning: true },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (flagship)', inPrice: 0.435, outPrice: 0.87, reasoning: true },
    ],
    defaultModel: 'deepseek-v4-flash',
    note: 'Thinking mode is on by default and cannot be disabled — budgets are set generously to compensate.',
  },
  {
    id: 'xai',
    label: 'xAI Grok (paid)',
    kind: 'openai',
    requiresKey: true,
    keyUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-…',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    modelsUrl: 'https://api.x.ai/v1/models',
    models: [
      { id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 (no reasoning, fastest)', inPrice: 1.25, outPrice: 2.5 },
      { id: 'grok-4.3', label: 'Grok 4.3', inPrice: 1.25, outPrice: 2.5, reasoning: true },
      { id: 'grok-4.5', label: 'Grok 4.5 (flagship)', inPrice: 2, outPrice: 6, reasoning: true },
      { id: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 (reasoning)', inPrice: 1.25, outPrice: 2.5, reasoning: true },
    ],
    defaultModel: 'grok-4.20-0309-non-reasoning',
  },
  {
    id: 'cohere',
    label: 'Cohere (free trial + paid)',
    kind: 'cohere',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    baseUrl: 'https://api.cohere.com/v2/chat',
    modelsUrl: 'https://api.cohere.com/v1/models',
    models: [
      { id: 'command-r7b-12-2024', label: 'Command R7B (cheapest)', inPrice: 0.0375, outPrice: 0.15 },
      { id: 'command-r-08-2024', label: 'Command R', inPrice: 0.15, outPrice: 0.6 },
      { id: 'command-a-03-2025', label: 'Command A (flagship)', inPrice: 2.5, outPrice: 10 },
    ],
    defaultModel: 'command-a-03-2025',
    note: 'Free trial keys available with rate limits.',
  },
  {
    id: 'together',
    label: 'Together AI (paid)',
    kind: 'openai',
    requiresKey: true,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    modelsUrl: 'https://api.together.xyz/v1/models',
    models: [
      { id: 'MiniMaxAI/MiniMax-M3', label: 'MiniMax M3 (cheapest)', inPrice: 0.3, outPrice: 1.2, reasoning: true },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo (no reasoning)', inPrice: 1.04, outPrice: 1.04 },
      { id: 'Qwen/Qwen3.7-Max', label: 'Qwen3.7 Max', inPrice: 1.25, outPrice: 3.75, reasoning: true },
      { id: 'zai-org/GLM-5.2', label: 'GLM-5.2', inPrice: 1.4, outPrice: 4.4, reasoning: true },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro', inPrice: 1.74, outPrice: 3.48, reasoning: true },
      { id: 'moonshotai/Kimi-K3', label: 'Kimi K3 (flagship)', inPrice: 3, outPrice: 15, reasoning: true },
    ],
    defaultModel: 'MiniMaxAI/MiniMax-M3',
  },
  {
    id: 'webllm',
    label: 'Local in-browser (FREE, no key)',
    kind: 'webllm',
    requiresKey: false,
    models: [
      {
        id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
        label: 'Llama 3.2 1B (~900 MB download)',
        inPrice: 0,
        outPrice: 0,
        blurb: 'Runs on your own GPU — free, private, and works offline once downloaded; keep arguments short',
      },
      { id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC', label: 'Llama 3.2 3B (~2.3 GB download)', inPrice: 0, outPrice: 0 },
      { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi 3.5 Mini (~2.5 GB download)', inPrice: 0, outPrice: 0 },
      { id: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Gemma 2 2B (~1.5 GB download)', inPrice: 0, outPrice: 0 },
      { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 7B (~4.5 GB download)', inPrice: 0, outPrice: 0 },
    ],
    defaultModel: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    note: 'Runs entirely in your browser via WebGPU — completely free, no API key, private. The model downloads once and is cached. Requires a WebGPU browser (Chrome/Edge; recent Safari).',
  },
]

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]
}

/**
 * One-line description of a model's character, for the collapsed settings summary.
 * Falls back to a derived description because the live catalog refresh can surface
 * hundreds of models that no hand-written table could cover.
 */
export function describeModel(model: ModelOption | undefined, provider: Provider): string {
  if (!model) return 'No model selected'
  if (model.blurb) return model.blurb
  if (provider.kind === 'webllm') return 'Runs entirely on your device — free and private, nothing is sent anywhere'

  const traits: string[] = []
  if (isFreeModel(model)) traits.push('free to use')
  else if (!model.unknownPrice) {
    const perMTok = model.inPrice + model.outPrice
    if (perMTok <= 1) traits.push('very cheap')
    else if (perMTok >= 20) traits.push('premium tier')
  }
  if (provider.id === 'groq') traits.push('extremely fast')
  traits.push(
    model.reasoning
      ? 'thinks before answering, so it handles multi-step arguments well'
      : 'answers directly, so it is fast and predictable'
  )
  if (model.search) traits.push('can search the web for real sources')

  const sentence = traits.join(' · ')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** Whether this model can produce genuine, verifiable source links. */
export function canSearchWeb(provider: Provider, model: ModelOption | undefined): boolean {
  if (!model) return false
  // Gemini and Anthropic ground natively; on OpenRouter the web plugin works on any model
  if (provider.kind === 'gemini' || provider.kind === 'anthropic') return true
  if (provider.id === 'openrouter') return true
  return !!model.search
}

// ---------------------------------------------------------------------------
// Live model catalog refresh
// ---------------------------------------------------------------------------

const CATALOG_KEY = (providerId: string) => `models_cache_${providerId}`

export interface CachedCatalog {
  fetchedAt: number
  models: ModelOption[]
}

export function loadCachedCatalog(providerId: string): CachedCatalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_KEY(providerId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.models) && parsed.models.length ? parsed : null
  } catch {
    return null
  }
}

export function saveCachedCatalog(providerId: string, models: ModelOption[]): CachedCatalog {
  const entry = { fetchedAt: Date.now(), models }
  try {
    localStorage.setItem(CATALOG_KEY(providerId), JSON.stringify(entry))
  } catch {
    // storage full or blocked — the refresh still applies for this session
  }
  return entry
}

export function clearCachedCatalog(providerId: string) {
  localStorage.removeItem(CATALOG_KEY(providerId))
}

/** Models shown for a provider: cached live catalog if present, else the built-in list. */
export function modelsFor(provider: Provider): ModelOption[] {
  return loadCachedCatalog(provider.id)?.models ?? provider.models
}

const looksLikeReasoningModel = (id: string) =>
  /(^|[/\-._])(o[1-9]|gpt-5|gpt-oss|reasoner|reasoning|thinking|nemotron|magistral|qwq|r1)([/\-._]|$)/i.test(id)

/**
 * Fetch the provider's current model list. OpenRouter is keyless and returns
 * live pricing; the others need the user's key and return ids only, so pricing
 * is carried over from the built-in catalog where known.
 */
export async function fetchLiveModels(provider: Provider, apiKey: string): Promise<ModelOption[]> {
  if (!provider.modelsUrl) throw new Error('This provider has no model list to refresh.')

  const known = new Map(provider.models.map((m) => [m.id, m]))
  const headers: Record<string, string> = {}
  let url = provider.modelsUrl

  if (provider.id === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
    url += '?limit=100'
  } else if (provider.kind === 'gemini') {
    headers['x-goog-api-key'] = apiKey
    url += '?pageSize=200'
  } else if (provider.id !== 'openrouter') {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Could not load models (HTTP ${response.status})`)
  }

  let models: ModelOption[] = []

  if (provider.id === 'openrouter') {
    models = (data?.data ?? [])
      .filter((m: any) => !m.id.includes(':batch') && parseFloat(m.pricing?.prompt ?? '0') >= 0)
      .map((m: any) => {
        const inPrice = +(parseFloat(m.pricing?.prompt || '0') * 1e6).toFixed(4)
        const outPrice = +(parseFloat(m.pricing?.completion || '0') * 1e6).toFixed(4)
        const free = m.id.endsWith(':free')
        // OpenRouter's own name usually already ends with "(free)"
        const name = String(m.name || m.id).replace(/\s*\(free\)\s*$/i, '')
        return {
          id: m.id,
          label: `${name}${free ? ' (FREE)' : ''}`,
          inPrice,
          outPrice,
          reasoning: (m.supported_parameters || []).includes('reasoning') || looksLikeReasoningModel(m.id),
          search: (m.supported_parameters || []).includes('web_search_options'),
        }
      })
      // Free models first, then cheapest first
      .sort((a: ModelOption, b: ModelOption) => {
        const aFree = a.inPrice === 0 && a.outPrice === 0
        const bFree = b.inPrice === 0 && b.outPrice === 0
        if (aFree !== bFree) return aFree ? -1 : 1
        return a.inPrice + a.outPrice - (b.inPrice + b.outPrice)
      })
  } else {
    // Everyone else returns ids without pricing.
    const raw: any[] = data?.data ?? data?.models ?? []
    models = raw
      .map((m: any) => {
        const id = String(m.id ?? m.name ?? '').replace(/^models\//, '')
        if (!id) return null
        // Gemini lists embedding/image models too — keep only chat-capable ones
        if (provider.kind === 'gemini') {
          const methods: string[] = m.supportedGenerationMethods || m.supportedActions || []
          if (methods.length && !methods.includes('generateContent')) return null
        }
        const hit = known.get(id)
        if (hit) return hit
        return {
          id,
          label: id,
          inPrice: 0,
          outPrice: 0,
          unknownPrice: true,
          reasoning: looksLikeReasoningModel(id),
        } as ModelOption
      })
      .filter(Boolean) as ModelOption[]

    // Curated models first (they carry real pricing and friendly labels)
    models.sort((a, b) => Number(known.has(b.id)) - Number(known.has(a.id)))
  }

  if (!models.length) throw new Error('The provider returned no usable models.')
  return models
}

// ---------------------------------------------------------------------------
// Cost accounting
// ---------------------------------------------------------------------------

export interface Usage {
  inputTokens: number
  outputTokens: number
  /** Hidden reasoning tokens, when the provider reports them (billed as output) */
  reasoningTokens?: number
  /** Exact cost reported by the provider, preferred over our own calculation */
  reportedCostUsd?: number
}

export function costOf(model: ModelOption | undefined, usage: Usage | null): number | null {
  if (!usage || !model) return null
  if (typeof usage.reportedCostUsd === 'number') return usage.reportedCostUsd
  if (model.unknownPrice) return null
  return (usage.inputTokens / 1e6) * model.inPrice + (usage.outputTokens / 1e6) * model.outPrice
}

/** Rough token count for pre-flight estimates — ~4 characters per token. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4)

/**
 * Pre-flight cost estimate for one brief + one detailed rebuttal.
 * Output is assumed to be a typical answer length plus, for reasoning models,
 * the hidden thinking they bill as output.
 */
export function estimateCost(model: ModelOption | undefined, argument: string): number | null {
  if (!model || model.unknownPrice) return null
  const promptTokens = estimateTokens(argument) + 120 // + system prompt
  const inputTokens = promptTokens * 2 // brief + detailed calls
  const visibleOut = 120 + 550
  const thinkingOut = model.reasoning ? 900 : 0
  return (inputTokens / 1e6) * model.inPrice + ((visibleOut + thinkingOut) / 1e6) * model.outPrice
}

export function formatCost(usd: number | null): string {
  if (usd === null) return 'unknown'
  if (usd === 0) return 'Free'
  if (usd < 0.01) return `<$0.01 (${(usd * 100).toFixed(3)}¢)`
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`
}

export function isFreeModel(model: ModelOption | undefined): boolean {
  return !!model && !model.unknownPrice && model.inPrice === 0 && model.outPrice === 0
}

// ---------------------------------------------------------------------------
// Call adapters
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 120_000

export interface Citation {
  url: string
  title: string
  /** Excerpt from the page, when the source provided one (Tavily does) */
  snippet?: string
}

export interface GenerateArgs {
  provider: Provider
  model: ModelOption
  apiKey: string
  system: string
  userContent: string
  /** 'brief' is a 1-2 sentence answer; 'detailed' is a multi-paragraph one */
  length: 'brief' | 'detailed'
  /** Ask the provider to search the web so the answer carries real citations */
  webSearch?: boolean
  onStatus?: (message: string) => void
}

export interface GenerateResult {
  text: string
  usage: Usage | null
  citations?: Citation[]
}

/**
 * Output budget. Reasoning models spend this budget on hidden thinking BEFORE
 * emitting anything visible, so they need far more headroom than the answer
 * itself requires. Search results are injected into the response turn too, so
 * a grounded answer needs headroom even on a non-reasoning model.
 */
function budgetFor(model: ModelOption, length: 'brief' | 'detailed', attempt = 0, webSearch = false): number {
  const base = model.reasoning ? (length === 'brief' ? 4000 : 8000) : length === 'brief' ? 400 : 2000
  return Math.max(base, webSearch ? 4000 : 0) * (attempt + 1)
}

/** Same URL often appears in several citations; keep the first title we saw. */
function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>()
  for (const c of citations) {
    if (!c?.url || seen.has(c.url)) continue
    seen.set(c.url, { url: c.url, title: c.title || new URL(c.url, 'https://x').hostname || c.url })
  }
  return [...seen.values()]
}

/** A request rejected because this model/account cannot use the search tool. */
class SearchUnsupportedError extends Error {}

class ReasoningStarvationError extends Error {
  constructor() {
    super('starved')
  }
}

async function parseJsonSafe(response: Response): Promise<any> {
  return response.json().catch(() => null)
}

function providerErrorMessage(data: any, status: number): string {
  const err = data?.error ?? data
  const detail =
    err?.metadata?.raw ||
    err?.metadata?.provider_name ||
    (typeof err?.metadata === 'string' ? err.metadata : '') ||
    ''
  const base = err?.message || data?.message || `HTTP ${status}`
  const text = detail && !String(base).includes(String(detail)) ? `${base} — ${detail}` : base
  return String(text).slice(0, 400)
}

// --- Anthropic --------------------------------------------------------------

async function callAnthropic(args: GenerateArgs, attempt: number): Promise<GenerateResult> {
  const { model, apiKey, system, userContent, length, webSearch } = args
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for direct browser (CORS) calls to the Anthropic API
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: budgetFor(model, length, attempt, webSearch),
      system,
      messages: [{ role: 'user', content: userContent }],
      // Basic version: widest model support, flattest response, ZDR-eligible
      ...(webSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) {
    const message = providerErrorMessage(data, response.status)
    // The model may not support the tool, or an admin disabled search org-wide
    if (webSearch && response.status === 400 && /web.?search|tool/i.test(message)) {
      throw new SearchUnsupportedError(message)
    }
    throw new Error(message)
  }

  const usage: Usage = {
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  }

  const blocks: any[] = data?.content ?? []
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()

  // Prefer the citations Claude actually used over every result the search returned
  const cited: Citation[] = blocks
    .filter((block) => block.type === 'text' && Array.isArray(block.citations))
    .flatMap((block) => block.citations)
    .filter((c: any) => c?.url)
    .map((c: any) => ({ url: c.url, title: c.title || '' }))

  if (!cited.length) {
    for (const block of blocks) {
      if (block.type !== 'web_search_tool_result') continue
      // On error this is an object, not an array — guard before iterating
      if (!Array.isArray(block.content)) continue
      for (const result of block.content) {
        if (result?.url) cited.push({ url: result.url, title: result.title || '' })
      }
    }
  }

  if (!text) {
    if (data?.stop_reason === 'refusal') {
      throw new Error('The model declined to generate a rebuttal for this argument.')
    }
    if (data?.stop_reason === 'max_tokens') throw new ReasoningStarvationError()
    throw new Error('The model returned no text. Please try again.')
  }
  return {
    text: data.stop_reason === 'max_tokens' ? `${text}…` : text,
    usage,
    citations: dedupeCitations(cited),
  }
}

// --- OpenAI-compatible (OpenRouter, Groq, Mistral, DeepSeek, xAI, Together) --

/** Provider-specific knobs that genuinely reduce reasoning spend. */
function reasoningControls(provider: Provider, model: ModelOption, allowDisable: boolean): Record<string, unknown> {
  if (!model.reasoning || !allowDisable) return {}

  if (provider.id === 'openrouter') {
    // effort:"none" truly disables; some endpoints reject it (handled by retry)
    return { reasoning: { effort: 'none' } }
  }
  if (provider.id === 'groq') {
    // gpt-oss cannot disable reasoning — "low" is its floor. Qwen accepts "none".
    if (model.id.startsWith('openai/gpt-oss')) return { reasoning_effort: 'low' }
    if (model.id.startsWith('qwen')) return { reasoning_effort: 'none' }
    return {}
  }
  if (provider.id === 'mistral' && /^mistral-(small|medium)/.test(model.id)) {
    return { reasoning_effort: 'none' }
  }
  // DeepSeek/xAI/Together expose no reliable disable switch — budget headroom only.
  return {}
}

async function callOpenAICompatible(args: GenerateArgs, attempt: number, allowDisable = true): Promise<GenerateResult> {
  const { provider, model, apiKey, system, userContent, length, webSearch } = args
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Rebuttal Generator'
  }

  const budget = budgetFor(model, length, attempt, webSearch)
  const body: Record<string, unknown> = {
    model: model.id,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    ...reasoningControls(provider, model, allowDisable),
  }
  // OpenRouter runs the search itself and injects results, so this works on any
  // model — including ones with no tool-calling support. Omit `engine` so native
  // provider search is used where available and Exa elsewhere.
  if (webSearch && provider.id === 'openrouter') {
    body.plugins = [{ id: 'web', max_results: 4 }]
  }
  // Groq prefers max_completion_tokens; reasoning tokens count against both
  if (provider.id === 'groq') body.max_completion_tokens = budget
  else body.max_tokens = budget

  const response = await fetch(provider.baseUrl!, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)

  if (!response.ok) {
    const message = providerErrorMessage(data, response.status)
    // Some endpoints require reasoning and reject any attempt to disable it
    if (allowDisable && response.status === 400 && /reasoning/i.test(message)) {
      return callOpenAICompatible(args, attempt, false)
    }
    throw new Error(message)
  }

  const usage: Usage = {
    inputTokens: data?.usage?.prompt_tokens ?? 0,
    outputTokens: data?.usage?.completion_tokens ?? 0,
    reasoningTokens: data?.usage?.completion_tokens_details?.reasoning_tokens,
    reportedCostUsd: typeof data?.usage?.cost === 'number' ? data.usage.cost : undefined,
  }

  const message = data?.choices?.[0]?.message
  let content = message?.content
  if (Array.isArray(content)) {
    content = content
      .filter((part: any) => part?.type === 'text' || typeof part?.text === 'string')
      .map((part: any) => part.text ?? '')
      .join('')
  }
  const text = typeof content === 'string' ? content.trim() : ''
  const finishReason = data?.choices?.[0]?.finish_reason

  if (!text) {
    // Hidden reasoning consumed the whole budget before any answer appeared
    if (finishReason === 'length' || (usage.reasoningTokens ?? 0) > 0) throw new ReasoningStarvationError()
    throw new Error('The model returned no text. Please try again or pick another model.')
  }

  // On chat/completions the citation is NESTED under url_citation — the flat
  // shape belongs to the Responses API and reading it here yields undefined.
  const citations = dedupeCitations(
    (message?.annotations ?? [])
      .filter((a: any) => a?.type === 'url_citation' && a.url_citation?.url)
      .map((a: any) => ({ url: a.url_citation.url, title: a.url_citation.title || '' }))
  )

  return { text: finishReason === 'length' ? `${text}…` : text, usage, citations }
}

// --- Google Gemini ----------------------------------------------------------

function geminiThinkingConfig(model: ModelOption): Record<string, unknown> | undefined {
  if (!model.reasoning) return undefined
  // Gemini 3.x uses thinkingLevel ("minimal" is the floor — no off switch)
  if (/^gemini-3/.test(model.id)) return { thinkingLevel: 'minimal' }
  // Gemini 2.5: budget 0 disables on Flash/Flash-Lite; Pro's minimum is 128
  if (/^gemini-2\.5-pro/.test(model.id)) return { thinkingBudget: 128 }
  return { thinkingBudget: 0 }
}

async function callGemini(args: GenerateArgs, attempt: number): Promise<GenerateResult> {
  const { model, apiKey, system, userContent, length, webSearch } = args
  const thinkingConfig = geminiThinkingConfig(model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      // Orthogonal to systemInstruction and thinkingConfig — same entry for 2.5 and 3.x
      ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        maxOutputTokens: budgetFor(model, length, attempt, webSearch),
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) {
    const message = providerErrorMessage(data, response.status)
    if (webSearch && response.status === 400 && /tool|search|grounding/i.test(message)) {
      throw new SearchUnsupportedError(message)
    }
    throw new Error(message)
  }

  const meta = data?.usageMetadata ?? {}
  const usage: Usage = {
    inputTokens: meta.promptTokenCount ?? 0,
    // Thinking tokens are billed as output but reported separately
    outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
    reasoningTokens: meta.thoughtsTokenCount,
  }

  const candidate = data?.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .filter((part: any) => typeof part?.text === 'string' && !part.thought)
    .map((part: any) => part.text)
    .join('')
    .trim()

  // Non-web chunk kinds exist (maps, retrievedContext), so guard on .web
  const citations = dedupeCitations(
    (candidate?.groundingMetadata?.groundingChunks ?? [])
      .map((chunk: any) => chunk?.web)
      .filter((web: any) => web?.uri)
      .map((web: any) => ({ url: web.uri, title: web.title || '' }))
  )

  if (!text) {
    const reason = candidate?.finishReason || data?.promptFeedback?.blockReason
    if (reason === 'MAX_TOKENS') throw new ReasoningStarvationError()
    throw new Error(reason ? `The model returned no text (${reason}).` : 'The model returned no text.')
  }
  return { text, usage, citations }
}

// --- Cohere -----------------------------------------------------------------

async function callCohere(args: GenerateArgs, attempt: number): Promise<GenerateResult> {
  const { provider, model, apiKey, system, userContent, length } = args
  const response = await fetch(provider.baseUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      max_tokens: budgetFor(model, length, attempt),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) throw new Error(providerErrorMessage(data, response.status))

  const usage: Usage = {
    inputTokens: data?.usage?.tokens?.input_tokens ?? data?.usage?.billed_units?.input_tokens ?? 0,
    outputTokens: data?.usage?.tokens?.output_tokens ?? data?.usage?.billed_units?.output_tokens ?? 0,
  }

  const text = (data?.message?.content ?? [])
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim()

  if (!text) {
    if (data?.finish_reason === 'MAX_TOKENS') throw new ReasoningStarvationError()
    throw new Error('The model returned no text. Please try again.')
  }
  return { text, usage }
}

// --- WebLLM (in-browser) ----------------------------------------------------

// The engine is a module-level singleton so the loaded model stays in memory
// (and its weights cached on disk) across generations.
let webllmEngine: any = null
let webllmLoadedModel = ''

async function callWebLLM(args: GenerateArgs): Promise<GenerateResult> {
  const { model, system, userContent, length, onStatus } = args
  if (!('gpu' in navigator)) {
    throw new Error(
      'Local models need WebGPU, which this browser does not support. Use a recent Chrome, Edge, or Safari — or pick a cloud provider.'
    )
  }

  const webllm = await import('@mlc-ai/web-llm')

  if (!webllmEngine || webllmLoadedModel !== model.id) {
    onStatus?.('Preparing local model (first use downloads it once)…')
    const progress = (report: { text: string }) => onStatus?.(report.text)
    if (webllmEngine) {
      await webllmEngine.reload(model.id)
    } else {
      webllmEngine = await webllm.CreateMLCEngine(model.id, { initProgressCallback: progress })
    }
    webllmLoadedModel = model.id
  }

  onStatus?.('Generating locally…')
  const result = await webllmEngine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    max_tokens: length === 'brief' ? 400 : 2000,
    temperature: 0.7,
  })

  const text = result?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('The local model returned no text. Please try again.')
  return {
    text,
    usage: {
      inputTokens: result?.usage?.prompt_tokens ?? 0,
      outputTokens: result?.usage?.completion_tokens ?? 0,
    },
  }
}

async function dispatch(args: GenerateArgs, attempt: number): Promise<GenerateResult> {
  switch (args.provider.kind) {
    case 'anthropic':
      return callAnthropic(args, attempt)
    case 'gemini':
      return callGemini(args, attempt)
    case 'cohere':
      return callCohere(args, attempt)
    case 'webllm':
      return callWebLLM(args)
    default:
      return callOpenAICompatible(args, attempt)
  }
}

export async function generateText(args: GenerateArgs): Promise<GenerateResult> {
  try {
    return await dispatch(args, 0)
  } catch (err) {
    // This model or account cannot search — produce an answer anyway, unsourced
    if (err instanceof SearchUnsupportedError) {
      args.onStatus?.('This model cannot search the web — answering without sources…')
      return dispatch({ ...args, webSearch: false }, 0)
    }
    if (!(err instanceof ReasoningStarvationError)) throw err
    // The model spent its whole budget thinking. Retry once with double the room.
    args.onStatus?.('Model needed more room to think — retrying with a larger budget…')
    try {
      return await dispatch(args, 1)
    } catch (retryErr) {
      if (retryErr instanceof ReasoningStarvationError) {
        throw new Error(
          `${args.model.label} used its entire output budget on internal reasoning without answering. Try a model without the reasoning tag, or a shorter argument.`
        )
      }
      throw retryErr
    }
  }
}

// Local models can only run one generation at a time; cloud calls parallelize.
export function supportsParallelCalls(provider: Provider): boolean {
  return provider.kind !== 'webllm'
}
