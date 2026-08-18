import { ref, computed, onMounted } from 'vue'
import { api } from '../../shared/api/api'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import { formatDate } from '../../shared/utils/format'

export function useLearning() {
  const loading = ref(true)
  const error = ref(null)
  const flagRate = ref([])
  const suggestions = ref([])

  const chartData = computed(() => ({
    labels: flagRate.value.map((w) => formatDate(w.week)),
    datasets: [
      {
        data: flagRate.value.map((w) => (w.total ? Math.round((w.flagged / w.total) * 1000) / 10 : 0)),
        borderColor: CHART_COLORS.value.giallo,
        backgroundColor: `${CHART_COLORS.value.giallo}33`,
        pointBackgroundColor: CHART_COLORS.value.giallo,
        pointRadius: 3,
        tension: 0.3,
        fill: true,
      },
    ],
  }))

  const chartOptions = createBaseChartOptions()
  chartOptions.scales.y.ticks.callback = (v) => `${v}%`

  onMounted(async () => {
    try {
      const [rate, sugg] = await Promise.all([api.flagRateTrend(8), api.learningSuggestions(20)])
      flagRate.value = rate
      suggestions.value = sugg
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  })

  return { loading, error, flagRate, suggestions, chartData, chartOptions }
}
