export interface MetricDef {
  key: 'impressions' | 'clicks' | 'cost_micros' | 'conversions'
  labelKey: string
}

export const METRICS: MetricDef[] = [
  { key: 'impressions', labelKey: 'metrics.impressions' },
  { key: 'clicks', labelKey: 'metrics.clicks' },
  { key: 'cost_micros', labelKey: 'metrics.cost' },
  { key: 'conversions', labelKey: 'metrics.conversions' },
]
