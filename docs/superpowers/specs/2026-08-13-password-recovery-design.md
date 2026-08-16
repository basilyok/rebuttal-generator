# Password recovery via recovery code — design

**Date:** 2026-08-13
**Status:** Approved section by section in conversation; awaiting implementation plan.
**Scope:** Password (`provider: 'local'`) accounts only.

---

## Why this is not an ordinary password reset

Today the password *is* the vault key. From `src/account.ts`:

```
masterKey = PBKDF2(password, salt = "rebuttal|v1|" + normalizeUsername(username), 600k)
authHash  = PBKDF2(masterKey, salt = password, 1)
```

`adoptKey()` imports those `masterKey` bytes directly as the AES-GCM key that
seals the vault and history blobs. Only `authHash` ever reaches the server.

The consequence: **changing the password changes the key, and every existing
vault and history blob becomes permanently undecryptable.** Nobody can recover
them, including the operator. A conventional reset is therefore not merely
unbuilt here — it is cryptographically impossible without escrowing the key
behind a second secret.

This also rules out email-based reset as a solution *to this problem*. Even
with verified addresses and mail infrastructure (neither exists), a reset would
still destroy the data. Email solves identity, not the key.

## Approach chosen: key indirection

Three keys, with strictly separated jobs.

| Key | Derivation | Job |
|---|---|---|
| `DEK` | 256-bit random, once per account | The **only** key that encrypts data |
| `masterKey` | unchanged, `PBKDF2(password, "rebuttal\|v1\|" + username, 600k)` | Wraps `DEK` |
| `recoveryKey` | `PBKDF2(recoveryCode, "rebuttal\|recovery\|v1\|" + username, 600k)` | Wraps `DEK` |

Vault and history are sealed under `DEK`. `DEK` is wrapped twice — once under
each of the other keys — and the server stores both wrapped copies, able to
open neither.

**Why indirection rather than re-encrypting on reset.** The alternative (wrap
`masterKey` itself under the recovery code, then re-encrypt both blobs during
reset) makes the reset a multi-step data migration executed at the moment the
user is already locked out. Its partial-failure state — vault re-encrypted,
history not — strands the history behind a password the user has just
forgotten, and needs bespoke repair logic. With indirection the reset rewrites
**one small record** and never touches the data: it either works or it does
not. It also makes ordinary password *change* possible, which the app cannot
currently offer at all, and makes a future third recovery method one more
wrapped copy rather than another full re-encryption.

## Record shapes

New KV record `dek:<userId>`, validated field-by-field like `vault:` and
carrying only ciphertext:

```json
{
  "byPassword": { "iv": "...", "ciphertext": "..." },
  "byRecovery": { "iv": "...", "ciphertext": "..." },
  "version": 1
}
```

The recovery verifier lives in its own record, `recovery:<userId>`, holding
exactly what `hashAuth()` returns — the same `{ hash, salt, iterations,
version }` shape as `password:<userId>`, so `verifyAuth()` and `dummyRecord()`
work against it unchanged. A separate key rather than a field on the password
record, because reset rewrites the two independently and the write ordering in
`complete` depends on their being separate puts.

The user record gains `credentialVersion` (integer, defaulting to 0 when
absent, so existing records need no backfill).

