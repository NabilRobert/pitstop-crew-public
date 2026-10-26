// Runs every check in tests/ssr one after another and prints one line per check.
// Each check starts its own Vite server, renders the real components or composables with a mocked API and
// asserts on the result, so no browser or backend is needed. Usage: npm run test -w frontend  [name-filter]
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const filter = process.argv[2] ?? ''
const files = readdirSync(path.join(here, 'ssr')).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).sort()

let failed = 0
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(here, 'ssr', f), root], { encoding: 'utf8' })
  const lines = `${r.stdout}${r.stderr}`.trim().split('\n')
  const last = [...lines].reverse().find((l) => /PASSED|passed|FAILED|failed/.test(l)) ?? lines[lines.length - 1] ?? ''
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.replace('.test.mjs', '').padEnd(14)} ${last.slice(0, 90)}`)
  if (!ok) console.log(lines.slice(-12).map((l) => `      ${l}`).join('\n'))
}
console.log(failed ? `\n${failed} of ${files.length} checks failed` : `\nall ${files.length} checks passed`)
process.exit(failed ? 1 : 0)
