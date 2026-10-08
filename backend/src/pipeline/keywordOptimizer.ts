// The weekly keyword optimizer run (docs/overhaul-v3-backend.md section
// 11): inventory snapshot → keyword vehicle parse and search-term intent
// (cached; only new rows can reach the model) → the deterministic engine →
// store the suggestions → Kai polishes the new ads' copy (3.6) → Kai ranks
// and explains the open ones, each graded by Ciri. Runs under trackRun('keyword_optimizer'), so it shares the spend
// cap, the one-run-at-a-time lock, redaction and Run Inspector tracing
// with the report runs.
//
// The engine's output is stored before Kai is called. If her step fails
// (provider down, no credit, unusable JSON) the suggestions are kept,
// unranked, and the run ends 'partial' instead of losing them.

import type OpenAI from 'openai'
import type { PoolClient } from 'pg'
import * as kai from '../agents/kai.js'
import { runWithCritic, type RunWithCriticArgs } from '../agents/criticLoop.js'
import type { RevisionInput } from '../agents/revision.js'
import { query, withTransaction } from '../data/db.js'
import { getOutput } from '../reporting/outputs.js'
import { emitEvent } from '../platform/eventBus.js'
import { getSettings } from '../platform/settings.js'
import { span, event } from '../platform/trace.js'
import { getLastCompletedRun, startRun, trackRun } from './pipelineRuns.js'
import { runIntentClassification } from '../optimizer/intentJob.js'
import { runKeywordVehicleParse } from '../optimizer/vehicleParseJob.js'
import { loadInventorySnapshot } from '../optimizer/inventory/index.js'
import { loadEngineInput } from '../optimizer/engineData.js'
import { runEngine, type Candidate, type EngineInput } from '../optimizer/engine.js'
import { linkPlannedCampaigns, persistSuggestions } from '../optimizer/suggestions.js'
import { buildKaiInput, renderRanking, validateRanking, type AccountSummary, type OpenSuggestion, type RankingValidation } from '../optimizer/ranking.js'
import { buildPolishInput, renderPolish, validatePolish, type PolishAd, type PolishedAd, type PolishValidation } from '../optimizer/adPolish.js'
import { toTexts, type CopyContext } from '../optimizer/adCopy.js'
import { copyContext } from '../optimizer/ads.js'
import { adSettingsFrom } from '../optimizer/engineData.js'
import type { MatchType } from '../optimizer/types.js'

// 'unchanged' (3.5): nothing changed since the last run, so the model step
// (Kai and Ciri) didn't run at all.
export type KaiOutcome = 'approved' | 'flagged' | 'unavailable' | 'skipped' | 'nothing_open' | 'unchanged'
// 3.6: Kai's polish of the ads this run inserted. 'none': no new ad, no call.
export type AdPolishOutcome = 'approved' | 'flagged' | 'unavailable' | 'skipped' | 'none'

export interface KeywordOptimizerResult {
  runId: number
  reportDate: string
  candidates: number
  inserted: number
  superseded: number
  kai: KaiOutcome
  adPolish?: AdPolishOutcome
}

export interface KeywordOptimizerOptions {
  existingRunId?: number
  // No model calls at all: new search terms and keywords stay unclassified
  // (retried next run) and Kai is skipped. The run ends 'partial'.
  skipModel?: boolean
  client?: OpenAI
  // 3.5: said in the run's summary, e.g. that the daily report hadn't
  // finished and the run used the data that existed.
  note?: string
}

// --- 3.5: has anything changed since the last run? --------------------------

/** An open row as stored, for comparison with the engine's recomputation. */
export interface StoredOpenRow {
  fingerprint: string
  payload: unknown
  evidence: unknown
  basis: string
  confidence: string
  expected_impact: unknown
}

export { canonicalJson } from '../optimizer/canonicalJson.js'
import { canonicalJson } from '../optimizer/canonicalJson.js'

/** What the change check compares in a payload. 3.6: an ad's copy, its
 * `polished` flag and its checks can be replaced by Kai's polish, so only the
 * rest (the facts, the target and the winners) counts. */
export function comparablePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || (payload as { kind?: unknown }).kind !== 'new_ad') return payload
  const { headlines: _h, descriptions: _d, polished: _p, checks: _c, ...rest } = payload as Record<string, unknown>
  return rest
}

export interface ChangeCheck {
  changed: boolean
  reasons: string[]
}

/** The model step is worth running only when something changed since the
 * last completed run: a new suggestion, a superseded one, a status changed
 * (by the owner or by auto-linking), or an open suggestion whose recomputed
 * numbers differ from the stored ones. With no earlier run, everything is new. */
