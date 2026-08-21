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

// --- the recovery strings ---------------------------------------------------
//
// Deliberately NOT written the way the block above is. That one greps each
// locale file for `'key'`, which is the cheapest thing that could work and is
// also a check that cannot fail for the reasons that matter: it passes on a key
// sitting in a comment, on a value that is the empty string, and on a value
// that is still English. The contrast is the point — this block loads the
// locale MODULE and reads the value a lookup returns, because what a caller
// obtains is the string, not the presence of a line of source.
//
// The required list is DERIVED, not hand-written. A hand-written list drifts
// the moment someone adds a `t('recovery.…')` call site, and the suite stays
// green while the string ships untranslated. Two sources, unioned:
//
//   1. every `t('recovery.…')` call site in src/ — a grep over CALL SITES, not
//      over locales, so it still measures what the app asks for;
//   2. the keys recoveryLabelKey actually returns, obtained by calling it for
//      all four statuses rather than by grepping for them. Those four reach `t`
//      indirectly (`t(recoveryLabelKey(status))`) and no scan of call sites
//      would ever see them.
import { recoveryLabelKey } from '../src/recoveryUi.ts'

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const calledKeys = new Set()
for (const file of sourceFiles(SRC_DIR)) {
  const text = readFileSync(file, 'utf8')
  for (const [, key] of text.matchAll(/t\(\s*'(recovery\.[A-Za-z0-9_.]+)'/g)) calledKeys.add(key)
}
for (const status of ['none', 'unknown', 'incomplete', 'ready']) calledKeys.add(recoveryLabelKey(status))

const REQUIRED_RECOVERY = [...calledKeys].sort()

test('the derived list found the recovery call sites at all', () => {
  // A regex that silently matches nothing would make every test below vacuous.
  assert.ok(REQUIRED_RECOVERY.length >= 15, `only found ${REQUIRED_RECOVERY.length} recovery call sites`)
  for (const key of ['recovery.warning', 'recovery.confirm', 'recovery.statusUnknown']) {
    assert.ok(REQUIRED_RECOVERY.includes(key), `expected the scan to find ${key}`)
  }
})

const load = async (file) => (await import(pathToFileURL(join(LOCALES_DIR, file)).href)).default

const english = await load('en.ts')
// Every recovery key English defines, whether or not it has a call site yet:
// the reset-flow strings land before their UI does, and a locale missing them
// would only be discovered by the user who needs them most.
const ENGLISH_RECOVERY_KEYS = Object.keys(english).filter((k) => k.startsWith('recovery.'))

/**
 * Three strings whose whole job is to say DIFFERENT things, and one pair added
 * because confusing them is the exact harm: promptBody tells a user they have
 * no recovery code, promptLostBody tells a user they have one nobody has seen.
 * A locale that pasted one over the other passes every check above — the value
 * is present, non-empty and not English — while telling somebody something
 * false about whether their account can be recovered.
 */
const MUST_DIFFER = [
  ['recovery.blurb', 'recovery.warning', 'recovery.regenerateHint'],
  ['recovery.promptBody', 'recovery.promptLostBody'],
]

for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.ts'))) {
  test(`${file} carries the recovery strings`, async () => {
    const strings = await load(file)
    for (const key of [...new Set([...REQUIRED_RECOVERY, ...ENGLISH_RECOVERY_KEYS])]) {
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

  test(`${file} keeps the load-bearing recovery strings distinct from each other`, async () => {
    const strings = await load(file)
    for (const group of MUST_DIFFER) {
      const values = group.map((key) => strings[key].trim())
      assert.equal(
        new Set(values).size,
        group.length,
        `${file} reuses one string across ${group.join(' / ')}`,
      )
    }
  })
}
