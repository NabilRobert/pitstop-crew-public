// Contract 3.6 — a read-only look at what the engine would propose as ads
// right now: no run row, no stored suggestion, no model call. Reads the
// same input a keyword optimizer run reads (loadEngineInput: SELECTs only;
// none of the run's writers — persistSuggestions, linkPlannedCampaigns, the
// intent and vehicle-parse jobs — is called) and prints the new_ad
// candidates per basis, plus examples with their facts and checks.
//
//   npx tsx scripts/previewAdSuggestions.ts [examples, default 2]

import { loadEngineInput } from '../src/optimizer/engineData.js'
import { runEngine, type Candidate } from '../src/optimizer/engine.js'
import type { NewAdPayload } from '../src/optimizer/types.js'

async function main() {
  const input = await loadEngineInput()
  const r = runEngine(input)
  const ad = (c: Candidate) => c.payload as NewAdPayload
  const isAd = (c: Candidate) => c.type === 'new_ad'

  const count = (list: Candidate[]) => {
    const by: Record<string, number> = {}
    for (const c of list.filter(isAd)) by[ad(c).basis] = (by[ad(c).basis] ?? 0) + 1
    return by
  }
  console.log(`data to ${input.asOf}, window ${input.windowStart} → ${input.windowEnd}; ${input.ads?.length ?? 0} enabled ads read`)
  console.log('new (would be stored):', count(r.candidates))
  console.log('already stored (open/planned/applied):', count(r.existing))
  console.log('over the per-run cap:', count(r.capped))
  const adSkips = r.skipped.filter((s) => s.type === 'new_ad')
  const reasons: Record<string, number> = {}
  for (const s of adSkips) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1
  console.log('skipped:', reasons)
  for (const s of adSkips.filter((x) => x.reason === 'checks')) console.log(`  failed checks: ${s.detail}`)

  const winnersInProposals = r.candidates
    .concat(r.existing)
    .flatMap((c) => (c.payload.kind === 'new_campaign' ? c.payload.ad_groups.flatMap((g) => g.keywords.filter((k) => k.source === 'existing_keyword')) : []))
  console.log(`winner keywords placed in campaign proposals: ${winnersInProposals.length}`)

  const n = Number(process.argv[2] ?? 2)
  const all = [...r.candidates, ...r.existing].filter(isAd)
  // One of each basis first, then the rest.
  const examples: Candidate[] = []
  for (const basis of ['weak_ad', 'uncovered_winner', 'new_campaign']) {
    const c = all.find((x) => ad(x).basis === basis)
    if (c && examples.length < n) examples.push(c)
  }
  for (const c of examples) {
    const p = ad(c)
    console.log('\n' + '='.repeat(78))
    const where = p.target.kind === 'proposed_campaign' ? `${String(c.evidence.campaign_name)} › ${p.target.ad_group_name}` : `${String(c.evidence.campaign_name)} › ${String(c.evidence.ad_group_name)}`
    console.log(`${p.basis} — ${where}${p.replaces_ad ? ` (replaces ad #${p.replaces_ad.id} "${p.replaces_ad.label}", ${p.replaces_ad.ad_strength})` : ''}`)
    console.log(`target ${JSON.stringify(p.target)}; fingerprint ${c.fingerprint}; basis ${c.basis}, confidence ${c.confidence}`)
    console.log(`final_url ${p.final_url}; path /${p.path1}/${p.path2}; polished ${p.polished}`)
    console.log('facts:', JSON.stringify(p.facts, null, 2))
    console.log('winner keywords:', JSON.stringify(p.winner_keywords))
    console.log('evidence:', JSON.stringify(c.evidence))
    console.log('headlines:')
    for (const { text } of p.headlines) console.log(`  ${String(text.length).padStart(2)}  ${text}`)
    console.log('descriptions:')
    for (const { text } of p.descriptions) console.log(`  ${String(text.length).padStart(2)}  ${text}`)
    console.log('checks:', JSON.stringify(p.checks))
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
