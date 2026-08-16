// The rate limit shared by both steps of a password reset.
//
// It lives in its own module for one reason: makeFloodBrake() closes over a
// fresh Map per call, so two endpoints each calling it get two independent
// in-memory counters. begin.js and complete.js did exactly that, and the
// comment there claimed the two steps "share one counter" — only the DURABLE
// layer was shared (it keys on the brake name, which was already identical);
// the in-memory layer silently granted 5 + 5. Constructing the brake once,
// here, is what makes both layers genuinely shared.
//
// Sharing is the point, not an optimisation. To an attacker the two steps are
// one flow — complete re-verifies the same recovery code begin checked, so it
// is a second guessing surface against the same secret. Separate counters
// would hand out double the budget for guessing one code.
import { makeFloodBrake } from './ratelimit.js'

/**
 * 8 per 10 minutes per address.
 *
 * Sized by the flow, not by symmetry with login. One clean reset spends 2 (a
 * begin and a complete). A single mistyped code spends 3. At the 5 this
 * started as, two mistypes locked the user out for ten minutes — and a lockout
 * is at its most expensive precisely when the user is retrying out of a
 * half-finished reset. 8 leaves room for two mistakes and a retry.
 *
 * The security cost of the raise is nil: the recovery code carries ~120 bits
 * (src/recovery.ts), so the difference between 5 and 8 guesses per 10 minutes
 * is the difference between two indistinguishable flavours of never. What
 * stands between an attacker and the code is the code's own entropy; this
 * brake keeps an automated grinder off the endpoint, nothing more.
 *
 * DO NOT read this as a bound on the KV write budget — an earlier version of
 * this comment claimed it was one, and the arithmetic says otherwise. `begin`
 * writes nothing at all, so it needs no such bound. `complete` writes FOUR
 * rows, and 8 per 10 minutes is 1,152 requests/day per address: 4,608 writes
 * against a namespace budget of 1,000/day, which one address would drain in
 * about five hours. login.js treats exactly this arithmetic as load-bearing,
 * so the difference is worth naming: what actually bounds `complete` is that
 * every one of those requests must carry a VALID recovery code, so only an
 * account's own owner can spend the budget, and only on their own account.
 * The cap above is not what makes that arithmetic safe and would not save us
 * if the code check ever weakened.
 */
export const RECOVER_RATE = { windowMs: 600_000, max: 8 }

/** The in-memory layer, constructed once so both endpoints count into it. */
export const overRecoverFlood = makeFloodBrake(RECOVER_RATE)

/** The durable layer's counter name. Shared for the same reason. */
export const RECOVER_BRAKE_NAME = 'auth-recover'
