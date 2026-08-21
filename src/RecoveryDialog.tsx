// The one and only showing of a recovery code.
//
// Styled after VaultDialog rather than as an overlay, because that is this
// app's existing pattern for a focused card that appears in flow — same
// clothes, same `aria-modal="false"`, same place on the page.
//
// Three copy decisions are load-bearing here, and the order they appear in is
// part of them:
//
// 1. The escape hatch leads. While the user still knows their password they can
//    mint a fresh code from the account area at any time, which turns "I lost
//    the paper" from a crisis into a chore. Saying that BEFORE the warning is
//    what makes showing the code exactly once tolerable.
// 2. The both-lost case is stated flatly and never softened. If the password
//    and the code are both gone, nobody — including us — can open the vault.
//    That is the entire reason this feature exists, and hedging it would
//    mislead someone about a permanent outcome.
// 3. The confirmation is a checkbox, not a re-entry challenge. Re-entry is
//    friction at the moment someone is trying to start, and it verifies little
//    when the obvious way to pass it is pasting from the clipboard they were
//    just handed.

import { useEffect, useRef, useState } from 'react'
import type { TFunction } from './i18n'

interface Props {
  t: TFunction
  /**
   * The freshly-minted code. It reaches this component and the DOM and goes no
   * further on its own: never into a URL, a query string, an analytics call, or
   * any console/log path, because every one of those is a place a secret
   * outlives the screen it was drawn on.
   *
   * The one exception is deliberate and user-initiated: the Copy button writes
   * it to the OS clipboard, which does outlive this card and is readable by
   * other applications. That is the point of the button — saving the code is
   * the whole task — but it is an exception, not an absence.
   */
  code: string
  /**
   * Whether this code replaced an earlier one, which the previous holder's
   * paper copy did not survive. Rotation is silent on the server — saveDek
   * overwrites `byRecovery` — so if this card does not say the old code is
   * dead, nothing ever will, and a user keeps filing a string that opens
   * nothing.
   */
  replacesOld: boolean
  onDone: () => void
}

export default function RecoveryDialog({ t, code, replacesOld, onDone }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  /**
   * Bring the card to the user rather than hoping they notice it.
   *
   * It mounts mid-page, and on the sign-up path it appears while attention is
   * still on the form that was just submitted. A live region would not save us:
   * regions announce MUTATIONS, and one inserted with its content already in
   * place is generally not read out at all — so the single thing the user must
   * not miss would be the thing least likely to be announced. Moving focus is
   * what actually redirects a screen reader, and scrolling is what redirects
   * everyone else.
   */
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'center' })
    cardRef.current?.focus()
  }, [])

  /**
   * The "Copied" feedback, announced in a live region rather than by swapping
   * the label of the button that owns focus — a label change on the focused
   * element is not reliably re-announced, and it also moves the button's own
   * name out from under the user.
   *
   * It clears itself so a SECOND copy is announced too. Latched `true` forever,
   * the region never mutates again and every copy after the first is silent —
   * on a card whose entire job is getting this string safely off the screen.
   */
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 4000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard denied (insecure context, or the permission refused). Not an
      // error worth a message: the code is on screen and `user-select: all`
      // makes one tap select the whole of it.
      setCopied(false)
    }
  }

  return (
    <div
      ref={cardRef}
      // tabIndex -1 makes the card focusable programmatically without adding it
      // to the tab order; the effect above focuses it on mount so the heading
      // and blurb are what a screen reader reads next.
      tabIndex={-1}
      className="vault-dialog recovery-dialog"
      role="dialog"
      aria-modal="false"
      aria-labelledby="recovery-title"
    >
      <h3 id="recovery-title" className="vault-title">
        {t('recovery.title')}
      </h3>
      <p className="key-help">{t('recovery.blurb')}</p>
      <p className="key-help">{t('recovery.regenerateHint')}</p>

      {/* <output> for its value semantics — this is something the page
          computed, not prose. Note it is NOT relied on to announce itself: it
          is rendered with its content already present, which is the case a live
          region does not fire for. The focus move above is what carries it. */}
      <output className="recovery-code">{code}</output>

      {/* Label stays put; the confirmation goes to the region below. */}
      <button className="button button-secondary" onClick={copy}>
        {t('recovery.copy')}
      </button>
      {/* Visible AND announced, from one element. A visually-hidden region
          would satisfy the screen reader and leave sighted users with no
          feedback at all, now that the button's own label no longer changes.
          Empty when not copied, so the region mutates — which is what makes it
          announce. */}
      <span className="recovery-copied" role="status">
        {copied ? `✓ ${t('recovery.copied')}` : ''}
      </span>

      {replacesOld && <p className="recovery-replaces">{t('recovery.replacesOld')}</p>}

      <p className="vault-warning recovery-warning">⚠️ {t('recovery.warning')}</p>

      <label className="recovery-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t('recovery.confirm')}
      </label>

      {/* Deliberately the only way out of this card: no dismiss, no backdrop
          click. The code cannot be shown again, so an accidental close is a
          user who now needs to generate another one. */}
      <div className="controls vault-actions">
        <button className="button button-primary" onClick={onDone} disabled={!confirmed}>
          {t('recovery.done')}
        </button>
      </div>
    </div>
  )
}
