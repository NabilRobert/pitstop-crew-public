import { getLocale } from '../../i18n/index.js'

// formatDate/formatDateTime read the current UI locale; everything else
// here is a fixed business-domain format (account currency, cost currency,
// plain numbers) and intentionally does not follow the UI locale.
function dateLocale() {
  return getLocale() === 'id' ? 'id-ID' : 'en-GB'
}

// Google Ads API convention: currency stored as micros (1 unit = 1,000,000 micros).
// Account currency is IDR per dummy.md / research.md.
export function formatMicrosAsIDR(micros) {
  const value = (micros || 0) / 1_000_000
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

// pipeline_runs.cost_usd_micros — estimated LLM spend per run, USD in micros.
export function formatMicrosAsUSD(micros) {
  if (micros === null || micros === undefined) return '—'
  const value = micros / 1_000_000
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value)
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n ?? 0)
}

export function formatPercent(n, digits = 2) {
  return `${(n ?? 0).toFixed(digits)}%`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
