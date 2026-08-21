// Every locale must carry the account.* keys added for password sign-in.
// English fallback would keep the UI functional without them, but a sign-in
// form that suddenly switches language mid-flow reads as phishing — these
// specific strings must exist everywhere.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

// The recovery strings, added with the setup UI. Same argument as above and
// then some: the code is shown exactly once, and the two lines that carry the
// weight — "you can generate a new one any time" and "lose both and it is gone
// forever" — are the difference between a user who files the code away and one
// who learns what it was for after the fact. An English-only warning is a
// warning most of these users will not read.
//
// This block loads each locale MODULE and reads the value a translator lookup
// would return, rather than grepping the file for the key. Text matching would
// pass on a key sitting in a comment, or on one whose value is the empty
// string; neither renders anything. What a caller obtains is the string.
const REQUIRED_RECOVERY = [
  'recovery.title',
  'recovery.blurb',
  'recovery.regenerateHint',
  'recovery.copy',
  'recovery.copied',
  'recovery.warning',
  'recovery.confirm',
  'recovery.done',
  'recovery.working',
  'recovery.setupFailed',
  'recovery.promptBody',
  'recovery.promptAction',
  'recovery.promptDismiss',
  'recovery.statusNone',
  'recovery.statusFinishing',
  'recovery.statusReady',
  // Fourth status, and the one most easily forgotten: `unknown` means the check
  // failed, NOT that recovery is unconfigured. Falling back to statusNone here
  // would offer first-time setup to someone who already has a code.
  'recovery.statusUnknown',
  'recovery.resetTitle',
  'recovery.resetIntro',
  'recovery.codeLabel',
  'recovery.newPassword',
  'recovery.resetAction',
  'recovery.resetFailed',
  'recovery.resetBlocked',
  'recovery.forgot',
]

const load = async (file) => (await import(pathToFileURL(join(LOCALES_DIR, file)).href)).default

const english = await load('en.ts')

for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.ts'))) {
  test(`${file} carries the recovery strings`, async () => {
    const strings = await load(file)
    for (const key of REQUIRED_RECOVERY) {
      const value = strings[key]
      assert.equal(typeof value, 'string', `${file} is missing ${key}`)
      assert.ok(value.trim().length > 0, `${file} has an empty ${key}`)
      if (file !== 'en.ts') {
        // Untranslated keys fall back to English at runtime, so an English
        // value here would render — and hide the omission. Fail instead.
        assert.notEqual(value, english[key], `${file} left ${key} in English`)
      }
    }
  })
}
