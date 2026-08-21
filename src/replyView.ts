// Which version of the reply is on screen. Lifted out of JSX so it can be tested.
//
// Pure and React-free, following src/recoveryUi.ts and for the same reason. Twice
// now this project has shipped a UI decision that lived only inside a component
// and was wrong for a state nobody could feed it: the `recoveryStatus` initialiser
// that claimed "no recovery code" before the check had run, and the `isSignup`
// capture that ran the wrong branch. A ternary in a render cannot be asked what it
// would do for a given state; a function can.
//
// The bug this one guards against is a user pasting a message they did not read.
// The "Shorter version" toggle puts two different messages behind one Copy button,
// and the app must never disagree with itself about which one is current.

import type { Citation } from './providers'

/**
 * The shape this decision needs from a reply. Deliberately narrower than App's
 * `Reply` — the choice depends on four fields and nothing else, and stating that
 * is what lets a test construct the cases without a whole generation.
 */
export interface VersionedReply {
  /**
   * Identifies THIS generation. Every `setReply` mints a fresh one, so an async
   * call that started against an earlier reply can tell that it came back to a
   * different one — see `applyShorterResult`.
   */
  id: number
  message: string
  /** Sources the full message actually cites */
  citations: Citation[]
  /** URLs the model invented in the full message, stripped before display */
  strippedUrls: string[]
  /** The condensed version, absent until the toggle has fetched it */
  shorter?: string
  /**
   * Sources the CONDENSED message cites — a subset, and usually a smaller one:
   * shortening legitimately drops links along with the claims they supported.
   */
  shorterCitations?: Citation[]
  /** URLs the model invented while condensing, stripped before display */
  shorterStrippedUrls?: string[]
}

export interface ShownVersion {
  /** What is rendered, and therefore what Copy must put on the clipboard */
  readonly text: string
  /** The sources THAT text cites, so the badge count and the panel list match it */
  readonly citations: readonly Citation[]
  /** The invented-URL count for THAT text, so the claim badge describes what is read */
  readonly strippedUrls: readonly string[]
  /** True only when the short version is genuinely the one on screen */
  readonly isShorter: boolean
  /**
   * Whether a short version exists at all — a different question from `isShorter`,
   * which is false whenever the toggle is off even with one cached. Answered here
   * so the render never has to reach past `shown` to ask it.
   */
  readonly hasShorter: boolean
}

/**
 * Resolve the current version.
 *
 * `showShorter` is intent, not fact: it is true from the moment the user clicks,
 * while the shortening call is still in flight. Only `reply.shorter` being present
 * makes the short version real, so the toggle state alone never decides this.
 *
 * App's failure path happens to clear the toggle as well, so today the two agree.
 * The fallback here does not depend on that: it holds for any caller that sets the
 * toggle without content behind it, which is a state a caller CAN create — not one
 * this app is currently observed to reach.
 *
 * The citation set and the stripped-URL set travel WITH the text they belong to.
 * Returning all three together is the point of the function: a badge reading "3
 * sources cited" over a message containing one, or a source panel listing two links
 * that are not on screen, is the same bug in a quieter register — and separate
 * expressions in the render drift apart exactly the way these did.
 *
 * The options object is not ceremony. A bare second boolean accepts
 * `shownVersion(reply, shorterLoading)` without complaint, and that call type-checks
 * into showing the short version during a window where there is none.
 */
export function shownVersion(
  reply: VersionedReply | null,
  { showShorter }: { showShorter: boolean }
): ShownVersion {
  if (reply && showShorter && reply.shorter) {
    return {
      text: reply.shorter,
      // A shortening call that dropped or stripped nothing may not have written
      // these at all; absent means "none", never "fall back to the long
      // message's" — that fallback is precisely the crossed wire.
      citations: reply.shorterCitations ?? [],
      strippedUrls: reply.shorterStrippedUrls ?? [],
      isShorter: true,
      hasShorter: true,
    }
  }
  return {
    text: reply?.message ?? '',
    citations: reply?.citations ?? [],
    strippedUrls: reply?.strippedUrls ?? [],
    isShorter: false,
    hasShorter: Boolean(reply?.shorter),
  }
}

/**
 * Cache a shortening result onto the reply it was generated for — and onto no
 * other one.
 *
 * The reason this is a function rather than a spread inside `setReply`: the
 * shortening call is async and the user can press Generate while it is in flight.
 * The old reply is gone by the time the call returns, and an unguarded updater
 * writes reply A's condensed text onto reply B. Nothing appears immediately,
 * because starting a generation also clears the toggle — but the cache is now
 * poisoned, so the next click short-circuits the "already have it" guard and
 * renders A's message under B with no call and no error, over a note saying Copy
 * will send this shorter version. The user sends a condensed argument about a
 * different subject to a person who never saw it.
 *
 * Returning `prev` untouched is therefore the important branch, not the edge case.
 */
export function applyShorterResult<T extends VersionedReply>(
  prev: T | null,
  forId: number,
  result: { text: string; citations: Citation[]; strippedUrls: string[] }
): T | null {
  // Not the reply this call was made for. Drop the result on the floor: it
  // describes a message that is no longer on screen.
  if (!prev || prev.id !== forId) return prev
  return {
    ...prev,
    shorter: result.text,
    shorterCitations: result.citations,
    shorterStrippedUrls: result.strippedUrls,
  }
}
