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
 * is the difference between two indistinguishable flavours of never. This
 * brake exists to bound the KV write budget and to keep an automated grinder
 * off the endpoint, not to be the thing standing between an attacker and the
 * code — the code's own entropy is that.
 */
export const RECOVER_RATE = { windowMs: 600_000, max: 8 }

/** The in-memory layer, constructed once so both endpoints count into it. */
export const overRecoverFlood = makeFloodBrake(RECOVER_RATE)

/** The durable layer's counter name. Shared for the same reason. */
export const RECOVER_BRAKE_NAME = 'auth-recover'
