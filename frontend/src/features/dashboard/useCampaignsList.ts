import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import type { Campaign, KeywordPerformanceRow, KeywordSummary, Suggestion, SuggestionsResponse } from '../../shared/api/types'
import type { CampaignRow } from './useDashboard'
import { keywordOptimizerApi } from '../keyword-optimizer/keywordOptimizerApi'
import { buildNotes, campaignRollup, type CampaignRollup } from '../keyword-optimizer/boardModel'

// How often the page looks for a new optimizer run: quick while one is going, slow otherwise (and not at all while
// the tab is hidden), so the lanes and keyword lines update when a run finishes without anyone reloading.
const FAST_POLL_MS = 5_000
const SLOW_POLL_MS = 60_000

/** The campaigns index: totals per campaign for the chosen period (same 1W-5Y buttons as the dashboard), plus a
 * best-effort keyword roll-up per campaign. If the keyword calls fail (an older backend), the cards simply show
 * their totals without the keyword line. */
export function useCampaignsList(days: Ref<number>) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const campaigns = ref<Campaign[]>([])
  const campaignRows = ref<CampaignRow[]>([])
  const rollups = ref<Map<number, CampaignRollup>>(new Map())
  const keywordInfoAvailable = ref(false)
  // Every suggestion (any status): the Planned lane and the "proposals waiting" notice read from here.
  const suggestions = ref<Suggestion[]>([])
  const keywordRows = ref<KeywordPerformanceRow[]>([])
  const keywordSummaries = ref<KeywordSummary[]>([])
  // The same notes the Keyword Optimizer board shows, so a keyword's side panel can open from a campaign card.
  const notes = computed(() => buildNotes(keywordRows.value, keywordSummaries.value, suggestions.value))

  // A slow answer for an earlier period must not overwrite the latest one.
  let latest = 0

  // A reload the owner did not ask for (a new run finished) must not dim the cards or flash an error.
  async function load(quiet = false) {
    const mine = ++latest
    if (!quiet) loading.value = true
    if (!quiet) error.value = null
    const DAYS = days.value
    try {
      const [campaignList, perf] = await Promise.all([api.campaigns(), api.performance(DAYS)])
      if (mine !== latest) return
      campaigns.value = campaignList

      const byCampaign = new Map<string, CampaignRow>()
      for (const row of perf) {
        if (!byCampaign.has(row.campaign)) {
          byCampaign.set(row.campaign, { campaign: row.campaign, impressions: 0, clicks: 0, cost_micros: 0, conversions: 0, ctr: 0 })
        }
        const agg = byCampaign.get(row.campaign)!
        agg.impressions += row.impressions
        agg.clicks += row.clicks
        agg.cost_micros += row.cost_micros
        agg.conversions += row.conversions
      }
      campaignRows.value = Array.from(byCampaign.values())
        .map((c) => ({ ...c, ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0 }))
        .sort((a, b) => b.cost_micros - a.cost_micros)
      // A campaign that exists but has no rows in this period (a new or simulated one) still gets a card, marked
      // as having no data, so it is never silently missing and never shown as zeros.
      const seen = new Set(campaignRows.value.map((r) => r.campaign))
      for (const c of campaignList) {
        if (!seen.has(c.name)) {
          campaignRows.value.push({ campaign: c.name, impressions: 0, clicks: 0, cost_micros: 0, conversions: 0, ctr: 0, noData: true })
        }
      }
    } catch (e) {
      if (mine === latest && !quiet) error.value = e instanceof Error ? e.message : String(e)
      if (mine === latest) loading.value = false
      return
    }

    // Keyword roll-up, best effort and independent of the totals above.
    try {
      const [rows, summary, suggestionList] = await Promise.all([
        keywordOptimizerApi.keywordRows(DAYS),
        keywordOptimizerApi.summary(DAYS),
        keywordOptimizerApi.suggestions({ status: 'all', limit: 200 }),
      ])
      if (mine !== latest) return
      keywordRows.value = rows
      keywordSummaries.value = summary.items
      rollups.value = campaignRollup(rows, summary.items, suggestionList.items)
      suggestions.value = suggestionList.items
      keywordInfoAvailable.value = true
    } catch {
      if (mine === latest) {
        rollups.value = new Map()
        suggestions.value = []
        keywordRows.value = []
        keywordSummaries.value = []
        keywordInfoAvailable.value = false
      }
    } finally {
      if (mine === latest) loading.value = false
    }
  }

  watch(days, () => load(), { immediate: true })

  // --- notice a finished optimizer run and reload quietly ---
  let lastSignature = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let running = false
  const signatureOf = (d: SuggestionsResponse) =>
    `${d.run?.id ?? '-'}|${d.run?.status ?? '-'}|${d.run?.finished_at ?? '-'}|${d.total}|${d.items.map((s) => `${s.id}:${s.status}`).join(',')}`

  /** Looks at the latest run and suggestions; reloads when they changed. Returns whether it reloaded. */
  async function checkForNewResults(): Promise<boolean> {
    try {
      const d = await keywordOptimizerApi.suggestions({ status: 'all', limit: 200 })
      running = d.run?.status === 'running'
      const sig = signatureOf(d)
      const changed = lastSignature !== '' && sig !== lastSignature
      lastSignature = sig
      if (changed) await load(true)
      return changed
    } catch {
      return false // an older backend or a hiccup: the next check tries again
    }
  }

  function scheduleCheck() {
    if (stopped) return
    timer = setTimeout(async () => {
      if (typeof document === 'undefined' || !document.hidden) await checkForNewResults()
      scheduleCheck()
    }, running ? FAST_POLL_MS : SLOW_POLL_MS)
  }

  onMounted(async () => {
    await checkForNewResults() // sets the baseline the next check compares against
    scheduleCheck()
  })
  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })

  return { loading, error, campaigns, campaignRows, rollups, keywordInfoAvailable, suggestions, notes, reload: () => load(), checkForNewResults }
}
