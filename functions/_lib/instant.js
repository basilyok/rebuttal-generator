// Every number the funnel design fixed lives here, because the spec's Section 1
// requires caps to be config: raising a free limit later is easy, cutting one
// churns users. Change values here, redeploy, done.
export const INSTANT = {
  anonCap: 3, // one argument + two iterations — never end the taste mid-dissatisfaction
  userCap: 6, // signed-in headroom kept low so a future paid tier has somewhere to stand
  inputMaxChars: 12_000, // the cheapest attack was a huge paste; this is the cheapest fix
  recipientMaxChars: 300,
  maxCitations: 8,
  // First-ever reply routes PAID: the highest-leverage output in the funnel
  // must not depend on the shared, burnable :free pool.
  paidModel: 'openai/gpt-5.6-luna',
  freeModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  maxTokens: 1600,
  upstreamTimeoutMs: 90_000,
}
