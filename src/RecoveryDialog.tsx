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

import { useState } from 'react'
import type { TFunction } from './i18n'

interface Props {
  t: TFunction
  /**
   * The freshly-minted code. It reaches this component and the DOM and goes no
   * further: never into a URL, a query string, an analytics call, or any
   * console/log path, because every one of those is a place a secret outlives
   * the screen it was drawn on.
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
    <div className="vault-dialog recovery-dialog" role="dialog" aria-modal="false" aria-labelledby="recovery-title">
      <h3 id="recovery-title" className="vault-title">
        {t('recovery.title')}
      </h3>
      <p className="key-help">{t('recovery.blurb')}</p>
      <p className="key-help">{t('recovery.regenerateHint')}</p>

      {/* <output> rather than <p>: this is a value the page just produced, and
          it is announced as such to a screen reader without stealing focus. */}
      <output className="recovery-code">{code}</output>

      <button className="button button-secondary" onClick={copy}>
        {copied ? t('recovery.copied') : t('recovery.copy')}
      </button>

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