**Recovery code format:** 24 Crockford base32 characters — six groups of four,
displayed as `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. At 5 bits per character that is
**120 bits** of entropy. Crockford because it excludes I/L/O/U, so the code
survives being read off a screen and typed by hand, which is how it will
actually be used. 120 bits keeps offline attack infeasible even against someone
holding the wrapped blob; the length was chosen for legibility, and the entropy
follows from it rather than the other way round.

## The recovery verifier (correction to an earlier draft)

An earlier version of this design held that the server could store nothing
about the recovery code, proving possession purely by successful decryption.
**That is wrong for the write half.** Reset must write a new `authHash` and a
new `dek` record; with nothing to verify, anyone could POST a reset for any
username. They could not read the old vault, but they would seize the account
and overwrite both wrapped copies of `DEK`, locking out the real owner
permanently — turning recovery into a remote account-destruction primitive.

So the server stores a verifier, built exactly like `authHash`:

```
recoveryAuth = PBKDF2(recoveryKey, salt = recoveryCode, 1)
```

stored as `hashAuth(recoveryAuth)` through the existing
`functions/_lib/password.js` helper and checked with the same `verifyAuth`.
The recovery code itself still never reaches the server, and a KV leak yields a
verifier useless without the 120-bit code behind it.

This also improves the read half: `byRecovery` is released only to a request
that has already proven possession, so the blob cannot be harvested.

## Flows

### Setup (registration, or migration of an existing account)

1. Generate `DEK` (random) and the recovery code.
2. Derive `recoveryKey`; compute `recoveryAuth`.
3. Wrap `DEK` under `masterKey` and under `recoveryKey`.
4. **Write `dek:<userId>` and the recovery verifier first** (see Migration).
5. Re-encrypt vault and history under `DEK` (migration only; new accounts
   write v2 from their first save).
6. Display the code once.

### Reset — two endpoints

**`POST /api/auth/recover/begin`** — `{ username, recoveryAuth }`
Server verifies against the stored hash and returns `{ byRecovery }`. A wrong
code and a nonexistent username return an identical error, and the miss path
runs `dummyRecord()` so timing matches — the constant-time posture `login.js`
already uses.

Client derives `recoveryKey`, unwraps `DEK`, and prompts for a new password.

**`POST /api/auth/recover/complete`** — `{ username, recoveryAuth, authHash,
dek: { byPassword, byRecovery } }`
Server re-verifies `recoveryAuth`, then writes. Vault and history are never
fetched, never re-encrypted, never touched.

**The reset rotates the recovery code.** The client generates a fresh code and
`byRecovery` in the same transaction and displays the new one at the end. A
reset often means something went wrong; continuing to honour a possibly-leaked
code would be the wrong default, and rotation is nearly free since that record
is being rewritten regardless.

**Write order inside `complete` is load-bearing.** KV offers no transaction, so
the writes go: **`dek:` first, then `recovery:`, then `password:`, then the
`credentialVersion` bump.** The password record is what makes the new password
usable, so it must land after the material it unlocks. Writing `password:`
first would leave a new password whose wrapped `DEK` was never stored — an
account that authenticates but cannot decrypt anything.

> **Correction (2026-08-13, found in Task 3's code review).** An earlier version
> of this paragraph claimed every write before `password:` is "inert," and that
> a partial failure leaves the old password working "so the account is intact."
> **That was wrong, and it would have shipped permanent data loss.**
>
> Write 1 does not add the new wrapped copies — it *overwrites* the old ones.
> So between write 1 and write 2 the old password still authenticates and the
> old code still verifies, but `byPassword` is now sealed under the new password
> key and `byRecovery` under the new code. Neither credential the user holds can
> open the DEK, and the new code cannot even pass `begin` because its verifier
> has not landed yet. A client that crashed, lost the network, or closed the tab
> in that window leaves a vault nobody can ever open.
>
> The error was conflating *authentication* with *decryption*: the old
> credentials keep signing in, which is what made the claim look true, while the
> ciphertext they point at has already moved to the new key era.

**The fix: `dek:` carries both key eras.** `complete` reads the existing record
and write 1 stores the new pair alongside the old one under `previous`:

```json
{ "byPassword": "…new…", "byRecovery": "…new…", "previous": { "byPassword": "…old…", "byRecovery": "…old…" }, "version": 1 }
```

Clients try the current pair and fall back to `previous`. Every intermediate
state is then openable by some credential the user actually holds, and the
ordering argument becomes true rather than merely stated. `previous` is pruned
on the next successful `complete` or `PUT /api/dek`. Cost: one extra KV read on
an operation that happens roughly once per account per lifetime.

**Rotation is mandatory, not optional.** `recoveryAuthNext` is a required field.
An optional-rotation path would leave a captured `complete` body replayable
indefinitely (without rotation the verifier never moves), and it would make the
write sequence conditional on a request field — the one thing the ordering
argument cannot tolerate.

**Existing sessions die on reset.** Sessions are `session:<id>` with no
per-user index, so they cannot be enumerated. Instead the user record carries
`credentialVersion`, stamped into each session record at creation and compared
in `getSession`. Reset bumps it; every session minted under the old value stops
validating on its next request. One integer, no enumeration, no extra writes.

## Migration of existing accounts

**Version-tagged blobs remove the need for atomicity.** Blobs written under the
old scheme stay `version: 1` (opened with `masterKey`); DEK-encrypted blobs are
`version: 2`. The reader picks its key from the tag, not from a global
"migrated" flag. A signed-in client holds *both* keys, so a half-migrated
account — vault at v2, history still at v1 — is fully readable.

**Order:** write `dek:<userId>` and the verifier **before** re-encrypting any
blob. The reverse risks blobs sealed under a `DEK` that was never stored, which
is unrecoverable and the worst outcome this feature could produce. With this
order the only failure mode is "migration incomplete," never "data orphaned."

**Interrupted migrations self-heal.** On each sign-in, if a `dek` record
exists, the client checks blob versions and re-encrypts anything still at v1.
`masterKey` is in hand at that moment, so this always eventually succeeds and
needs no repair tooling.

**Recovery is not announced as active until migration completes.** This is the
one genuinely dangerous window: recovery restores `DEK`, but a v1 blob needs
`masterKey`, and reset *replaces* `masterKey`. An account with an armed code
and a straggling v1 blob would lose that blob on reset. Until every blob reports
v2, the UI shows recovery as still finishing and **the reset path refuses to
run**. Narrow window, but the failure is silent and permanent, so it gets an
explicit guard.

**New accounts skip all of this** — they create `DEK` up front and write v2
from the first save. Migration concerns only accounts that already exist, a set
that will never grow.

## UI

**At sign-up:** the code appears immediately after registration on a screen that
displays it, offers copy, and requires an explicit "I've saved this"
confirmation. Deliberately *not* a re-entry challenge: that is friction at the
moment someone is trying to start, and buys little when people paste from the
clipboard they just copied to.

The copy leads with the escape hatch — **while you still know your password you
can generate a fresh code any time from the account area** — because that turns
losing the paper from a crisis into a chore. The code itself is never
recoverable (nothing stores it), but replacing it always is.

The warning stays blunt: if both the password and the code are gone, the saved
API keys and history cannot be recovered by anyone, including us.

**For existing accounts:** prompt once on next sign-in, dismissible, explaining
what is missing and offering setup; plus a persistent "Set up recovery" entry
in the account area. Once active that entry becomes a status line plus
"Generate a new code."

**Reset entry point:** a "Forgot password?" link on the sign-in dialog opening a
three-step flow — username + code → choose a new password → new code shown once.

**Strings:** ~20 new keys across all 12 locales, following the existing
`account.*` convention. The largest mechanical piece of the work; the plan
should treat translation as its own task.

## Abuse controls

- Both endpoints take the same-origin gate and the layered brakes (in-memory,
  then durable), keyed by IP since there is no session yet.
- `recover/begin` is the brute-force surface: 5 per 10 minutes, matching
  `auth-login`.
- Neither endpoint writes to KV until verification passes, so failed attempts
  cost nothing against the shared 1000-writes/day budget.
- `dummyRecord()` on a miss in `begin`, making a nonexistent username and a
  wrong code indistinguishable in response and timing.

## Out of scope (deliberate)

- **Google accounts.** Their vault key comes from the passphrase path, not a
  password, and their sign-in is already recoverable through Google.
- **The Google passphrase gap.** A Google user who forgets their vault
  passphrase has exactly the same permanent-loss problem and this design does
  **not** fix it. Excluded deliberately, not by oversight: folding a second key
  path in would roughly double the work. The DEK indirection makes it
  straightforwardly fixable later — one more wrapped copy in the record.
- Password *change* while signed in. The indirection makes it nearly free, but
  it is a separate feature with its own UI.
- Email verification, account linking, account deletion.

## Risks

- **Migration touches live vaults.** A migration bug is the worst outcome
  available here. Mitigated by version-tagged blobs (mixed states stay
  readable), DEK-record-first ordering, and self-healing on sign-in.
- **The one-time display.** Users will lose codes. Mitigated by making
  regeneration always available while signed in, and by saying so in the copy
  rather than burying it.
- **A second credential exists.** The recovery code grants full vault access on
  reset. Kept to reset only — never a sign-in path — so it is not a standing
  credential, and rotated on every use.
- **Both secrets lost is unrecoverable, by design.** No mitigation exists or
  should exist; the UI must say so plainly.