export function detectChanges(args: {
  previousRun: boolean
  inserted: number
  superseded: number
  statusChanges: number
  storedOpen: readonly StoredOpenRow[]
  recomputed: readonly Candidate[]
}): ChangeCheck {
  const reasons: string[] = []
  if (!args.previousRun) reasons.push('no earlier completed run')
  if (args.inserted > 0) reasons.push(`${args.inserted} new suggestion${args.inserted === 1 ? '' : 's'}`)
  if (args.superseded > 0) reasons.push(`${args.superseded} superseded`)
  if (args.statusChanges > 0) reasons.push(`${args.statusChanges} status change${args.statusChanges === 1 ? '' : 's'} since the last run`)
  const fresh = new Map(args.recomputed.map((c) => [c.fingerprint, c]))
  let numbers = 0
  for (const row of args.storedOpen) {
    const c = fresh.get(row.fingerprint)
    if (!c) continue // no longer produced: superseded above, or kept for lack of inventory
    const same =
      canonicalJson(comparablePayload(c.payload)) === canonicalJson(comparablePayload(row.payload)) &&
      canonicalJson(c.evidence) === canonicalJson(row.evidence) &&
      canonicalJson(c.expectedImpact) === canonicalJson(row.expected_impact) &&
      c.basis === row.basis &&
      c.confidence === row.confidence
    if (!same) numbers += 1
  }
  if (numbers > 0) reasons.push(`${numbers} open suggestion${numbers === 1 ? '' : 's'} with changed numbers`)
  return { changed: reasons.length > 0, reasons }
}

