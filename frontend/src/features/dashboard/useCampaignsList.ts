import { ref, watch, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import type { Campaign, Suggestion } from '../../shared/api/types'
import type { CampaignRow } from './useDashboard'
import { keywordOptimizerApi } from '../keyword-optimizer/keywordOptimizerApi'
import { campaignRollup, type CampaignRollup } from '../keyword-optimizer/boardModel'

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

  // A slow answer for an earlier period must not overwrite the latest one.
  let latest = 0

  async function load() {
    const mine = ++latest
    loading.value = true
    error.value = null
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
      if (mine === latest) error.value = e instanceof Error ? e.message : String(e)
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
      rollups.value = campaignRollup(rows, summary.items, suggestionList.items)
      suggestions.value = suggestionList.items
      keywordInfoAvailable.value = true
    } catch {
      if (mine === latest) {
        rollups.value = new Map()
        suggestions.value = []
        keywordInfoAvailable.value = false
      }
    } finally {
      if (mine === latest) loading.value = false
    }
  }

  watch(days, load, { immediate: true })

  return { loading, error, campaigns, campaignRows, rollups, keywordInfoAvailable, suggestions, reload: load }
}
