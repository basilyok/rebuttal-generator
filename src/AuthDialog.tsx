// Sign in / sign up: one card, two modes — styled after VaultDialog, the app's
// existing pattern for a focused form that appears in flow (no overlay, no
// focus trap, aria-modal false).
//
// The password feeds the derivation in src/account.ts and never leaves this
// component except through onSubmit. Google stays a plain full-page redirect.
//
// The card is a real <form> on purpose, not a div with click handlers: it gives
// every field the same Enter-to-submit behaviour, and it is what makes password
// managers reliably offer to save the credential. For an account with no reset
// path, that save prompt is genuine loss-prevention, not a nicety.

import { useState } from 'react'
import type { TFunction } from './i18n'
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from './account'

export type AuthMode = 'signin' | 'signup'

interface AuthDialogProps {
  t: TFunction
  mode: AuthMode
  /** Whether this deployment also offers Google (from /api/auth/me providers). */
  hasGoogle: boolean
  busy: boolean
  error: string
  /**
   * When set, this dialog is doing duty as "re-enter your password" for the
   * account that is already signed in (the locked-vault unlock path): the
   * username is prefilled and read-only, and the sign-up switch is hidden. A
   * free username field here would be an account-switch door — someone else's
   * credentials would mint them a session while this device still holds the
   * signed-in user's data. App's handleAuthSubmit refuses that mismatch as
   * well; this prop closes the accidental version of it.
   */
  fixedUsername?: string
  onModeChange: (mode: AuthMode) => void
  onGoogle: () => void
  onSubmit: (username: string, password: string, email: string) => void
  onDismiss: () => void
}

export function AuthDialog({
  t,
  mode,
  hasGoogle,
  busy,
  error,
  fixedUsername,
  onModeChange,
  onGoogle,
  onSubmit,
  onDismiss,
}: AuthDialogProps) {
  const [username, setUsername] = useState(fixedUsername ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [email, setEmail] = useState('')
  const [localError, setLocalError] = useState('')

  const isSignup = mode === 'signup'

  const submit = () => {
    setLocalError('')
    const name = username.trim()
    if (!name || !password) return
    if (!USERNAME_PATTERN.test(name)) {
      setLocalError(t('account.usernameInvalid'))
      return
    }
    if (isSignup) {
      if (password.length < PASSWORD_MIN_LENGTH) {
        setLocalError(t('account.passwordShort'))
        return
      }
      if (password !== confirmation) {
        setLocalError(t('account.passwordMismatch'))
        return
      }
    }
    onSubmit(name, password, isSignup ? email : '')
  }

  return (
    <form
      className="vault-dialog auth-dialog"
      role="dialog"
      aria-modal="false"
      aria-labelledby="auth-title"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h3 id="auth-title" className="vault-title">
        {isSignup ? t('account.signUpTitle') : t('account.signInTitle')}
      </h3>

      {hasGoogle && (
        <>
          <button type="button" className="button button-secondary auth-google" onClick={onGoogle} disabled={busy}>
            {t('account.continueWithGoogle')}
          </button>
          <div className="auth-divider" role="separator">
            {t('account.orDivider')}
          </div>
        </>
      )}

      <label className="label" htmlFor="auth-username">
        {t('account.username')}
      </label>
      <input
        id="auth-username"
        className="text-input"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        readOnly={!!fixedUsername}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={t('account.usernamePlaceholder')}
        disabled={busy}
      />

      <label className="label" htmlFor="auth-password">
        {t('account.password')}
      </label>
      <input
        id="auth-password"
        className="text-input"
        type="password"
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />

      {isSignup && (
        <>
          <label className="label" htmlFor="auth-confirm">
            {t('account.confirmPassword')}
          </label>
          <input
            id="auth-confirm"
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
          />

          <label className="label" htmlFor="auth-email">
            {t('account.emailOptional')}
          </label>
          <input
            id="auth-email"
            className="text-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          {!email.trim() && <p className="vault-warning">⚠️ {t('account.noEmailWarning')}</p>}
        </>
      )}

      {(localError || error) && (
        <div className="error" role="alert">
          ⚠️ {localError || error}
        </div>
      )}

      <div className="controls vault-actions">
        <button type="submit" className="button button-primary" disabled={busy || !username.trim() || !password}>
          {busy ? t('account.syncing') : isSignup ? t('account.createAccount') : t('account.signInAction')}
        </button>
        <button type="button" className="button button-secondary" onClick={onDismiss} disabled={busy}>
          {t('account.notNow')}
        </button>
        {/* No sign-up switch while the username is fixed: this render of the
            dialog exists to re-enter one specific account's password, and
            "create one" could only offer a name that is necessarily taken. */}
        {!fixedUsername && (
          <button
            type="button"
            className="link-button subtle"
            // Clear the local error alongside the mode: App clears its own
            // `error` in onModeChange, and a stranded "passwords do not match"
            // would otherwise outlive the confirm field it refers to.
            onClick={() => {
              setLocalError('')
              onModeChange(isSignup ? 'signin' : 'signup')
            }}
            disabled={busy}
          >
            {isSignup ? t('account.switchToSignIn') : t('account.switchToSignUp')}
          </button>
        )}
      </div>
    </form>
  )
}
