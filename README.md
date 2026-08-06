# Rebuttal Generator

An installable web app that writes a reply designed to **change the mind of the specific
person who made the argument** — not to score points for an audience.

Paste an argument, speak it, or give it a URL. You get one message you could actually
send, grounded in sources that were really retrieved, plus a private briefing that tells
you the weakest point in *your own* position before you send anything.

How it writes is governed by **[CONSTITUTION.md](CONSTITUTION.md)** — eleven rules drawn from
the research on what actually changes minds. Read that first if you plan to change the
prompts.

**🌍 Live at [rebut.m36x.com](https://rebut.m36x.com/) on Cloudflare Pages** • **📱 Fully PWA-enabled** • **⚡ [Deployment guide](DEPLOYMENT_GUIDE.md)**

## Features

- 🎤 **Voice, Text, or URL Input**: Dictate the argument via the browser microphone (Web Speech API), type it, or paste a link to an article and let the app pull the text in
- 🤖 **A short, curated model list**: nine providers, thirty-one models — every *cloud* model here can hold this app's long, constraint-heavy prompt. Anthropic Claude, Google Gemini, Groq, xAI Grok, Moonshot Kimi, Z.ai GLM, DeepSeek, OpenRouter (the only browser route to GPT), or a model running locally in your browser with no API key at all (WebLLM/WebGPU — a deliberate exception to that bar, kept because it is the only option where nothing leaves your device)
- 🎁 **Instant mode**: no key yet? You still get 3 free replies a day (6 signed in), paid for by this app's own OpenRouter key — enough to find out whether it is worth setting up a key of your own. See [Instant mode](#instant-mode--try-it-with-no-key)
- 🔗 **Real sources on every model**: the app searches the web itself (Tavily, keyless — no account needed) and the reply may cite *only* what was actually retrieved. Any URL the model invents is stripped before you see it
- ⚠️ **The weak link in your own position**, shown every time, before you send — if the other side is better supported, it says so
- ⚖️ **Their best case, and where you answer it**: a private briefing that checks your reply actually addresses their strongest argument, and flags anything it leaves unanswered
- 📤 **Shareable links**: publish a result to an unguessable URL you can send to anyone — it unfurls with a title and an excerpt on platforms that show previews
- 🕘 **Reply history**: every reply is saved on this device automatically; sign in and unlock your vault and the newest 100 sync across your devices as ciphertext the server cannot read. See [Your reply history](#your-reply-history)
- 💰 **Cost transparency**: estimated cost before you generate, actual cost and token counts after, and a running session total
- ↻ **Off-menu access**: the curated list is a recommendation, not a cage — ↻ Refresh pulls any provider's full live catalog at runtime, so new releases appear without a code change
- 🎨 **Beautiful UI**: Modern, responsive design that works on desktop and mobile
- 🔒 **Secure**: Your API key is stored locally in browser storage and sent only to the provider it belongs to — never to this app's own servers. Your argument text stays in the browser too, with one explicit exception — Instant mode, which sends it to this app's `/api/generate` function so our key can pay for the reply. History sync is not a second exception: it uploads ciphertext the server cannot read. See [Privacy & Security](#privacy--security)
- 📱 **PWA (Progressive Web App)**: Install on phone/desktop; the app shell loads offline after your first visit (generating rebuttals requires internet)
- ⚡ **Lightning Fast**: Vite builds + service worker caching = instant loads

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **AI**: 8 cloud providers via direct browser API calls (see below), plus in-browser inference via [WebLLM](https://webllm.mlc.ai/) (WebGPU)
- **Speech Recognition**: Web Speech API (native browser)

## Instant mode — try it with no key

You don't need an API key to find out whether this app is worth one. With no
key saved, **Write my reply** still works: Instant mode gives you **3 free
replies a day** — 6 if you sign in — paid for by this app's own OpenRouter key.

The honest fine print:

- **The cap is daily** and resets at midnight UTC. When it runs out, the app
  says so and tells you when it resets. Signing in doubles the cap; a key of
  your own removes it entirely.
- **Your argument makes one server hop.** Because our key pays for the reply,
  the browser sends the argument text and the structured fields around it (the
  optional recipient line, language choices, retrieved citations) to this
  app's `/api/generate` function, which builds the prompt server-side and
  calls the model. Nothing you send is logged or stored; quota is counted
  against an anonymous `rb_device` cookie (or your account, when signed in),
  and the counter keeps an opaque id and a number — never your text.
- **Long texts need your own key**: Instant mode caps input at 12,000
  characters.
- **A Cloudflare Turnstile check** runs invisibly in the background to keep
  bots from draining the free pool. Most people never see it.

Saving a key for the provider you have selected switches Instant mode off for
that provider — those calls go browser-direct, with no daily cap, and your text
stops touching this app's servers. The gate is per provider: switch to a
provider you have no key saved for and Instant mode picks the reply up again,
server hop included.

## Choosing an AI

| Provider | Cost | API key? | Models |
|----------|------|----------|--------|
| OpenRouter | Free models + paid | Yes (free) | **GLM-5.2** (the default — frontier-class at $0.28/$0.89), **Nemotron 3 Ultra 550B** and **Gemma 4 31B** (genuinely free), **GPT-5.6 Luna / Sol** — the only browser route to GPT — MiniMax M3, plus **every other vendor's flagship** grouped by vendor (Claude Fable 5 and Sonnet 5, Gemini 3.6 Flash and 3.1 Flash-Lite, DeepSeek V4 Pro, Kimi K3, Grok 4.5), so one key covers the field |
| Google Gemini | Free tier + paid | Yes (free) | Gemini 3.1 Flash-Lite, Gemini 3.6 Flash — free tier on both |
| Groq | Free tier | Yes (free) | Llama 3.3 70B, GPT-OSS 120B — the fastest responses here |
| Anthropic Claude | Paid | Yes | Claude Haiku 4.5 / **Sonnet 5** / Opus 5 / Fable 5 |
| xAI Grok | Paid | Yes | **Grok 4.3**, Grok 4.20 (no hidden thinking), Grok 4.5 |
| Moonshot Kimi | Paid | Yes | **Kimi K2.6**, Kimi K3 |
| Z.ai GLM | Paid (cheap) | Yes | **GLM-5.2**, GLM-4.7 |
| DeepSeek | Paid (very cheap) | Yes | DeepSeek V4 Pro — frontier reasoning at ~1/10 the price |
| Local in-browser (WebLLM) | **Free** | **No** | Qwen 2.5 7B, Llama 3.2 3B on your own GPU via WebGPU; downloads once, nothing leaves your device |

Every provider here was verified to support direct browser (CORS) calls: with
your own key there is no proxy in the path — the browser talks straight to the
provider. The one server-side generation call in the app is Instant mode's
`/api/generate`, which exists only for visitors with no key and spends this
app's key, never yours. API keys are stored per-provider in your browser's
local storage and sent only to that provider.

**Why OpenAI is not in that list.** It is not an oversight, and it is not quite
true to say OpenAI "blocks browser calls" — the reality is more specific, and
worth writing down so nobody re-tests it badly. `api.openai.com` answers browser
requests, and its CORS preflight explicitly permits what we need
(`Access-Control-Allow-Headers: authorization,content-type`, methods
`GET, OPTIONS, POST`). The block is on the *actual* response: send a request with
no `Authorization` header and it returns `Access-Control-Allow-Origin: *`; add
one and that header vanishes, so the browser will not let the page read the
reply. Any call carrying your key is therefore unreadable from a web page — which
is deliberate on OpenAI's part, and stops sites leaking users' keys. Because the
preflight looks healthy, testing `OPTIONS` alone will tell you it works; only the
real request shows otherwise. GPT is reached through OpenRouter instead, where
the full Luna / Terra / Sol range is available.

### Why the list is short

The bar is not "the API works." This app asks a model to hold a long,
almost entirely *negative* prompt — a fixed eight-step structure, plain prose
with no markdown, a list of banned phrases, and citations drawn only from a
supplied set (see [CONSTITUTION.md](CONSTITUTION.md)). A model that cannot hold
it does not return a slightly worse reply; it returns bullet points,
"Actually,", and an invented statistic — in a message you might send to your
father-in-law. **A model that produces a message you would regret sending is
worse than no model.**

So a model earns a slot only if it (1) can hold that prompt — which rules out
roughly anything under 30B, (2) beats everything else here on price *and*
quality, and (3) has actually worked in this app. Two things that used to
justify entries no longer do: native web search is irrelevant now that Tavily
grounds every provider, and duplicate routes to the same model are not choice.

**The curated list is a recommendation, not a limit.** ↻ Refresh loads any
provider's full live catalog — 360+ models on OpenRouter alone — so nothing is
actually out of reach.

### Cost estimates

The app shows an estimated cost per rebuttal under the model dropdown, and the
actual cost (with token counts) after each generation, plus a running session
total. Prices come from each model's published per-million-token rates and are
listed in `src/providers.ts`. Where a provider reports exact spend — OpenRouter
returns `usage.cost` — that real figure is used instead of the estimate. Free
models and local in-browser models show **Free**.

Estimates for reasoning models include the hidden "thinking" tokens, which are
billed as output tokens and typically dominate the cost of a short answer.

### Reasoning models

Most current models are *reasoning* models: they generate hidden thinking
tokens before the visible answer, drawn from the same output budget. A budget
that is too small is consumed entirely by thinking, and the API returns empty
content with a `length` finish reason. The app handles this by giving reasoning
models a much larger budget, asking each provider to minimise reasoning where
its API allows it, and automatically retrying once with double the budget if a
response still comes back empty.

Every provider spells that request differently, and several models refuse it
outright, so the app tracks it per model in `reasoningControls()`:

| Provider | How reasoning is reduced | Models that refuse to stop thinking |
|---|---|---|
| OpenRouter | `reasoning.effort: "none"` | — |
| Groq | `reasoning_effort: "low"` on GPT-OSS | GPT-OSS 120B (floor is "low") |
| Gemini | `thinkingConfig` | Gemini 3.x (floor is "minimal") |
| xAI Grok | `reasoning_effort: "none"` — **accepted only by Grok 4.3** | Grok 4.5 (always "high") |
| Moonshot Kimi | `thinking: {type: "disabled"}` on K2.6 | Kimi K3 (floor is "low") |
| Z.ai GLM | `thinking: {type: "disabled"}` on GLM-5.2 | GLM-4.7 ("thinks compulsorily") |
| DeepSeek | no switch exists — budget headroom only | DeepSeek V4 Pro |

Sending the wrong one is an error rather than a no-op — `reasoning_effort` on any
Grok other than 4.3 is rejected — which is why these are gated per model and not
per provider. Where a model cannot be quietened, its real cost runs above the
headline rate, and the catalog note for that provider says so.

If a model still fails this way, the non-reasoning options sidestep it entirely:
**Claude Haiku 4.5**, **Groq Llama 3.3 70B**, **Grok 4.20**, **Gemma 4 31B** and
both local in-browser models answer directly with no hidden thinking. They are
not the cheapest — several reasoning models here cost less — but they are the
most predictable.

## Rebutting an article from a URL

Switch the input to **🔗 Article URL**, paste a link, and the app pulls the
article's text into the editable box so you can review or trim it before
generating.

Extraction runs in a Cloudflare Pages Function (`functions/api/article.js`) on
the same deployment, because browsers cannot fetch third-party pages directly —
almost no publisher sends permissive CORS headers. The function fetches the page
at the edge, pulls the prose out with `HTMLRewriter`, and caps the result at
~20,000 characters to keep requests and costs bounded. **Only the article URL is
sent to it — your API keys never leave the browser.** It rejects non-public
addresses (localhost, private ranges) so it cannot be used to probe internal
networks. When run locally with `npm run dev` no function is served, so the app
falls back to [Jina Reader](https://jina.ai/reader/), a CORS-enabled reader
service.

**When an article isn't readable** — a paywall, a login wall, or a bot check —
the function looks for a publicly archived copy in the
[Internet Archive's Wayback Machine](https://web.archive.org/) and uses that if
one exists, labelling the result so you know where the text came from. If there
is no readable copy anywhere, you get a plain-English message asking you to open
the article and paste its text instead, which always works.

A note on scope: this uses ordinary reader extraction plus a public library
archive. It is not a paywall bypass, and it will not defeat publishers' access
controls — if an article is paywalled and unarchived, the app tells you so
rather than trying to work around it. (`removepaywall.com`, mentioned as a
possible option, publishes no API — it is a browser UI only — so it cannot be
called from code in any case.)

## What you get back

Two zones, deliberately separated — mixing them is how you end up pasting your own doubts
to the person you're trying to convince.

**The send zone** is one message, written to be sent as-is. It opens by restating their
actual claim, concedes something real, gives them an off-ramp *before* disagreeing, then
carries the evidence. The Copy button takes this and nothing else.

**The briefing** is for you and is labelled "don't send": the weakest point in your own
position, anything you should verify first, and their strongest case mapped against the
paragraph of your reply that answers it — with anything unanswered flagged.

## Sources — and why a fabricated URL is structurally impossible

**Find real evidence to cite** searches the web *before* generating, using
[Tavily](https://tavily.com). Those results are injected as a fixed, numbered set and the
model is told it may cite only from that set. Afterwards, **any URL in the output that
wasn't in the set is stripped** and reported in the claim badge.

That ordering is the whole point. Asking a model politely not to invent citations does not
work — and the research is explicit that persuasion-tuned generation *systematically
degrades factual accuracy* (Hackenburg et al., *Science* 2025). Making the citation set
fixed and verifying against it turns a request into a guarantee.

Tavily needs **no account and no API key** — the app uses its keyless mode. A free key
(1,000 searches/month, no card) only raises the rate limit, and there's a field for it in
settings. Social platforms and forums are excluded from results: a LinkedIn post is not
evidence that will persuade anyone.

Because the app does its own searching, **every provider can cite sources now** — including
Groq, DeepSeek, Kimi, GLM, Grok and the free local in-browser model, none of which the app
asks to search on their own. If Tavily is unavailable, models with native search (Gemini,
Claude, OpenRouter) fall back to it; otherwise the reply is generated without sources and
the badge says so plainly.

This is also why native search is no longer a reason to keep a model in the curated list:
it only ever runs as a fallback.

## Sharing a rebuttal

**🔗 Get a shareable link** publishes the argument, the rebuttal (with its
strategy line) and any sources to an unguessable URL (`/s/<id>`) backed by
Cloudflare KV. Opening that link shows the result read-only, with a button to
write your own.

That page is served by a Pages Function (`functions/s/[id].js`) that injects
*this* share's Open Graph tags, so on platforms that show previews the link
unfurls as a title and a short excerpt of the reply rather than a bare URL. Two
things about how that is built: every requester gets **byte-identical HTML** —
crawlers are served exactly what people are, because handing them a different
page is the cache-poisoning class this app has been bitten by before — and the
unfurl can only draw on the fields you chose to publish. The private briefing and
the weak-link note are never written to the share record at all, so there is
nothing in it for a preview to leak.

Links minted before this change used the query form (`/?s=<id>`); the app still
recognises that shape indefinitely and reads either one. That is about the URL
shape, not the record behind it — an old link expires on the same schedule as a
new one.

Be aware of what this means: the link is **unlisted, not private**. It is not
browsable, indexed, or discoverable — there is no public gallery — but anyone you
give it to can read it, and so can anyone they forward it to. Links expire after
a year. Your API key is never sent to the sharing service; the endpoint stores
only known fields, so nothing else in the payload can be persisted.

One thing the recipient should know too, since they never agreed to anything:
**every fetch of a `/s/<id>` page increments an anonymous counter** on this
app's server (`share_view`) — a person opening the link, or a platform fetching
it to build the preview — and dismissing the shared view to write your own
increments a second one (`share_cta`). Each is a name, a date and a tally: no
id, no referrer, no user agent, nothing about who opened it or what it said.
That is the whole of what the share funnel records; see
[Privacy & Security](#privacy--security).

## Your reply history

Every reply you generate is saved on this device automatically — signed in or
not, your own key or Instant mode. The **History** button lists them newest
first, any one of them reopens with a click, and you can delete a single entry
or clear the lot. Without an account that is the whole story: history lives in
this browser's IndexedDB and goes no further.

Sign in and unlock your vault — with a password account that is one step, with
Google it is the passphrase — and it syncs. The newest **100 entries** are
encrypted in the browser under the same key that already protects your API keys
and uploaded as a single blob, so your history follows you to a new device
instead of being stranded on one. `functions/api/history.js` is a deliberate
near-clone of the key vault for exactly that reason — it takes the same
`{salt, iv, ciphertext}` record, validates it field by field, and has no code
path that could decrypt it. Deleting an entry or clearing everything pushes the
change up immediately rather than waiting for your next reply. The list and the
sync are both capped at those newest 100.

An entry keeps the argument, the reply, its sources and the weak-link note that
came with it, so restoring one puts all four back in front of you. The briefing
is the one thing it cannot bring back — that was never saved, so a restored
reply hides the briefing expander the way an Instant reply does. The weak-link
note is still never *published*: it goes to your own history — plaintext in this
browser's IndexedDB, sealed as ciphertext if you sync it — and never into a share
link or the message you send.

Two consequences, stated plainly rather than buried:

- **Signing out wipes this device's copy.** The entries and the derived key both
  leave the machine, so signing out on a shared computer leaves nothing readable
  behind. The ciphertext stays on the server, and the next sign-in that unlocks
  the vault pulls it back down.
- **Forgetting the passphrase loses the synced copy.** This is the one place
  where that is a real loss rather than an inconvenience: an API key can always
  be re-read from the provider's console, but a reply you wrote cannot, and
  nobody can decrypt the blob for you — not the operator, not anyone with a full
  dump of the KV namespace. That is the design working as intended, and it is
  the honest price of it. Any device still holding its local copy is unaffected.
  For a password account, the password plays the passphrase's role, so this
  applies to it too — and if you signed up with no email on file, forgetting
  that password costs you the account along with the history, not just the
  history (see [Enabling sign-in on your own
  deployment](#enabling-sign-in-on-your-own-deployment)).

See [`src/history.ts`](src/history.ts) and
[`functions/api/history.js`](functions/api/history.js).

## Keeping the model list current

New models ship constantly. Three ways this stays current, in order of effort:

1. **The ↻ Refresh button** next to the Model dropdown, which fetches the
   provider's live model list at runtime — no code change, no redeploy. The
   result is cached in local storage and the dropdown shows how many models it
   holds and when it was updated. For **OpenRouter this needs no API key at
   all** and returns live per-token pricing for 360+ models, so it is the
   fastest way to reach a brand-new model from any major lab. For other
   providers it uses your stored key and lists their current model IDs
   (pricing shows as unknown for models not in the built-in catalog). The button
   is hidden for providers that publish no model-list endpoint — currently
   **Z.ai**, whose two curated models are therefore the whole list rather than a
   recommendation, which is why both are kept even though one is near-redundant.
2. **Use OpenRouter as the catch-all.** It proxies OpenAI, Anthropic, Google,
   xAI, Meta, Moonshot, Qwen and others, so new releases usually appear there
   first and refresh picks them up automatically.
3. **Edit `src/providers.ts`** to change the curated defaults — the per-provider
   `models` arrays hold the id, label, `inPrice`/`outPrice` (USD per million
   tokens) and a `reasoning` flag. This is the only place model data lives.
   **Read the CURATION RULE comment at the top of that array first**: the list is
   deliberately short, and adding a model that cannot hold the prompt in
   [CONSTITUTION.md](CONSTITUTION.md) makes the app worse, not more capable.

## Accounts, and how your API keys are stored

Signing in is **optional**. Without it the app behaves exactly as it always has:
keys live in this browser's local storage and never leave it. Signing in adds
three things — your keys follow you to a new device, your reply history syncs as
ciphertext once the vault is unlocked, and your language choice sticks to your
account instead of to one browser.

### The keys are encrypted before they leave your browser

This is the part worth understanding, because "let us hold your API keys" is a
request you should be suspicious of. Anthropic and OpenAI keys spend real money.

So the server never sees them. When you set a passphrase, the browser derives an
AES-256 key from it with PBKDF2 (600,000 iterations, SHA-256), encrypts your keys
with AES-GCM, and uploads only the ciphertext, salt and IV. A password account
runs that identical derivation over your login password instead of a separate
passphrase (`src/account.ts`) — one secret, no extra step, same guarantee.
**Neither the passphrase nor the password is ever transmitted**, and there is
no code path in `functions/api/vault.js` that could decrypt a vault — it
stores three opaque strings and hands the same three back. A full dump of
that KV namespace yields nothing spendable.

The cost is one passphrase per new device. After that the derived key is cached in
IndexedDB as a **non-extractable** `CryptoKey`: the browser will decrypt with it but
will not hand its bytes back to any script, so you are not asked again and the raw
key never sits in JavaScript. Signing out deletes it.

For your API keys, forgetting the passphrase is not a disaster — nothing is
recoverable, but nothing is lost either. You re-enter them, which you can always
read from the provider's own console. The same key also seals your reply history,
and *that* is not re-readable from anywhere: see
[Your reply history](#your-reply-history) for what forgetting the passphrase
costs you there.

See [`src/vault.ts`](src/vault.ts) and [`functions/api/vault.js`](functions/api/vault.js).
If a change ever makes the server able to read a provider key, that is a breaking
change to the app's privacy promise, not a refactor.

### Enabling sign-in on your own deployment

Sign-in stays hidden until you configure it, so a fork with nothing set up just
works without it. Password accounts and Google sign-in need different amounts
of setup below.

1. Create the accounts KV namespace and paste the id into `wrangler.toml`:

```bash
npx wrangler kv namespace create ACCOUNTS
```

**Password accounts** need only step 1 — with the `ACCOUNTS` KV namespace bound,
"Sign in / Sign up" appears and username-password accounts work with no Google
credentials at all. The password does double duty: the browser derives the
vault key and the login proof from it separately (`src/account.ts`), so signing
in unlocks your synced keys and history with no second passphrase — and the
server still cannot read either. There is no password reset in this version:
an account with no email on file and a forgotten password is gone for good,
which the sign-up form says out loud.

**Google sign-in** additionally needs steps 2–4:

2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type *Web application*. Add your origin to
   Authorised JavaScript origins, and this exact callback to Authorised redirect URIs:

   `https://your-domain.example/api/auth/google/callback`

3. Store the credentials as Pages secrets (never commit them):

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=m36x-rebuttal
```

```bash
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=m36x-rebuttal
```

4. **Redeploy.** Pages binds environment variables at deploy time, so a secret
   added afterwards is invisible to the deployment already serving traffic. If
   you already completed step 1, `configured` is already `true` and "Sign in /
   Sign up" already works via password accounts — what's still missing is just
   the Google option: `/api/auth/me`'s `providers` list won't include `google`
   yet, so the dialog quietly has no "Continue with Google" button or divider,
   with nothing in the logs to explain why. Publishing the same commit again
   is enough:

```bash
npm run build && npx wrangler pages deploy dist --project-name=m36x-rebuttal --branch=main
```

   For a couple of minutes afterwards a small share of requests still land on
   the previous deployment, so the Google button flickers in and out of the
   dialog as `providers` flaps between including `google` and not. That is
   propagation, not a fault — wait it out rather than redeploying again.

Meta and Apple are not wired up. The session layer is provider-agnostic
(`functions/_lib/session.js` namespaces user ids by provider), so adding them is
mechanical — but Apple in particular needs a paid Apple Developer account and a
client secret that expires every six months.

## Languages

The interface ships in twelve languages: English, Spanish, French, German,
Portuguese, Italian, Japanese, Korean, Simplified Chinese, Arabic, Hindi and Greek.
It picks one from your browser's language settings on first visit, and Arabic
switches the whole layout to right-to-left.

**English is always one click away.** Whenever the interface is not in English, a
literal "English" button sits beside the language picker — because someone who has
landed in a language they cannot read cannot be expected to find "English" inside a
dropdown whose own label they also cannot read.

Your choice is remembered in this browser, and on your account if you are signed in,
so it follows you rather than resetting on each new device.

### The reply's language is not the interface's language

These are deliberately separate. The reply is aimed at **the person who wrote the
argument**, so it follows *their* language — an English reply to a Spanish post
persuades nobody, however good it is. Paste a Spanish article while reading the app
in English and you get a Spanish reply, with a chip telling you so and a dropdown to
override it.

The private briefing does the opposite: the weak-link note and their-best-case
section are for **you**, so they come back in your interface language even when the
reply is in another.

This also matters for quality in a way that is easy to miss. The constitution's
anti-reactance rule (rule 7) is enforced by banning specific phrases — "you must",
"the fact is", "Actually," — and a banned-phrase list is language-specific. Shipping
only the English list would let the model write *"debes"* or *"el hecho es"* freely
and the rule would silently stop working. So every language has its own list, in
[`src/i18n/persuasion.ts`](src/i18n/persuasion.ts), along with notes on things
English does not force you to decide — Japanese politeness level, French tu/vous,
Korean speech level. Adding a language means adding that entry too, not just the UI
strings.

## Quick Start

### Prerequisites

- Node.js 18+ and npm (required by Vite 5)
- An API key for one of the cloud providers above — free ones exist for Gemini, Groq and OpenRouter. Or no key at all: the live deployment's Instant mode gives a few free replies a day, and the local in-browser option never needs one
- A modern browser with microphone access (Chrome, Edge, Safari, Firefox)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will open automatically at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Testing

```bash
npm run test:offline
```

runs the nine suites that need nothing but Node — derivation, password
hashing, rate limiting, prompts, history, Instant-mode units, auth-endpoint
units, and locale parity. The full `npm test` additionally includes four
suites that talk to live local servers: start `npx wrangler pages dev dist`
first (after `npm run build`, and with a `.dev.vars` copied from
`.dev.vars.example` so re-runs don't trip the auth flood brakes), and for the
limiter suite run `npx wrangler dev --port 8787` inside `limiter/`. Without
those servers running, only the four live suites fail — that is the expected
signal, not a broken checkout.

## How to Use

1. **Pick an AI**: the collapsed summary names the model and what it is good at; open it to change provider or model. For zero-cost, zero-signup use, pick **Local in-browser (FREE, no key)** — the model downloads once and runs on your GPU
2. **Enter API Key** (cloud providers only): the app links to each provider's key page; free-tier keys exist for Gemini, Groq and OpenRouter. No key yet? Skip this step — Instant mode covers your first few replies each day
3. **Enter Your Argument**: Type it, click "Start Recording" and speak it, or switch to **🔗 Article URL** and paste a link — dictated and fetched text both stay editable afterwards
4. **Say who will read it** (optional): one line about the recipient changes the register and which sources get used. Leave it blank and it is inferred from the text
5. **Write my reply**: produces one sendable message, plus the weak link in your own position
6. **Open the briefing** (optional): their strongest case, and whether your reply actually answers it — this part is never sent

## Features Explained

### Brief Rebuttal
Shows a concise, punchy counter-argument in 1-2 sentences. Perfect for quick comebacks.

### Detailed Rebuttal
Provides a comprehensive response with:
- Counterpoints to the original argument
- Evidence-based reasoning
- Logical fallacy identification (when applicable)
- Strong conclusions

## Browser Compatibility

- ✅ Chrome/Chromium (full support)
- ✅ Edge (full support)
- ✅ Safari (full support)
- ⚠️ Firefox (no voice input — Firefox does not implement SpeechRecognition)
- ❌ IE 11 (not supported)

## Privacy & Security

Your API keys never touch this app's servers — BYOK calls go browser-direct to
the provider you chose, and keys are stored only in this browser's local
storage, one entry per provider. Your argument text stays in the browser too,
with one explicit exception: **Instant mode** (the free, keyless taste) sends
the argument text — and the handful of structured fields around it, nothing
more — to this app's `/api/generate` function so our key can pay for the
reply. No account required, nothing you send is stored, and saving a key for
the provider you have selected turns Instant mode off for that provider. That
is the only case where this app's servers receive your text in readable form —
history sync uploads a sealed blob, which is a different thing.

Where your argument text actually goes, in full:

- **The AI provider you picked**, to write the reply. With the local in-browser
  option it goes nowhere — inference runs on your own GPU.
- **Tavily**, as the evidence-search query, on every generation where sourcing is
  left on. Turn off "Find real evidence to cite" and no search request is made.
- **This app's `/api/generate` function, in Instant mode only** — that is, only
  while no API key is saved for the provider you have selected. The browser
  sends the argument, the optional recipient line, the language choices and
  the retrieved citations; the server builds the prompt and calls OpenRouter
  on this app's own key. Nothing from the request is logged or persisted. The
  daily quota counter (a separate, private Worker) stores an opaque id — a
  random device id when anonymous, your account id when signed in — and a
  count, never text, plus anonymous aggregate totals such as how many Instant
  replies were served that day. A key saved for the selected provider routes
  around this endpoint; pick a provider with no saved key and your text goes
  through it again.
- **This app's `/api/article` function**, but only in URL mode, and only the URL —
  never your typed text. It fetches the page server-side because the browser cannot.
- **This app's `/api/share` function**, only if you click "Get a shareable link".
  That publishes deliberately; the private briefing and weak-link note are never sent.
- **This app's `/api/history` function**, only while you are signed in with your
  vault unlocked, and only as ciphertext sealed in your browser — the server
  stores a blob it cannot read. Signed out, your history never leaves the device.

Audio never leaves the browser's own speech recognition. There is no third-party
analytics and no tracking. What this app's servers count, exhaustively:

- **The Instant-mode quota**, as described above: an opaque id (a random device
  id, or your account id when signed in) and a number.
- **Aggregate event totals**, each stored as a name, a date and a tally and
  nothing else — no id, no referrer, no user agent, no payload, so no two of
  them can be joined back into a person. Seven are about Instant mode: a reply
  was served; the daily cap was hit; a request was refused (the per-IP flood
  brake tripping, or a failed bot check); and the fallbacks and retries the
  server runs when the upstream model misbehaves. Two are about the share
  funnel: **a share page was viewed**, and someone on a share page **clicked
  "write your own"**.

That share-page count is worth calling out because it is the one thing here you
do not trigger yourself: it is incremented by the *recipient* opening the link
you sent, whether or not they have ever used this app. It still records only
that one more view happened that day. Ids and numbers, never content.

## Troubleshooting

### "Speech recognition not supported"
- Make sure you're using Chrome, Edge, or Safari (Firefox lacks SpeechRecognition)
- Check that microphone permissions are granted
- Try refreshing the page

### "Failed to generate rebuttal"
- Verify your API key is correct
- Check that you have API credits available
- Ensure you have a stable internet connection

### Microphone not working
- Check browser microphone permissions
- Try refreshing the page
- Test your microphone in other browser apps

## API Costs

Costs depend on the provider and model you pick, and the app shows them live —
see [Cost estimates](#cost-estimates). The local in-browser option is entirely
free. Free tiers (Gemini, Groq, and the OpenRouter free models) cost nothing
within their limits. On paid providers a reply ranges from a fraction of a cent
(GPT-5.6 Luna, GPT-OSS 120B, DeepSeek V4 Pro) through ~1–2¢ (GPT-5.6 Terra,
GLM-5.2, Kimi K2.6) and ~3¢ (Claude Sonnet 5) to ~16¢ on the most capable model
here (Claude Fable 5).

## Progressive Web App (PWA)

This app is fully PWA-enabled! You can:

### Install on Desktop
- **Chrome/Edge**: Click the install button in the address bar
- **Safari**: Use Share → Add to Home Screen
- **Firefox**: Right-click app name → Install

### Install on Mobile
- **iOS/iPadOS**: Safari → Share → Add to Home Screen
- **Android**: Chrome menu → Install app

Once installed, the app:
- ✅ Loads its UI offline (after the first full online visit caches the assets)
- ✅ Uses cached assets for instant loading
- ✅ Shows an update banner in open tabs when a new version deploys
- ✅ Takes less space than a native app
- ✅ Works just like a native mobile app

**Note**: Writing a reply calls your chosen provider (and Tavily for sourcing), so
it needs internet — except with the local in-browser option, which works offline
once the model has downloaded. Past replies survive a reload: they are kept on the
device, and optionally synced encrypted — see [Your reply history](#your-reply-history).

## Deployment

The app is deployed on **Cloudflare Pages** (project `m36x-rebuttal`) and lives
at **https://rebut.m36x.com/**. To ship an update:

```bash
npm run build
npx wrangler pages deploy dist --project-name=m36x-rebuttal
```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for details, caching rules
(`public/_headers`), and troubleshooting. The `dist/` output is fully static,
so any static host (Netlify, Vercel, S3+CloudFront, GitHub Pages…) also works —
everything browser-side survives the move: BYOK generation, the local
in-browser (WebLLM) model, and the browser-direct Tavily search. What does not
is the Pages Functions (article extraction, sharing, sign-in, Instant mode) and
the limiter Worker, which are Cloudflare-side.

## Environment Variables

Your API keys live in browser local storage, never in environment variables —
that is what keeps them private. The deployment itself has a few operator-side
secrets, all optional: `OPENROUTER_PROXY_KEY` (enables Instant mode),
`TURNSTILE_SECRET` (enables bot checks on Instant mode), `OPERATOR_EMAIL` (lets
you read the aggregate counts, signed in via Google with that address — a
password account cannot satisfy this check, however its email is set, because
that address is a self-reported claim rather than proven identity), and the
Google OAuth pair (enables *Google* sign-in specifically — password accounts
need only the `ACCOUNTS` KV namespace, [described
earlier](#enabling-sign-in-on-your-own-deployment), and bring the same
encrypted vault and history sync with them, no Google required). Each is set with
`npx wrangler pages secret put`; [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) has
the full table of what each one turns on and what breaks without it. With none
of them set, the app is plain BYOK and works fine.

If you want to customize the build, you can modify `vite.config.ts`.

## License

MIT

## Support

For issues or questions:
- Check the [Anthropic documentation](https://docs.anthropic.com)
- Review the [Web Speech API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- Review [PWA documentation](https://web.dev/progressive-web-apps/)
- Submit issues on GitHub

Enjoy generating witty rebuttals! 🚀
