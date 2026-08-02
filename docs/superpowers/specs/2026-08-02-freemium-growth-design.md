# Freemium growth design — Rebuttal Generator

**Date:** 2026-08-02
**Status:** Approved section by section in conversation; awaiting implementation plan.
**Decision frame:** Growth first, money later. Audience: whoever shows up. Chosen
approach: a freemium metered core (an operator-paid "Instant mode" taste of the
product), with BYOK framed as the power path and paid tiers dormant until there
is traffic worth charging.

---

## Why the design looks like this: the corrected threat model

Four findings from adversarial review overturned the naive version of this plan,
and every structural choice below traces back to one of them.

1. **A reply costs ~$0.0013–$0.03, not ~$0.001.** One reply is two upstream
   calls today (message + honest check, fired in parallel in `App.tsx`), the app
   always requests the detailed register, reasoning models carry an 8,000-token
   thinking budget, and the reasoning-starvation retry doubles spend when it
   fires — both attempts are billed. A $2/day budget buys roughly 67 adversarial
   replies, not 2,500.
2. **The OpenRouter `:free` pool is account-wide, not per-user.** 1,000
   requests/day across the whole user base (50/day below $10 lifetime credits),
   plus a global 20 req/min ceiling. An attacker can pin the pool at 429 all day
   at zero cost to themselves — deliberately forcing every visitor onto the paid
   fallback.
3. **Workers KV cannot enforce quotas.** No atomic increment, up-to-60s
   propagation between edges, and the free plan's 1,000 writes/day would be
   consumed by counters alone, after which enforcement fails silently while the
   proxy keeps serving.
4. **Therefore: spend is capped, availability is not.** A daily spend cap does
   not protect the product; it hands an attacker a cheap lever to switch the
   growth funnel off every day. The design treats free-tier *availability* as
   the asset under attack and degrades explicitly rather than falling over.

## Section 1 — The funnel: four user states

| State | Who | Allowance | Route |
|---|---|---|---|
| 0 | Anonymous | **3 replies/day** | Proxy ("Instant mode") |
| 1 | Signed in (Google) | **5–8 replies/day** | Proxy |
| 2 | BYOK | Unlimited | Browser-direct (unchanged) |
| 3 | Paid | Dormant | Config only |

- **3 anonymous replies, not 2:** a rebuttal is rarely right first pass; two
  replies ends the taste mid-dissatisfaction. Three covers one argument plus two
  iterations. No counter is shown before the first generation completes.
- **5–8 signed in, not 10:** raising a free cap later is easy, cutting one
  churns. Ten anchors "free" too high for any future paid tier to stand on.
- **A visitor's first-ever reply routes to the paid cheap model** (Luna-class),
  not the free pool. The first reply is the highest-leverage output in the
  funnel and the free pool is slow and degrades under load. Cost: ~$0.80 per
  1,000 new visitors. The app's own constitution argues for this: a message you
  would regret sending is worse than no message.
- **The device cookie is the primary counter; IP is only an aggregate abuse
  signal.** CGNAT makes an IP a whole campus or carrier; keying quota on IP
  would tell readers of one shared link inside one office that their free
  replies are gone before their first generation.
- **BYOK is framed as the power path** (unlimited, browser-direct, private),
  not a fallback. All caps live in config, not constants.
- State 3 exists only as an `entitlements` field on the KV account record and
  cap-as-config, so a paid tier can flip on later without redesign.

## Section 2 — The proxy and the availability ladder

### `/api/generate` (new Pages Function)

- Accepts **structured fields only**: `{argument, recipientLine?, language?}`,
  each length-capped, argument at **~12,000 chars** (the cheapest attack was a
  megabyte paste; this is the cheapest fix). The full prompt is assembled
  **server-side** from the same templates the client uses — nobody can use the
  operator key as a general-purpose LLM API.
- **Two prompt-injection hardenings specific to the operator-paid path:**
  - The recipient/audience line loses its "authoritative — trust it over your
    own inference" framing (fine when the user pays; attacker trust-elevation
    when we do).
  - A response missing the envelope gets **one retry, then an error** — never
    raw model output. The raw-fallback that is correct UX on BYOK is an
    exfiltration channel on the proxied path.
