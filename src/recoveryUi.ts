// The recovery UI's decisions, lifted out of JSX so they can be tested.
//
// Everything here is pure and React-free on purpose. The two functions below
// were nested ternaries and a five-term `&&` chain inside App.tsx's render,
// which is where a bug hid: the prompt that tells a user "you have no recovery
// code" was gated on a status whose INITIAL value said exactly that, before any
// check had run. A conjunction in JSX cannot be fed a state and asked what it
// would do; a function can.
//
// This is a new module rather than an addition to src/recovery.ts, whose
// exported surface is fixed by the plan. Nothing here touches crypto or
// transport — it is presentation logic that happens to be consequential.

import type { RecoveryStatus } from './recovery'

/**
 * What `recoveryStatus` holds before anything has been checked.
 *
 * `unknown`, never `none`. These two are easy to confuse and the confusion is
 * expensive: `none` is a POSITIVE claim, "the server told us this account has
 * no recovery record", and the UI acts on it by offering first-time setup.
 * Before `fetchDek()` has answered we have made no such observation, and the
 * page renders in that window on every single load — the bootstrap effect
 * commits `setAuth` before `adoptRecovery` resolves. Initialising to `none`
 * therefore told every returning user with working recovery that they had
 * none, and one click in that window rotates the code they have on paper,
 * killing it silently.
 *
 * Exported rather than written inline at the useState call so a test can assert
 * on the value the component actually starts from.
 */
export const INITIAL_RECOVERY_STATUS: RecoveryStatus = 'unknown'

/**
 * The account-bar label for each status. Four statuses, four distinct keys —
 * no default branch, so adding a fifth status is a type error here rather than
 * a silent fallback to whatever the last `else` said.
 */
export function recoveryLabelKey(status: RecoveryStatus): string {
  switch (status) {
    case 'ready':
      return 'recovery.statusReady'
    case 'incomplete':
      return 'recovery.statusFinishing'
    case 'unknown':
      return 'recovery.statusUnknown'
    case 'none':
      return 'recovery.statusNone'
    case 'stale':
      return 'recovery.statusStale'
  }
}

/**
 * Which of the two prompts to show, if either.
 *
 * - `setup`   — the server confirmed there is no recovery record. First-time offer.
 * - `replace` — there IS a record, but nobody on this device has ever confirmed
 *               seeing the code. The display happens exactly once, so a reload,
 *               a back gesture, a crash or a sign-out during it leaves an
 *               account that reports `ready` with a user who holds nothing. That
 *               user would otherwise never be asked again, because every "do you
 *               need setup?" check is answered by the server record, which is
 *               fine. The offer must be a REPLACEMENT, not first-time setup:
 *               there may well be a code out there, and generating a new one
 *               invalidates it.
 * - `null`    — nothing to say.
 *
 * `unknown` yields nothing at all. Not knowing is not a reason to prompt in
 * either direction, and the account bar still carries the entry.
 *
 * The cost of the `replace` branch, named honestly: acknowledgement is stored
 * per device, so signing in on a second device prompts a user who did save
 * their code. That is a dismissible nag on a device that genuinely cannot know,
 * traded against a user with no code at all never being told. The nag is
 * recoverable; the silence is not.
 */
export type SetupPromptKind = 'setup' | 'replace' | null

export interface SetupPromptInputs {
  /** The signed-in account's provider; recovery is for `local` accounts only. */
  provider: string | undefined
  status: RecoveryStatus
  /** Dismissed for this session. */
  dismissed: boolean
  /** A code is on screen right now — do not stack a prompt behind it. */
  codeShown: boolean
  /** This device has seen a code for this account confirmed as saved. */
  acknowledged: boolean
}

export function shouldOfferSetupPrompt({
  provider,
  status,
  dismissed,
  codeShown,
  acknowledged,
}: SetupPromptInputs): SetupPromptKind {
  if (provider !== 'local') return null
  if (dismissed || codeShown) return null
  if (status === 'none') return 'setup'
  if (status === 'unknown') return null
  // `stale` prompts THROUGH an acknowledgement, and it is the only status that
  // does. Every other case treats "someone on this device saved a code" as the
  // end of the conversation, which is right — but here we have positive
  // evidence that an interrupted reset moved the verifier out from under
  // whatever they saved. The code in their hands may open nothing, and the
  // acknowledgement is exactly what would otherwise keep them from ever being
  // told. `replace` is the correct copy for it too: there may well be a live
  // code out there, so this must offer a replacement rather than claim they
  // have none.
  if (status === 'stale') return 'replace'
  return acknowledged ? null : 'replace'
}

