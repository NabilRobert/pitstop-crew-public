import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'
import type { Campaign } from '../../shared/api/types'
import type { CampaignRow } from './useDashboard'

// Fixed window, matching CampaignDetailPage.vue — this index page is
// purely a navigation aid into the per-campaign drill-down, not another
// place to duplicate the dashboard's own period selector.
const DAYS = 90

export function useCampaignsList() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const campaigns = ref<Campaign[]>([])
  const campaignRows = ref<CampaignRow[]>([])

  onMounted(async () => {
    try {
      const [campaignList, perf] = await Promise.all([api.campaigns(), api.performance(DAYS)])
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
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return { loading, error, campaigns, campaignRows }
}