async function loadChangeInputs(sinceFinishedAt: string | null): Promise<{ storedOpen: StoredOpenRow[]; statusChanges: number }> {
  const storedOpen = await query<StoredOpenRow>(
    `SELECT fingerprint, payload, evidence, basis, confidence, expected_impact
     FROM keyword_suggestions WHERE status = 'open'`
  )
  if (sinceFinishedAt === null) return { storedOpen, statusChanges: 0 }
  // Superseding is counted from this run's own result, not here.
  const [{ n }] = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM keyword_suggestions
     WHERE status_changed_at > $1 AND status <> 'superseded'`,
    [sinceFinishedAt]
  )
  return { storedOpen, statusChanges: n }
}

/** Every open suggestion with the names it points at, oldest first. */
export async function loadOpenSuggestions(): Promise<OpenSuggestion[]> {
  const rows = await query<{
    id: number
    suggestion_type: OpenSuggestion['type']
    basis: OpenSuggestion['basis']
    confidence: OpenSuggestion['confidence']
    payload: OpenSuggestion['payload']
    evidence: OpenSuggestion['evidence']
    expected_impact: OpenSuggestion['expectedImpact']
    explanation: string | null
    campaign_name: string | null
    ad_group_name: string | null
    keyword_text: string | null
    keyword_match_type: MatchType | null
    search_term: string | null
  }>(
    `SELECT s.id, s.suggestion_type, s.basis, s.confidence, s.payload, s.evidence, s.expected_impact, s.explanation,
            c.name AS campaign_name, ag.name AS ad_group_name, k.text AS keyword_text, k.match_type AS keyword_match_type,
            st.text AS search_term
     FROM keyword_suggestions s
     LEFT JOIN campaigns c ON c.id = s.campaign_id
     LEFT JOIN ad_groups ag ON ag.id = s.ad_group_id
     LEFT JOIN keywords k ON k.id = s.keyword_id
     LEFT JOIN search_terms st ON st.id = s.search_term_id
     WHERE s.status = 'open'
     ORDER BY s.id`
  )
  return rows.map((r) => ({
    id: r.id,
    type: r.suggestion_type,
    basis: r.basis,
    confidence: r.confidence,
    payload: r.payload,
    evidence: r.evidence,
    expectedImpact: r.expected_impact,
    campaignName: r.campaign_name,
    adGroupName: r.ad_group_name,
    keyword: r.keyword_text !== null && r.keyword_match_type !== null ? { text: r.keyword_text, matchType: r.keyword_match_type } : null,
    searchTerm: r.search_term,
    explanation: r.explanation,
  }))
}

/** Window totals per campaign with keyword traffic, for Kai's context. */
export function accountSummary(input: EngineInput): AccountSummary {
  const campaignOf = new Map(input.adGroups.map((a) => [a.id, a.campaignId]))
  const totals = new Map<number, { clicks: number; costMicros: number; conversions: number }>()
  for (const k of input.keywords) {
    const c = campaignOf.get(k.adGroupId)
    if (c === undefined) continue
    const t = totals.get(c) ?? totals.set(c, { clicks: 0, costMicros: 0, conversions: 0 }).get(c)!
    t.clicks += k.stats.clicks
    t.costMicros += k.stats.costMicros
    t.conversions += k.stats.conversions
  }
  return {
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    inventory: { source: input.inventory.source, snapshotOn: input.inventory.snapshotOn },
    campaigns: input.campaigns.filter((c) => totals.has(c.id)).map((c) => ({ name: c.name, ...totals.get(c.id)! })),
  }
}

export interface KaiStepDeps {
  rank: (input: string, revision: RevisionInput | null) => Promise<unknown>
  runWithCritic: (args: RunWithCriticArgs) => Promise<number>
  getOutput: (id: number) => Promise<{ content: string; status: string } | null>
}

export interface RankingUpdate {
  id: number
  rank: number
  explanation?: string // absent = leave the row's explanation as it is
}

export interface KaiStepResult {
  outputId: number
  approved: boolean
  updates: RankingUpdate[]
  validation: RankingValidation
}

/** Kai drafts, Ciri grades (revising up to the usual cap), and the final
 * draft's validated ranking becomes the update list. Ranks always apply
 * (ordering only); explanations only when Ciri approved — a flagged
 * explanation is not shown, and the row asks for a new one next run. */
export async function kaiStep(
  open: readonly OpenSuggestion[],
  summary: AccountSummary,
  ctx: { language: string; reportDate: string; pipelineRunId: number },
  deps: KaiStepDeps
): Promise<KaiStepResult> {
  const input = buildKaiInput(open, summary)
  const byContent = new Map<string, RankingValidation>()
  const outputId = await deps.runWithCritic({
    agentType: 'keyword_optimizer',
    generate: async (revision) => {
      const v = validateRanking(await deps.rank(input, revision), open)
      const text = renderRanking(v.items, open)
      byContent.set(text, v)
      const problems = v.rejected.length + v.foreignNumbers.length + v.badMoney.length + v.unranked.length
      await event('decision', 'Validate Kai output', {
        status: problems > 0 ? 'error' : 'ok',
        summary:
          `${v.items.length} ranked, ${v.items.filter((i) => i.explanation !== null).length} explained` +
          (problems > 0 ? ` — ${v.rejected.length} rejected, ${v.unranked.length} left out, ${v.foreignNumbers.length} with a number not in their evidence, ${v.badMoney.length} dropped for money not in rupiah` : ''),
        meta: { rejected: v.rejected, unranked: v.unranked, foreign_numbers: v.foreignNumbers, bad_money: v.badMoney },
      })
      return text
    },
    // Graded against exactly what Kai was given, like Rico and Sammy.
    supportingData: input,
    historicalContext: '',
    language: ctx.language,
    reportDate: ctx.reportDate,
    period: 'weekly',
    pipelineRunId: ctx.pipelineRunId,
  })
  const final = await deps.getOutput(outputId)
  const validation = final ? byContent.get(final.content) : undefined
  if (!final || !validation) throw new Error(`Kai step: final output ${outputId} doesn't match a validated draft`)
  const approved = final.status === 'approved'
  return {
    outputId,
    approved,
    validation,
    updates: validation.items.map((i) => ({
      id: i.candidateId,
      rank: i.rank,
      ...(approved && i.explanation !== null ? { explanation: i.explanation } : {}),
    })),
  }
}

/** Replaces the ranking of the open list: every open row loses its old
 * rank, then the new ranks (and approved explanations) are written. */
export async function applyRanking(client: PoolClient, updates: readonly RankingUpdate[]): Promise<void> {
  await client.query("UPDATE keyword_suggestions SET rank = NULL WHERE status = 'open'")
  for (const u of updates) {
    await client.query(
      `UPDATE keyword_suggestions SET rank = $2, explanation = COALESCE($3, explanation)
       WHERE id = $1 AND status = 'open'`,
      [u.id, u.rank, u.explanation ?? null]
    )
  }
}

// --- 3.6: Kai's polish of new ads ---------------------------------------------

export interface PolishStepDeps {
  polish: (input: string, revision: RevisionInput | null) => Promise<unknown>
  runWithCritic: (args: RunWithCriticArgs) => Promise<number>
  getOutput: (id: number) => Promise<{ content: string; status: string } | null>
}

export interface PolishStepResult {
  outputId: number
  approved: boolean
  updates: PolishedAd[] // empty unless Ciri approved
  validation: PolishValidation
}

