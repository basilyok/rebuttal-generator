// The top bar: language, and account when sign-in is configured.
//
// Two deliberate choices here.
//
// 1. English is always one click away, never buried in the dropdown. Someone landed
//    in a language they cannot read cannot find "English" inside a <select> whose
//    own label they also cannot read — so when the UI is not in English, a literal
//    "English" button sits next to the picker. It is the one control that must work
//    when every other word on screen is unreadable to the user.
//
// 2. The vault dialogs say what actually happens to the keys, in plain words. People
//    are right to hesitate before uploading an API key, and the honest answer —
//    encrypted here, unreadable there — is also the reassuring one.

import { useState } from 'react'
import type { TFunction } from './i18n'
import { SUPPORTED } from './i18n'
import { LANGUAGE_ENDONYMS } from './lang'
import type { AuthState } from './auth'
import type { RecoveryStatus } from './recovery'

interface BarProps {
  t: TFunction
  language: string
  onLanguageChange: (language: string) => void
  auth: AuthState
  vaultState: VaultUiState
  onSignInClick: () => void
  onSignOut: () => void
  onUnlockClick: () => void
  /**
   * Where this account stands on recovery. Four values, and `unknown` is not a
   * synonym for `none`: it means the check itself failed, so offering
   * first-time setup on it would be offering it to someone who may already have
   * a code. See the label below for what each one says.
   */
  recoveryStatus: RecoveryStatus
  onSetupRecovery: () => void
}

export type VaultUiState = 'none' | 'locked' | 'unlocked' | 'saving'