- **Anonymous replies collapse to one upstream call:** the honest check folds
  into the same response envelope as an extra section, halving cost and
  latency while keeping the weak-link note (the product's integrity signature).
  BYOK keeps the richer two-call flow unchanged.

### Spend control, outermost layer enforced by someone else

- The operator key is minted via **OpenRouter's Provisioning API with a daily
  spend limit enforced on OpenRouter's servers** — the backstop that holds even
  if all our code is wrong.
- **Degradation ladder, every step explicit:** first-ever reply → paid cheap
  model; subsequent free-tier replies → shared `:free` pool; pool busy → paid
  cheap model; daily budget exhausted → an honest "free replies are done for
  today — sign in, come back tomorrow, or bring your own key" state. An
  attacker burning the pool costs users latency, never a blank page; worst-case
  bill is the daily cap.

### Enforcement infrastructure

- **A SQLite-backed Durable Object in a small separate Worker** (Pages projects
  cannot define DO classes) holds all counters: atomic, no propagation window.
  Keys: device cookie (primary), account id (signed in), per-IP **aggregate
  only** (abuse signal, never quota). KV is explicitly rejected for counting —
  see threat model #3.
- **Turnstile:** every anonymous generate carries an invisible token
  (single-use, request-bound via `cdata`); an IP aggregate that looks like
  farming escalates that address to managed/interactive mode. Honest users
  never see a challenge.
- The same DO later gives `/api/share` and `/api/article` real per-user quotas,
  upgrading the same-origin gate + flood brake shipped 2026-08-02 (see
  "Already shipped").

### Documentation debt created the day the proxy ships

README's "your text is never sent to this app's own servers" becomes
conditionally false. It must be rewritten the same day as: "only in Instant
mode, and only the argument text — never your keys." The privacy stance is a
product asset; the wording change is part of the feature, not cleanup.

## Section 3 — History for account holders

**Governing decision: history rides the existing zero-knowledge vault.** Each
entry (argument, reply, briefing, sources, model, timestamp) is encrypted
client-side with the same vault key that protects API keys; `ACCOUNTS` KV
stores ciphertext only. The server learns *when* and *how much*, never *what*.
History is the most sensitive data the app will ever hold — a longitudinal
record of the user's disputes — and the alternative (plaintext KV) converts
"we can't read your arguments" into "we promise not to," which is a different
product. Rejected.

- **Local-first:** every generation saves to IndexedDB immediately, signed in
  or not. Sign-in adds sync (and uploads the device backlog); it does not gate
  the feature.
- **One encrypted blob per account,** capped at the most recent ~100 entries.
  One save = one KV write — this matters while the 1,000 writes/day budget is
  shared. Accepted trade-off: concurrent generations on two devices can
  last-write-wins away an entry; the local copy retains it. The DO absorbs
  this pressure later if volume demands.
- **UI:** History panel listing entries by date; tapping restores the full
  result into the app; per-entry delete; clear-all. Sign-out wipes the device
  copy with the derived key (as it already must); server ciphertext survives
  for the next sign-in.
- **Honest limitation, stated in the UI:** cross-device history needs the vault
  unlock, and lost key = lost history. The server cannot recover what it
  cannot read. This is the promise working as designed.

## Section 4 — Growth loops and the share-page funnel

**The loop:** share page → "write your own reply" → instant anonymous reply
(paid-model first taste) → they share theirs.

- **The message never carries branding.** No watermark, no footer, nothing
  appended on copy. A visible AI tag inside the message would undermine the
  persuasion it exists to deliver; the constitution's whole argument cuts
  against tainting it. Growth rides only on surfaces the user *chose* to
  publish. Recorded as a decision, not an oversight.
- **Share links move to real paths — `/s/<id>`** — served by a small Pages
  Function that returns the same app shell with per-share Open Graph tags:
  title from the article title (else a neutral "A considered reply"),
  description from the message's opening ~140 chars, locale from the share.
  Constraints:
  - **Identical HTML for every requester — no User-Agent branching.** UA-keyed
    variance over a shared cache key is the exact poisoning class dug out of on
    2026-07-31; per-share *URLs* make per-share *content* cache-safe.
  - The unfurl draws only from fields the user explicitly published — never
    the briefing, never the weak-link note.
  - Old `?s=` links keep working client-side indefinitely.
- **One CTA at the bottom of the share page** ("Write your own reply →"),
  landing with the argument box focused and Instant mode live, carrying a bare
  `ref=s` param.
- **Measurement is aggregate-only, in our own DO:** share views, CTA clicks,
  first generations, replies per tier — daily integers. No third-party
  analytics, no tracking cookies beyond the quota cookie, no per-user trails.
  The privacy stance is a growth asset with exactly this audience.
- **The cap-exhaustion state is the sign-in moment:** the upsell is a bigger
  allowance plus history, not a paywall.

## Already shipped (2026-08-02, this session)

- `/api/share` POST and `/api/article` GET now require a browser-set
  same-origin signal (`Origin` / `Sec-Fetch-Site` / `Referer`) and carry a
  best-effort per-isolate flood brake (6 shares/min, 10 articles/min per IP).
  This closed the two live vulnerabilities (KV-filling primitive; egress
  amplifier) at the drive-by tier; it is deliberately not authentication.
  Share GET stays public — links are meant to open anywhere.
- OpenRouter catalog recut to a top + fast-cheap pair per vendor (15 models),
  default `z-ai/glm-5.2`.

## New infrastructure this design introduces

| Piece | Where | Why it can't be avoided |
|---|---|---|
| `/api/generate` proxy | Pages Function | Anonymous taste requires an operator key the client must never see |
| Rate-limiter / metrics DO (SQLite) | **Separate Worker** | Atomic counting; Pages can't define DO classes; KV can't count |
| Turnstile | generate path | Cheap bot filter ahead of paid spend |
| Provisioned OpenRouter key | OpenRouter account | Server-side daily spend cap outside our failure domain |
| Device counter cookie | Client | Quota key that doesn't punish CGNAT |

## Out of scope (deliberately)

- Paid-tier pricing, checkout, billing — dormant `entitlements` only.
- Server-readable history or any server-side content analytics.
- Native apps, email capture, ads.

## Risks

- **Free-pool starvation is expected, not exceptional** — the ladder treats it
  as a routine state; the failure mode is a slower reply, not an error.
- **Daily-cap exhaustion is a visible product state** — it must read as honest
  scarcity, not breakage, or it poisons the first impression it exists to fund.
- **The proxy is a prompt-injection target with our money** — mitigations are
  structural (server-side assembly, envelope enforcement, field demotion), not
  model-behavioral.
- **KV write budget** is shared across shares, sessions, history until the DO
  (or a paid plan) absorbs it; history's one-blob design keeps its footprint
  linear in saves, not entries.

## Success measures (aggregate, self-hosted)

- Share-page → CTA click-through; CTA → first generation conversion.
- Anonymous → signed-in conversion at the cap-exhaustion screen.
- Replies/day by tier; free-pool 429 rate; ladder fallback rate; daily spend
  vs cap.