/** Kai polishes the copy of the ads this run inserted, Ciri grades the
 * rendered copy (revising up to the usual cap), and only an approved
 * draft's valid ads become updates. Everything else keeps its template,
 * for good: later runs never polish a row again. No ads, no call (null). */
export async function polishStep(
  ads: readonly PolishAd[],
  ctx: { language: string; reportDate: string; pipelineRunId: number; copy: CopyContext },
  deps: PolishStepDeps
): Promise<PolishStepResult | null> {
  if (ads.length === 0) return null
  const input = buildPolishInput(ads, ctx.copy)
  const byContent = new Map<string, PolishValidation>()
  const outputId = await deps.runWithCritic({
    agentType: 'keyword_optimizer',
    generate: async (revision) => {
      const v = validatePolish(await deps.polish(input, revision), ads, ctx.copy)
      const text = renderPolish(v, ads)
      byContent.set(text, v)
      const kept = v.rejected.length + v.missing.length
      await event('decision', 'Validate Kai ad copy', {
        status: kept > 0 ? 'error' : 'ok',
        summary: `${v.accepted.length} of ${ads.length} ads polished` + (kept > 0 ? `, ${v.rejected.length} rejected, ${v.missing.length} not returned (template kept)` : ''),
        meta: { rejected: v.rejected, missing: v.missing },
      })
      return text
    },
    // Graded against the facts and templates Kai was given.
    supportingData: input,
    historicalContext: '',
    language: ctx.language,
    reportDate: ctx.reportDate,
    period: 'weekly',
    pipelineRunId: ctx.pipelineRunId,
  })
  const final = await deps.getOutput(outputId)
  const validation = final ? byContent.get(final.content) : undefined
  if (!final || !validation) throw new Error(`Ad polish: final output ${outputId} doesn't match a validated draft`)
  const approved = final.status === 'approved'
  return { outputId, approved, validation, updates: approved ? validation.accepted : [] }
}

/** Stores approved polish: the copy, its checks and polished: true.
 * The facts and the rest of the payload stay. */
export async function applyPolish(client: PoolClient, updates: readonly PolishedAd[]): Promise<void> {
  for (const u of updates) {
    await client.query(
      `UPDATE keyword_suggestions SET payload = payload || $2::jsonb
       WHERE id = $1 AND status = 'open' AND suggestion_type = 'new_ad'`,
      [u.id, JSON.stringify({ headlines: toTexts(u.headlines), descriptions: toTexts(u.descriptions), polished: true, checks: u.checks })]
    )
  }
}

const noModel = async () => ({ results: [] })