export function AccountBar({
  t,
  language,
  onLanguageChange,
  auth,
  vaultState,
  onSignInClick,
  onSignOut,
  onUnlockClick,
  recoveryStatus,
  onSetupRecovery,
}: BarProps) {
  const [showBenefits, setShowBenefits] = useState(false)

  return (
    <div className="account-bar">
      <div className="language-controls">
        <label className="visually-hidden" htmlFor="ui-language">
          {t('language.choose')}
        </label>
        <select
          id="ui-language"
          className="language-select"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          title={t('language.choose')}
        >
          {SUPPORTED.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_ENDONYMS[code] || code}
            </option>
          ))}
        </select>
        {language !== 'en' && (
          <button className="link-button english-escape" onClick={() => onLanguageChange('en')}>
            {t('language.switchToEnglish')}
          </button>
        )}
      </div>

      {auth.configured && (
        <div className="account-controls">
          {auth.user ? (
            <>
              {vaultState === 'locked' && (
                <button className="link-button vault-locked" onClick={onUnlockClick}>
                  🔒 {t('account.keysLocked')} · {t('account.unlock')}
                </button>
              )}
              {vaultState === 'unlocked' && <span className="vault-synced">🔓 {t('account.keysSynced')}</span>}
              {vaultState === 'saving' && <span className="vault-synced">{t('account.syncing')}</span>}
              {/* Recovery lives beside the vault indicator because it is the
                  same subject — what happens to the encrypted keys — and it is
                  a button in EVERY state, never only when unprovisioned.
                  Setup can be interrupted between storing the wrapped DEK and
                  registering the code's verifier, which leaves the status
                  reading `ready` while the issued code opens nothing. No
                  client-side check can spot that (the endpoint that could would
                  be an oracle for which accounts have recovery), so the
                  mitigation is that re-running setup — which rewrites both — is
                  always one click away. A user holding a dead code always has a
                  way out. Password accounts only: Google accounts have no
                  password-derived key to wrap a DEK under. */}
              {auth.user.provider === 'local' && (
                <button className="link-button recovery-status" onClick={onSetupRecovery}>
                  {recoveryStatus === 'ready'
                    ? t('recovery.statusReady')
                    : recoveryStatus === 'incomplete'
                      ? t('recovery.statusFinishing')
                      : recoveryStatus === 'unknown'
                        ? t('recovery.statusUnknown')
                        : t('recovery.statusNone')}
                </button>
              )}
              {auth.user.picture && <img className="account-avatar" src={auth.user.picture} alt="" />}
              <span className="account-name">{auth.user.name || auth.user.email}</span>
              <button className="link-button" onClick={onSignOut}>
                {t('account.signOut')}
              </button>
            </>
          ) : (
            <div
              className="signin-cluster"
              // Gated on a real mouse pointer: a tap on a touch screen fires
              // compatibility hover events, so an ungated enter-handler would
              // open the popover a beat before the ⓘ click toggled it closed
              // again — net closed on essentially every fresh tap.
              onPointerEnter={(e) => e.pointerType === 'mouse' && setShowBenefits(true)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setShowBenefits(false)}
            >
              <button
                className="button button-secondary sign-in-button"
                onClick={() => {
                  // Hover leaves the popover open; do not let it float over the
                  // dialog this click just opened.
                  setShowBenefits(false)
                  onSignInClick()
                }}
              >
                {t('account.signInOrUp')}
              </button>
              {/* Mouse users get the popover on hover (above); this click
                  toggle is the touch and keyboard path to the same content. */}
              <button
                className="link-button benefits-toggle"
                aria-expanded={showBenefits}
                aria-controls="account-benefits"
                onClick={() => setShowBenefits((v) => !v)}
                title={t('account.benefitsTitle')}
              >
                ⓘ
              </button>
              {showBenefits && (
                <div id="account-benefits" className="account-benefits" role="note">
                  <strong>{t('account.benefitsTitle')}</strong>
                  <ul>
                    <li>{t('account.benefitsKeys')}</li>
                    <li>{t('account.benefitsHistory')}</li>
                    <li>{t('account.benefitsQuota')}</li>
                    <li>{t('account.benefitsLanguage')}</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface VaultDialogProps {
  t: TFunction
  mode: 'setup' | 'unlock'
  busy: boolean
  error: string
  onSubmit: (passphrase: string) => void
  onDismiss: () => void
  onForget?: () => void
}

/**
 * Passphrase capture for both first setup and unlocking on a new device. One
 * component because the two differ only in copy and in whether the passphrase is
 * confirmed — splitting them would duplicate the validation that matters.
 */
export function VaultDialog({ t, mode, busy, error, onSubmit, onDismiss, onForget }: VaultDialogProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [localError, setLocalError] = useState('')

  const isSetup = mode === 'setup'

  const submit = () => {
    setLocalError('')
    if (!passphrase) return
    if (isSetup && passphrase !== confirmation) {
      setLocalError(t('account.passphraseMismatch'))
      return
    }
    onSubmit(passphrase)
  }

  // Advice, not a gate. Refusing to save someone's own keys over passphrase strength
  // would be a worse outcome than a weak passphrase on data they can revoke.
  let hint = ''
  if (isSetup && passphrase) {
    if (passphrase.length < 12) hint = t('account.passphraseShort')
    else if (!/[^a-zA-Z]/.test(passphrase)) hint = t('account.passphraseLettersOnly')
  }

  return (
    <div className="vault-dialog" role="dialog" aria-modal="false" aria-labelledby="vault-title">
      <h3 id="vault-title" className="vault-title">
        {isSetup ? t('account.setupTitle') : t('account.unlockTitle')}
      </h3>
      <p className="key-help">{isSetup ? t('account.setupBlurb') : t('account.unlockBlurb')}</p>

      <label className="label" htmlFor="vault-passphrase">
        {t('account.passphrase')}
      </label>
      <input
        id="vault-passphrase"
        className="text-input"
        type="password"
        autoComplete={isSetup ? 'new-password' : 'current-password'}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder={t('account.passphrasePlaceholder')}
        onKeyDown={(e) => e.key === 'Enter' && !isSetup && submit()}
        disabled={busy}
      />

      {isSetup && (
        <>
          <label className="label" htmlFor="vault-confirm">
            {t('account.confirmPassphrase')}
          </label>
          <input
            id="vault-confirm"
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={busy}
          />
          <p className="vault-warning">⚠️ {t('account.setupWarning')}</p>
        </>
      )}

      {hint && <p className="key-help vault-hint">{hint}</p>}
      {(localError || error) && (
        <div className="error" role="alert">
          ⚠️ {localError || error}
        </div>
      )}

      <div className="controls vault-actions">
        <button className="button button-primary" onClick={submit} disabled={busy || !passphrase}>
          {busy ? t('account.syncing') : isSetup ? t('account.saveKeys') : t('account.unlockAction')}
        </button>
        <button className="button button-secondary" onClick={onDismiss} disabled={busy}>
          {t('account.notNow')}
        </button>
        {onForget && (
          <button className="link-button subtle" onClick={onForget} disabled={busy}>
            {t('account.forgetKeys')}
          </button>
        )}
      </div>
    </div>
  )
}
