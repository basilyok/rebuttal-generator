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

// The file also holds the RESET flow — the three-step card a signed-out user
// with a code walks through — because its last step IS this card. One `mode`
// prop, two components, and the code display is written once.

import { useEffect, useRef, useState } from 'react'
import type { TFunction } from './i18n'
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from './account'
import { isValidRecoveryCode, runReset } from './recovery'
import { failureCode, resetFailure } from './recoveryUi'

interface ShowProps {
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

interface ResetProps {
  t: TFunction
  /**
   * Called once the reset has LANDED — never before. It receives the rotated
   * code so the caller can show it through the card below, plus the credentials
   * needed to sign the user in on the spot.
   *
   * The new password travels up rather than being spent here so that the app's
   * one sign-in path stays the only one: it is what adopts the vault key, the
   * DEK and the history. Like `code` above, it goes nowhere else — no storage,
   * no URL, no log.
   */
  onReset: (username: string, password: string, code: string) => void
  onCancel: () => void
}

type Props = ({ mode: 'show' } & ShowProps) | ({ mode: 'reset' } & ResetProps)

export default function RecoveryDialog(props: Props) {
  return props.mode === 'reset' ? <ResetFlow {...props} /> : <CodeCard {...props} />
}

function CodeCard({ t, code, replacesOld, onDone }: ShowProps) {
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

/**
 * Reset a forgotten password with a recovery code. Three steps, and the third
 * one is not here: this component ends by handing the rotated code to its
 * caller, which renders it through CodeCard above.
 *
 * WHY THE CODE LEAVES RATHER THAN BEING SHOWN IN PLACE. The card that displays
 * a code is guarded — a beforeunload prompt, a confirmation before sign-out —
 * and every one of those guards lives in App, keyed on App's state. A code
 * displayed from inside this component would be a code with none of them, on
 * the one path where the user has just proved that keeping this string is hard.
 * So the code goes up, App shows it, and the guards apply unchanged.
 *
 * The two steps are one server round trip, not two. Verifying the code at step
 * one would need its own recoverBegin — a second slot against the shared
 * recover brake and a second 600k-round derivation, about a second of it — to
 * learn what the single submit learns anyway. Instead a rejected code returns
 * the user to step one carrying the same message it would have shown there (see
 * resetFailure's `retryCode`). Nothing is written until the last submit, so a
 * user who abandons the flow at step two has changed nothing.
 */
function ResetFlow({ t, onReset, onCancel }: ResetProps) {
  const [step, setStep] = useState<'identify' | 'password'>('identify')
  const [username, setUsername] = useState('')
  /**
   * The code EXACTLY as typed. Deliberately not cleaned here — no uppercasing,
   * no dash stripping, no trimming. normalizeRecoveryCode already folds case,
   * I/L to 1, O to 0, every Unicode dash and every invisible, and it is what
   * both isValidRecoveryCode and the derivation run on. A second cleanup here
   * could only ever disagree with that one, and the symptom of a disagreement
   * is a correct code that does not work.
   */
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cardRef = useRef<HTMLFormElement | null>(null)

  // Same reasoning as CodeCard's: this card appears mid-page, and moving focus
  // is what redirects a screen reader to it. Re-run on the step change too, so
  // the second step is announced rather than silently replacing the first.
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'center' })
    cardRef.current?.focus()
  }, [step])

  const name = username.trim()
  // Both checked locally, before anything costs a round trip or a second of
  // PBKDF2. isValidRecoveryCode is why a half-typed code is refused at the
  // keystroke instead of at the endpoint.
  const identified = USERNAME_PATTERN.test(name) && isValidRecoveryCode(code)
  const passwordReady = password.length >= PASSWORD_MIN_LENGTH && password === confirmation

  const submit = async () => {
    setError('')
    if (step === 'identify') {
      if (!identified) return
      setStep('password')
      return
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t('account.passwordShort'))
      return
    }
    if (password !== confirmation) {
      setError(t('account.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      // Nothing about the account has changed until this resolves. That is the
      // property that makes "a failed reset leaves the old password working"
      // true, and it belongs to runReset — see its docblock.
      const nextCode = await runReset(name, code, password)
      // Only now. Between the endpoint's first and second writes the new code
      // is stored against the OLD verifier, so a code shown any earlier is one
      // that opens nothing.
      onReset(name, password, nextCode)
      // `busy` is deliberately NOT cleared: the caller unmounts this card, and
      // until it does, a second submit would replay a code that has just been
      // rotated out of existence and fail in a way that contradicts the success
      // already handed up.
    } catch (err) {
      const failure = resetFailure(failureCode(err))
      setError(t(failure.key))
      // Back to the field that is actually in question — and only for the two
      // failures where it is. A damaged record or a rate limit is not the
      // code's fault, and returning the user there would say it was.
      if (failure.retryCode) setStep('identify')
      setBusy(false)
    }
  }

  const onIdentify = step === 'identify'

  return (
    <form
      ref={cardRef}
      tabIndex={-1}
      // No class of its own: this card is a plain auth-shaped form and every
      // rule it needs already belongs to those two. A `recovery-reset` hook
      // with no rule behind it in index.css would read as styling that exists.
      className="vault-dialog auth-dialog"
      role="dialog"
      aria-modal="false"
      aria-labelledby="recovery-reset-title"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h3 id="recovery-reset-title" className="vault-title">
        {t('recovery.resetTitle')}
      </h3>

      {onIdentify ? (
        <>
          <p className="key-help">{t('recovery.resetIntro')}</p>

          <label className="label" htmlFor="reset-username">
            {t('account.username')}
          </label>
          <input
            id="reset-username"
            className="text-input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('account.usernamePlaceholder')}
            disabled={busy}
          />

          <label className="label" htmlFor="reset-code">
            {t('recovery.codeLabel')}
          </label>
          <input
            id="reset-code"
            className="text-input"
            type="text"
            // Never a password manager's field and never a browser suggestion
            // list: this string is typed once off paper and must not be offered
            // back to whoever uses the machine next.
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
          />
        </>
      ) : (
        <>
          <label className="label" htmlFor="reset-password">
            {t('recovery.newPassword')}
          </label>
          <input
            id="reset-password"
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />

          {/* Confirmed, like sign-up. A typo here is survivable — the rotated
              code is shown a moment later and opens the account again — but
              only after a second reset, and this costs one field. */}
          <label className="label" htmlFor="reset-confirm">
            {t('account.confirmPassword')}
          </label>
          <input
            id="reset-confirm"
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
          />
        </>
      )}

      {error && (
        <div className="error" role="alert">
          ⚠️ {error}
        </div>
      )}

      <div className="controls vault-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={busy || (onIdentify ? !identified : !passwordReady)}
        >
          {busy ? t('recovery.resetWorking') : onIdentify ? t('recovery.resetContinue') : t('recovery.resetAction')}
        </button>
        {!onIdentify && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setError('')
              setStep('identify')
            }}
            disabled={busy}
          >
            {t('recovery.resetBack')}
          </button>
        )}
        <button type="button" className="link-button subtle" onClick={onCancel} disabled={busy}>
          {t('account.notNow')}
        </button>
      </div>
    </form>
  )
}
