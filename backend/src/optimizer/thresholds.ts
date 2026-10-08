// The engine's thresholds (docs/overhaul-v3-backend.md sections 11.1,
// 11.6 and 11.7). Every value is a STARTING DEFAULT, tuned against the
// scoring harness (scripts/scoreOptimizer.ts), not a rule. Its own module so
// the engine, the keyword verdicts and the campaign proposals can all read
// it without importing each other.

export const ENGINE_DEFAULTS = {
  windowDays: 90, // evidence window, ending conversionLagDays before the newest day
  conversionLagDays: 3, // the newest days, whose conversions haven't all arrived yet
  changeGuardDays: 7, // skip campaigns changed this recently: their data is mid-shift
  dismissedCooldownDays: 28, // a dismissed idea stays away this long
  coldStartDays: 14, // under two weeks of data, confidence is capped at low
  nonBuyerMinClicks: 10, // a job/student/consumer term with no conversion
  wasteTokenMinTerms: 3, // a word shared by this many zero-conversion terms
  promoteMinConversions: 2,
  promoteMaxCpaRatio: 1.0, // term CPA ≤ this × the parent keyword's
  matchTypeWasteShare: 0.3, // share of visible spend on non-buyer intents
  matchTypeMinCoverage: 0.5, // visible search-term spend ÷ keyword spend
  pauseMaxQualityScore: 4,
  spinOutMinKeywords: 3,
  spinOutMaxCpaRatio: 0.8, // cluster CPA ≤ this × the ad group's
  spinOutMinConversions: 8,
  newKeywordCap: 5, // stock-generated keywords per run
  raiseBidMinRankLost: 0.3, // and above the ad group's other keywords
  raiseBidMinConversions: 2,
  agingDays: 60, // average days listed for "aging stock"
  // Contract 3.3 — campaign proposals (campaigns.ts, section 11.7).
  campaignCap: 3, // new_campaign proposals per run, ranked by units × average margin
  uncoveredMinUnits: 2, // available units of a model nothing advertises
  agingMinUnits: 2, // aging or top-margin units of a thinly covered model
  topMarginQuantile: 0.75, // "top quartile of margin", across available units
  thinCoverageMaxKeywords: 1, // at most this many enabled keywords = thin coverage
  themeMinUnits: 4,
  themeMinModels: 2,
  campaignMaxKeywords: 12,
  campaignMaxAdGroups: 4,
  // Contract 3.6 — ad suggestions (ads.ts, section 11.9).
  adCap: 3, // new weak_ad + uncovered_winner ads per run (proposal ads aren't capped)
  adPromotedDays: 30, // an applied promote_search_term counts as a winner this long
}

export type EngineThresholds = { [K in keyof typeof ENGINE_DEFAULTS]: number }
