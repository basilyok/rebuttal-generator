// Every locale must carry the account.* keys added for password sign-in.
// English fallback would keep the UI functional without them, but a sign-in
// form that suddenly switches language mid-flow reads as phishing — these
// specific strings must exist everywhere.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales')

const REQUIRED = [
  "account.signInOrUp",
  "account.benefitsTitle",
  "account.benefitsKeys",
  "account.benefitsHistory",
  "account.benefitsQuota",
  "account.benefitsLanguage",
  "account.signUpTitle",
  "account.signInTitle",
  "account.continueWithGoogle",
  "account.orDivider",
  "account.username",
  "account.usernamePlaceholder",
  "account.password",
  "account.confirmPassword",
  "account.emailOptional",
  "account.noEmailWarning",
  "account.createAccount",
  "account.signInAction",
  "account.switchToSignIn",
  "account.switchToSignUp",
  "account.passwordShort",
  "account.passwordMismatch",
  "account.usernameInvalid",
  "account.usernameTaken",
  "account.badCredentials",
  "account.rateLimited",
  "account.emailInvalid",
  "account.serverError",
  "account.signOutFirst",
  "account.authError"
]

for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.ts'))) {
  test(`${file} carries the password-account strings`, () => {
    const text = readFileSync(join(LOCALES_DIR, file), 'utf8')
    for (const key of REQUIRED) {
      assert.ok(text.includes(`'${key}'`), `${file} is missing ${key}`)
    }
    assert.ok(!text.includes(`'account.signInWithGoogle'`), `${file} still defines the removed signInWithGoogle key`)
    assert.ok(!text.includes(`'instant.done.signIn'`), `${file} still defines the removed instant.done.signIn key`)
  })
}