export async function runKeywordOptimizer(opts: KeywordOptimizerOptions = {}): Promise<KeywordOptimizerResult> {
  const runId = opts.existingRunId ?? (await startRun('keyword_optimizer'))
  emitEvent(`Starting keyword optimizer run${opts.skipModel ? ' (no model calls)' : ''}`, 'info', runId)
  // The last run before this one (this one is 'running', so it can't match).
  const previous = await getLastCompletedRun('keyword_optimizer')
  return trackRun(
    'keyword_optimizer',
    async (handle) => {
      if (opts.note) {
        handle.notes.push(opts.note)
        emitEvent(`Keyword optimizer: ${opts.note}`, 'warn', runId)
      }
      const inventory = await span('context', 'Inventory snapshot', async (s) => {
        const snap = await loadInventorySnapshot()
        s.set({
          status: snap.source === 'unavailable' ? 'error' : 'ok',
          errorMessage: snap.error,
          summary: snap.source === 'unavailable' ? `unavailable: ${snap.error}` : `${snap.source}, ${snap.vehicles.length} vehicles on ${snap.snapshotOn}`,
          meta: { source: snap.source, snapshot_on: snap.snapshotOn, vehicles: snap.vehicles.length },
        })
        return snap
      })

      // 3.3 — planned proposals that now exist as real campaigns are applied
      // first, so the engine sees them as done.
      const linked = await linkPlannedCampaigns()
      if (linked > 0) emitEvent(`Linked ${linked} planned campaign proposal(s) to real campaigns`, 'info', runId)

      // Cached; only keywords and terms not seen before can reach the model.
      await runKeywordVehicleParse(inventory.vehicles, opts.skipModel ? { caller: noModel } : { client: opts.client })
      await runIntentClassification(opts.skipModel ? { caller: noModel } : { client: opts.client })

      const input = await span('context', 'Build engine input', async (s) => {
        const i = await loadEngineInput({ inventory })
        s.set({
          summary: `${i.windowStart} → ${i.windowEnd}: ${i.keywords.length} keywords, ${i.searchTerms.length} search terms, ${i.intents.size} intents cached`,
          meta: { as_of: i.asOf, window_start: i.windowStart, window_end: i.windowEnd, keywords: i.keywords.length, search_terms: i.searchTerms.length },
        })
        return i
      })

      const result = await span('decision', 'Keyword engine', async (s) => {
        const r = runEngine(input)
        const byType: Record<string, number> = {}
        for (const c of r.candidates) byType[c.type] = (byType[c.type] ?? 0) + 1
        s.set({
          summary: `${r.candidates.length} new candidates, ${r.skipped.length} skipped, ${r.notEnoughData} terms not enough data${r.inventoryAvailable ? '' : ', no inventory'}`,
          meta: { by_type: byType, skipped: r.skipped.length, not_enough_data: r.notEnoughData, inventory_available: r.inventoryAvailable },
        })
        return r
      })

      const { newAds, ...stored } = await withTransaction((client) => persistSuggestions(client, handle.runId, result))
      emitEvent(`Keyword engine: ${stored.inserted} new suggestions, ${stored.superseded} superseded`, 'info', runId)
      const base = { runId: handle.runId, reportDate: input.asOf, candidates: result.candidates.length, ...stored }

      if (opts.skipModel) {
        handle.partial = 'model step skipped (no-model run): suggestions stored unranked'
        return { ...base, kai: 'skipped' as const, adPolish: newAds.length > 0 ? ('skipped' as const) : ('none' as const) }
      }

      // 3.5 cost control: no model call when nothing changed since the last run.
      const sinceFinishedAt = previous?.finished_at ? new Date(previous.finished_at as string).toISOString() : null
      const change = await span('decision', 'Anything new for Kai?', async (s) => {
        const c = detectChanges({ previousRun: sinceFinishedAt !== null, ...stored, ...(await loadChangeInputs(sinceFinishedAt)), recomputed: result.existing })
        s.set({ summary: c.changed ? `yes: ${c.reasons.join(', ')}` : 'no changes since the last run', meta: { reasons: c.reasons } })
        return c
      })
      if (!change.changed) {
        handle.notes.push('no changes since the last run, model step skipped (0 model calls)')
        emitEvent('Keyword optimizer: no changes since the last run — Kai and Ciri skipped', 'info', runId)
        return { ...base, kai: 'unchanged' as const, adPolish: 'none' as const }
      }
      const settings = await getSettings()
      const language = settings.report_language

      // 3.6: only the ads this run inserted (the 11.8 skip rule applied to
      // ads). A failure keeps the templates and doesn't stop the ranking.
      let adPolish: AdPolishOutcome = 'none'
      if (newAds.length > 0) {
        try {
          emitEvent(`Kai: polishing the copy of ${newAds.length} new ad(s)…`, 'info', runId)
          const copy = copyContext(adSettingsFrom(settings))
          const p = await polishStep(newAds, { language, reportDate: input.asOf, pipelineRunId: handle.runId, copy }, {
            polish: (text, revision) => kai.polishAds(text, revision, opts.client),
            runWithCritic,
            getOutput,
          })
          const updates = p?.updates ?? []
          if (updates.length > 0) await withTransaction((client) => applyPolish(client, updates))
          adPolish = p?.approved ? 'approved' : 'flagged'
          emitEvent(`Kai: ${updates.length} of ${newAds.length} ad(s) stored with polished copy (${adPolish})`, 'info', runId)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          adPolish = 'unavailable'
          handle.notes.push(`ad polish unavailable, templates kept: ${message}`)
          emitEvent(`Kai's ad polish unavailable — templates kept: ${message}`, 'warn', runId)
        }
      }

      const open = await loadOpenSuggestions()
      if (open.length === 0) return { ...base, kai: 'nothing_open' as const, adPolish }

      try {
        emitEvent(`Kai: ranking ${open.length} open suggestions…`, 'info', runId)
        const r = await kaiStep(open, accountSummary(input), { language, reportDate: input.asOf, pipelineRunId: handle.runId }, {
          rank: (text, revision) => kai.rank(text, revision, language, opts.client),
          runWithCritic,
          getOutput,
        })
        await withTransaction((client) => applyRanking(client, r.updates))
        return { ...base, kai: r.approved ? ('approved' as const) : ('flagged' as const), adPolish }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        emitEvent(`Kai unavailable — suggestions kept unranked: ${message}`, 'warn', runId)
        handle.partial = `Kai unavailable, suggestions stored unranked: ${message}`
        return { ...base, kai: 'unavailable' as const, adPolish }
      }
    },
    runId
  )
}
