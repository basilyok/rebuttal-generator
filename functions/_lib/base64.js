// The leaf validator every ciphertext-storing endpoint shares.
//
// Hoisted here after the third copy appeared and the copies had already
// drifted: vault.js and history.js spelled the character class `+`, dek.js
// spelled it `*`. Nothing depended on the difference (every caller checks
// `length > 0` separately, which is the only case the two spellings decide
// differently), but a validator that differs between endpoints for no reason
// is a validator nobody can reason about in one place.
//
// Only PURE, ORDER-FREE helpers belong here — predicates and normalizers. The
// guard ORDER around them — parse, validate, brake, write — stays cloned per
// endpoint on purpose: tests/writebudget.test.mjs exists to police that
// ordering endpoint by endpoint, and an abstraction that hid it would make the
// thing being policed invisible at the call site.

/** Base64 with padding. Not a decoder — this only rejects out-of-alphabet junk. */
export const BASE64 = /^[A-Za-z0-9+/=]+$/

/** A non-empty, length-bounded base64 string. Everything else is malformed. */
export const isBlob = (value, maxChars) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxChars && BASE64.test(value)

// --- wrapped-key blobs -----------------------------------------------------
// The `{ iv, ciphertext }` pair that both writers of the dek: record produce
// (PUT /api/dek and auth/recover/complete). Hoisted here for the same reason
// isBlob was: the second copy was verbatim, and two endpoints validating the
// same record shape from two definitions is a drift waiting to happen — one
// that would show up as a record one writer accepts and the other calls
// corrupt.

/**
 * Both fields are fixed-size by construction: a 12-byte GCM iv is 16 base64
 * chars, and a wrapped 32-byte DEK plus its 16-byte tag is 64. 512 is ~8x the
 * largest legitimate value — loose enough to survive a future cipher with a
 * bigger key or a longer nonce, tight enough that this record can never become
 * a place to park data. It is a sanity bound, not a fit.
 */
export const MAX_WRAPPED_FIELD = 512

/** One wrapped copy of a key: an iv and a ciphertext, both bounded base64. */
export const isWrapped = (value) =>
  !!value && isBlob(value.iv, MAX_WRAPPED_FIELD) && isBlob(value.ciphertext, MAX_WRAPPED_FIELD)

/**
 * The storable form of a wrapped copy.
 *
 * Stamps version 1 rather than honouring a client-supplied `version` the way
 * vault.js does, and the difference is intentional: vault.js passes a version
 * through for a client that must recognise its own older key-derivation
 * scheme, whereas the servers here validate exactly one wrap format (isWrapped
 * above). Echoing a client-supplied version would label a record with a format
 * nothing ever checked for.
 *
 * Naming only the three fields it emits also serves as a secondary bound on
 * the history chain in recover/complete.js — it would drop a `previous` nested
 * inside a copy. The PRIMARY bound there is that function's own two-field
 * return, since `previous` lives at the record's top level, not inside a copy;
 * see previousPair(). Do not turn this into a spread, but do not go to it
 * expecting to find the line that keeps the chain at depth 1.
 */
export const cleanWrapped = (value) => ({ iv: value.iv, ciphertext: value.ciphertext, version: 1 })