/**
 * "Someone on this device confirmed they saved a code for this account."
 *
 * Deliberately NOT a claim that recovery works — only the server record says
 * that. It is the answer to one question the server cannot answer: did the
 * one-time display actually reach a human. Keyed by account id so two accounts
 * on one browser cannot vouch for each other.
 *
 * Storage failures are swallowed in both directions. With localStorage blocked
 * the user is prompted to replace their code on every load, which is annoying
 * and safe; the alternative — treating a failed read as an acknowledgement —
 * is quiet and unsafe.
 */
const ackKey = (userId: string) => `rebuttal.recovery.ack.${userId}`

export function hasAcknowledgedRecovery(userId: string): boolean {
  try {
    return localStorage.getItem(ackKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markRecoveryAcknowledged(userId: string): void {
  try {
    localStorage.setItem(ackKey(userId), '1')
  } catch {
    // Storage blocked. The prompt returns on the next load; nothing breaks.
  }
}

// --- the reset flow ---------------------------------------------------------

/**
 * What to say when a reset fails, and whether the user has anything to try
 * again with.
 *
 * Keyed on the machine code every error in both families carries as its
 * `message` (see the docblocks on AccountError and RecoveryError), not on
 * `instanceof`. That keeps this module free of the crypto and transport imports
 * a type switch would need, and the codes are the documented contract for
 * exactly this: "callers switch on the type (or the code)".
 *
 * Two mappings are load-bearing:
 *
 * - `wrong-recovery-code` and `bad-credentials` MUST return the same key. The
 *   endpoint answers a wrong code and an unknown username identically on
 *   purpose, so a UI that told them apart would rebuild the username oracle the
 *   server went to some trouble to avoid — from the client, where anyone can
 *   read the mapping.
 * - `corrupt-dek-record` must NOT. That is the record refusing to decode, and a
 *   correct code will not fix it. Folding it into "that did not match" invites a
 *   fourth, fifth and sixth attempt at a code that was right all along, which is
 *   the whole reason src/recovery.ts keeps the two errors apart.
 *
 * `retryCode` says whether the code itself is still in question. Only the two
 * indistinguishable-credential cases send the user back to it; a damaged
 * record, a rate limit and an unknown failure are all about something else, and
 * returning them to the code field would blame the one thing that is not at
 * fault.
 */
export interface ResetFailure {
  /** i18n key. Not a message — nothing here is ever rendered verbatim. */
  key: string
  /** Send the user back to the username-and-code step. */
  retryCode: boolean
}

export function resetFailure(code: string): ResetFailure {
  switch (code) {
    case 'wrong-recovery-code':
    case 'bad-credentials':
      return { key: 'recovery.resetFailed', retryCode: true }
    case 'corrupt-dek-record':
      return { key: 'recovery.resetCorrupt', retryCode: false }
    case 'recovery-blocked':
      return { key: 'recovery.resetBlocked', retryCode: false }
    case 'rate-limited':
      return { key: 'account.rateLimited', retryCode: false }
    case 'reset-interrupted':
      // THE CASE THIS FUNCTION USED TO GET WRONG. An earlier version of the
      // default branch below asserted that "recoverComplete is the only writer
      // and it either returned ok or did not run" — which is precisely the
      // disjunction the `previous` pair exists because it is FALSE. complete
      // has four writes and no transaction; a drop or a fault can leave 1, 1-2
      // or 1-3 applied. After a stop at write 3 the user's new password already
      // works and they have just typed it; after a stop at write 1 their old
      // one does; from write 2 onward their code is spent either way. So this
      // says try both and mint a fresh code, and it must never send them back
      // to the code field.
      return { key: 'recovery.resetInterrupted', retryCode: false }
    case 'server-error':
      // Reachable only from the phase BEFORE recoverComplete — runReset wraps
      // everything from that call onward as reset-interrupted. begin writes
      // nothing, so here "try again in a moment" really is the whole story.
      return { key: 'account.serverError', retryCode: false }
    default:
      // Any code this function does not know. It keeps server-error's message
      // because that is the least-committal thing to say, NOT because nothing
      // was written — do not restore that claim. The one branch where the write
      // state is genuinely unknown is reset-interrupted above, and runReset is
      // what routes failures into it; this branch describes the leftovers.
      return { key: 'account.serverError', retryCode: false }
  }
}

/** The machine code out of an unknown throw, for resetFailure(). */
export const failureCode = (err: unknown): string => (err instanceof Error ? err.message : '')
