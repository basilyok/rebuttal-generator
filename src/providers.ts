// AI provider registry and call adapters.
//
// Every cloud provider here was empirically verified to allow CORS calls from
// the browser (this is a client-side-only app — providers that block browser
// CORS, like OpenAI's direct API, cannot be used; OpenAI models are available
// via OpenRouter instead). "webllm" runs models fully in-browser via WebGPU —
// free, no API key, private.

export interface ModelOption {
  id: string
  label: string
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
  models: ModelOption[]
  defaultModel: string
  note?: string
}

export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude (paid)',
    kind: 'anthropic',
    requiresKey: true,
    keyUrl: 'https://console.anthropic.com',
    keyPlaceholder: 'sk-ant-…',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast & cheap)' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-fable-5', label: 'Claude Fable 5 (most capable)' },
    ],
    defaultModel: 'claude-haiku-4-5-20251001',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier + paid)',
    kind: 'gemini',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free tier)' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (free tier)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)' },
    ],
    defaultModel: 'gemini-2.5-flash',
    note: 'Free tier available — generous daily limits with a free Google AI Studio key.',
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
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
      { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2' },
      { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B' },
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
    models: [
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B (FREE)' },
      { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (FREE)' },
      { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (FREE)' },
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B (FREE)' },
      { id: 'openai/gpt-5.1', label: 'GPT-5.1 (paid)' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini (paid)' },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (paid)' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (paid)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (paid)' },
    ],
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    note: 'One free key unlocks genuinely free models, plus paid access to GPT, Claude, Gemini and 300+ others.',
  },
  {
    id: 'mistral',
    label: 'Mistral (free tier + paid)',
    kind: 'openai',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small (free tier)' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium' },
      { id: 'mistral-large-latest', label: 'Mistral Large' },
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
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'xai',
    label: 'xAI Grok (paid)',
    kind: 'openai',
    requiresKey: true,
    keyUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-…',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    models: [
      { id: 'grok-4', label: 'Grok 4' },
      { id: 'grok-4-fast-non-reasoning', label: 'Grok 4 Fast' },
      { id: 'grok-4-fast-reasoning', label: 'Grok 4 Fast (reasoning)' },
      { id: 'grok-3-mini', label: 'Grok 3 Mini' },
    ],
    defaultModel: 'grok-4-fast-non-reasoning',
  },
  {
    id: 'cohere',
    label: 'Cohere (free trial + paid)',
    kind: 'cohere',
    requiresKey: true,
    keyIsFree: true,
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    baseUrl: 'https://api.cohere.com/v2/chat',
    models: [
      { id: 'command-a-03-2025', label: 'Command A' },
      { id: 'command-r-plus', label: 'Command R+' },
      { id: 'command-r', label: 'Command R' },
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
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo' },
    ],
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  {
    id: 'webllm',
    label: 'Local in-browser (FREE, no key)',
    kind: 'webllm',
    requiresKey: false,
    models: [
      { id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', label: 'Llama 3.2 1B (~900 MB download)' },
      { id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC', label: 'Llama 3.2 3B (~2.3 GB download)' },
      { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi 3.5 Mini (~2.5 GB download)' },
      { id: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Gemma 2 2B (~1.5 GB download)' },
      { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 7B (~4.5 GB download)' },
    ],
    defaultModel: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    note: 'Runs entirely in your browser via WebGPU — completely free, no API key, private. The model downloads once and is cached. Requires a WebGPU browser (Chrome/Edge; recent Safari).',
  },
]

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]
}

// ---------------------------------------------------------------------------
// Call adapters — each returns the generated text or throws a friendly Error.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 90_000

interface GenerateArgs {
  provider: Provider
  model: string
  apiKey: string
  system: string
  userContent: string
  maxTokens: number
  onStatus?: (message: string) => void
}

async function parseJsonSafe(response: Response): Promise<any> {
  return response.json().catch(() => null)
}

function extractOpenAIText(data: any): { text: string; finishReason?: string } {
  const message = data?.choices?.[0]?.message
  let content = message?.content
  if (Array.isArray(content)) {
    content = content
      .filter((part: any) => part?.type === 'text' || typeof part?.text === 'string')
      .map((part: any) => part.text ?? '')
      .join('')
  }
  return {
    text: typeof content === 'string' ? content.trim() : '',
    finishReason: data?.choices?.[0]?.finish_reason,
  }
}

async function callAnthropic({ model, apiKey, system, userContent, maxTokens }: GenerateArgs): Promise<string> {
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
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(data?.error?.message || `API error (HTTP ${response.status})`)
  }

  const text = (data?.content ?? [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
    .join('')
    .trim()

  if (!text) {
    throw new Error(
      data?.stop_reason === 'refusal'
        ? 'The model declined to generate a rebuttal for this argument.'
        : 'The model returned no text. Please try again.'
    )
  }
  return data.stop_reason === 'max_tokens' ? `${text}…` : text
}

async function callOpenAICompatible({ provider, model, apiKey, system, userContent, maxTokens }: GenerateArgs): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Rebuttal Generator'
  }

  const response = await fetch(provider.baseUrl!, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `API error (HTTP ${response.status})`)
  }

  const { text, finishReason } = extractOpenAIText(data)
  if (!text) {
    throw new Error(
      finishReason === 'length'
        ? 'The model ran out of tokens before producing text. Try a non-reasoning model.'
        : 'The model returned no text. Please try again or pick another model.'
    )
  }
  return finishReason === 'length' ? `${text}…` : text
}

async function callGemini({ model, apiKey, system, userContent, maxTokens }: GenerateArgs): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      // Headroom above maxTokens because Gemini 2.5+ spends output budget on
      // internal thinking before the visible answer
      generationConfig: { maxOutputTokens: maxTokens + 1500 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(data?.error?.message || `API error (HTTP ${response.status})`)
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .filter((part: any) => typeof part?.text === 'string' && !part.thought)
    .map((part: any) => part.text)
    .join('')
    .trim()

  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason
    throw new Error(reason ? `The model returned no text (${reason}).` : 'The model returned no text. Please try again.')
  }
  return text
}

async function callCohere({ provider, model, apiKey, system, userContent, maxTokens }: GenerateArgs): Promise<string> {
  const response = await fetch(provider.baseUrl!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const data = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || `API error (HTTP ${response.status})`)
  }

  const text = (data?.message?.content ?? [])
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim()

  if (!text) throw new Error('The model returned no text. Please try again.')
  return text
}

// WebLLM engine is a module-level singleton — the loaded model stays in memory
// (and its weights cached on disk) across generations.
let webllmEngine: any = null
let webllmLoadedModel = ''

async function callWebLLM({ model, system, userContent, maxTokens, onStatus }: GenerateArgs): Promise<string> {
  if (!('gpu' in navigator)) {
    throw new Error(
      'Local models need WebGPU, which this browser does not support. Use a recent Chrome, Edge, or Safari — or pick a cloud provider.'
    )
  }

  const webllm = await import('@mlc-ai/web-llm')

  if (!webllmEngine || webllmLoadedModel !== model) {
    onStatus?.('Preparing local model (first use downloads it once)…')
    const progress = (report: { text: string }) => onStatus?.(report.text)
    if (webllmEngine) {
      await webllmEngine.reload(model)
    } else {
      webllmEngine = await webllm.CreateMLCEngine(model, { initProgressCallback: progress })
    }
    webllmLoadedModel = model
  }

  onStatus?.('Generating locally…')
  const result = await webllmEngine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  })

  const text = result?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('The local model returned no text. Please try again.')
  return text
}

export async function generateText(args: GenerateArgs): Promise<string> {
  switch (args.provider.kind) {
    case 'anthropic':
      return callAnthropic(args)
    case 'gemini':
      return callGemini(args)
    case 'cohere':
      return callCohere(args)
    case 'webllm':
      return callWebLLM(args)
    default:
      return callOpenAICompatible(args)
  }
}

// Local models can only run one generation at a time; cloud calls parallelize.
export function supportsParallelCalls(provider: Provider): boolean {
  return provider.kind !== 'webllm'
}
