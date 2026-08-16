// The leaf validator every ciphertext-storing endpoint shares.
//
// Hoisted here after the third copy appeared and the copies had already
// drifted: vault.js and history.js spelled the character class `+`, dek.js
// spelled it `*`. Nothing depended on the difference (every caller checks
// `length > 0` separately, which is the only case the two spellings decide
// differently), but a validator that differs between endpoints for no reason
// is a validator nobody can reason about in one place.
//
// Only the PREDICATE is shared. The guard ORDER around it — parse, validate,
// brake, write — stays cloned per endpoint on purpose: tests/writebudget.test.mjs
// exists to police that ordering endpoint by endpoint, and an abstraction that
// hid it would make the thing being policed invisible at the call site.

/** Base64 with padding. Not a decoder — this only rejects out-of-alphabet junk. */
export const BASE64 = /^[A-Za-z0-9+/=]+$/

/** A non-empty, length-bounded base64 string. Everything else is malformed. */
export const isBlob = (value, maxChars) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxChars && BASE64.test(value)
