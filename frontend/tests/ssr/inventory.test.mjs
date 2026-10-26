import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts') })
try {
  const m = await server.ssrLoadModule('/src/features/keyword-optimizer/inventoryModel.ts')
  let bad = 0
  const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { bad++; console.log('FAIL', n, 'got', JSON.stringify(g), 'want', JSON.stringify(w)) } }
  const M = 1_000_000
  const row = (make, model, available, days, price, margin, kw) => ({ make, model, available, avg_days_listed: days, avg_price_idr: price === null ? null : price * M, avg_margin_idr: margin === null ? null : margin * M, linked_keyword_count: kw })
  const rows = [
    row('Toyota', 'Fortuner', 3, 41, 385, 16, 4),
    row('Toyota', 'Innova Zenix', 3, 67, 395, 12, 0),
    row('Honda', 'Brio RS', 0, null, null, null, 2),
    row('Honda', 'HR-V', 4, 22, 310, 11, 3),
    row('Mitsubishi', 'Xpander', 5, 28, 245, 9.5, 3),
    row('Suzuki', 'Ertiga', 1, 95, 148, null, 0),
    row('Daihatsu', 'Ayla', 0, null, 90, 5, 0),
  ]
  const F = (over = {}) => ({ ...m.EMPTY_FILTERS, ...over })
  const ids = (rs) => rs.map((r) => `${r.make} ${r.model}`)
  // bands, including the edges
  eq('price bands', [149.999, 150, 249.9, 250, 399.9, 400, null].map((p) => m.priceBand(p === null ? null : p * M)), ['under150', '150-250', '150-250', '250-400', '250-400', 'over400', 'unknown'])
  eq('margin bands', [9.9, 10, 15, 15.1, null].map((x) => m.marginBand(x === null ? null : x * M)), ['under10', '10-15', '10-15', 'over15', 'unknown'])
  eq('days bands', [0, 30, 30.4, 31, 60, 61, 90, 91, null].map(m.daysBand), ['0-30', '0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '90+', 'unknown'])
  // each column filters
  eq('no filter = all', m.applyFilters(rows, F()).length, 7)
  eq('text search', ids(m.applyFilters(rows, F({ query: 'honda' }))), ['Honda Brio RS', 'Honda HR-V'])
  eq('text search words', ids(m.applyFilters(rows, F({ query: 'toyota zenix' }))), ['Toyota Innova Zenix'])
  eq('make chip', ids(m.applyFilters(rows, F({ make: 'Suzuki' }))), ['Suzuki Ertiga'])
  eq('in stock', m.applyFilters(rows, F({ stock: 'in' })).length, 5)
  eq('out of stock', ids(m.applyFilters(rows, F({ stock: 'out' }))), ['Honda Brio RS', 'Daihatsu Ayla'])
  eq('out of stock but advertised', ids(m.applyFilters(rows, F({ stock: 'out_advertised' }))), ['Honda Brio RS'])
  eq('days bucket', ids(m.applyFilters(rows, F({ days: '61-90' }))), ['Toyota Innova Zenix'])
  eq('days unknown', ids(m.applyFilters(rows, F({ days: 'unknown' }))), ['Honda Brio RS', 'Daihatsu Ayla'])
  eq('price band', ids(m.applyFilters(rows, F({ price: 'over400' }))), [])
  eq('price band 250-400', ids(m.applyFilters(rows, F({ price: '250-400' }))), ['Toyota Fortuner', 'Toyota Innova Zenix', 'Honda HR-V'])
  eq('price unknown', ids(m.applyFilters(rows, F({ price: 'unknown' }))), ['Honda Brio RS'])
  eq('margin under 10', ids(m.applyFilters(rows, F({ margin: 'under10' }))), ['Mitsubishi Xpander', 'Daihatsu Ayla'])
  eq('margin unknown', ids(m.applyFilters(rows, F({ margin: 'unknown' }))), ['Honda Brio RS', 'Suzuki Ertiga'])
  eq('advertised yes', m.applyFilters(rows, F({ ads: 'yes' })).length, 4)
  eq('advertised no', ids(m.applyFilters(rows, F({ ads: 'no' }))), ['Toyota Innova Zenix', 'Suzuki Ertiga', 'Daihatsu Ayla'])
  eq('filters combine (AND)', ids(m.applyFilters(rows, F({ make: 'Toyota', ads: 'no' }))), ['Toyota Innova Zenix'])
  eq('regex characters are plain text', m.applyFilters(rows, F({ query: '(.*)' })).length, 0)
  // facet counts: other filters applied, own filter ignored
  const mk = m.facetCounts(rows, F({ stock: 'in' }), 'make', m.makesOf(rows), (r) => r.make)
  eq('make counts respect the stock filter', mk, { Daihatsu: 0, Honda: 1, Mitsubishi: 1, Suzuki: 1, Toyota: 2 })
  const st = m.facetCounts(rows, F({ make: 'Honda' }), 'stock', ['all', 'in', 'out', 'out_advertised'], (r) => (r.available > 0 ? 'in' : r.linked_keyword_count > 0 ? 'out_advertised' : 'out'))
  eq('a facet ignores its own filter', st.in, 1)
  const dc = m.facetCounts(rows, F({ days: '0-30' }), 'days', ['0-30', '31-60', '61-90', '90+', 'unknown'], (r) => m.daysBand(r.avg_days_listed))
  eq('days counts ignore the days filter', dc, { '0-30': 2, '31-60': 1, '61-90': 1, '90+': 1, unknown: 2 })
  eq('makes sorted and unique', m.makesOf(rows), ['Daihatsu', 'Honda', 'Mitsubishi', 'Suzuki', 'Toyota'])
  eq('isFiltered', [m.isFiltered(F()), m.isFiltered(F({ query: ' ' })), m.isFiltered(F({ query: 'a' })), m.isFiltered(F({ ads: 'no' }))], [false, false, true, true])
  // sorting
  eq('sort model asc', ids(m.sortRows(rows, 'model', 'asc')).slice(0, 3), ['Daihatsu Ayla', 'Honda Brio RS', 'Honda HR-V'])
  eq('sort available desc', m.sortRows(rows, 'available', 'desc').map((r) => r.available), [5, 4, 3, 3, 1, 0, 0])
  eq('sort days asc puts nulls LAST', m.sortRows(rows, 'days', 'asc').map((r) => r.avg_days_listed), [22, 28, 41, 67, 95, null, null])
  eq('sort days desc still puts nulls LAST', m.sortRows(rows, 'days', 'desc').map((r) => r.avg_days_listed), [95, 67, 41, 28, 22, null, null])
  eq('sort margin desc', m.sortRows(rows, 'margin', 'desc').map((r) => r.avg_margin_idr === null ? null : r.avg_margin_idr / M), [16, 12, 11, 9.5, 5, null, null])
  eq('sort does not mutate', ids(rows)[0], 'Toyota Fortuner')
  eq('ties break by name', ids(m.sortRows(rows, 'available', 'asc')).slice(0, 2), ['Daihatsu Ayla', 'Honda Brio RS'])
  console.log(bad ? `${bad} FAILED` : 'INVENTORY MODEL CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
