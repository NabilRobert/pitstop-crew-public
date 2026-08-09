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

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n ?? 0)
}

export function formatPercent(n, digits = 2) {
  return `${(n ?? 0).toFixed(digits)}%`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
