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

/**
 * The shape this decision needs from a reply. Deliberately narrower than App's
 * `Reply` — the choice depends on four fields and nothing else, and stating that
 * is what lets a test construct the cases without a whole generation.
 */
export interface VersionedReply {
  message: string
  /** URLs the model invented in the full message, stripped before display */
  strippedUrls: string[]
  /** The condensed version, absent until the toggle has fetched it */
  shorter?: string
  /** URLs the model invented while condensing, stripped before display */
  shorterStrippedUrls?: string[]
}

export interface ShownVersion {
  /** What is rendered, and therefore what Copy must put on the clipboard */
  text: string
  /** The invented-URL count for THAT text, so the claim badge describes what is read */
  strippedUrls: string[]
  /** True only when the short version is genuinely the one on screen */
  isShorter: boolean
}

/**
 * Resolve the current version.
 *
 * `showShorter` is intent, not fact: it is true from the moment the user clicks,
 * while the shortening call is still in flight and again if that call failed. Only
 * `reply.shorter` being present makes the short version real, so the toggle state
 * alone never decides this — which is why the full message is the fallback in every
 * case where it is missing.
 *
 * The stripped-URL set travels with the text it belongs to. Returning them together
 * is the point of the function: a claim badge describing the version that is NOT on
 * screen is a quieter version of the same bug, and separate expressions in the
 * render could drift apart.
 */
export function shownVersion(reply: VersionedReply | null, showShorter: boolean): ShownVersion {
  if (reply && showShorter && reply.shorter) {
    return {
      text: reply.shorter,
      // A shortening call that stripped nothing may not have written the field at
      // all; "no reply yet" and "nothing stripped" are both an empty list here.
      strippedUrls: reply.shorterStrippedUrls ?? [],
      isShorter: true,
    }
  }
  return { text: reply?.message ?? '', strippedUrls: reply?.strippedUrls ?? [], isShorter: false }
}
