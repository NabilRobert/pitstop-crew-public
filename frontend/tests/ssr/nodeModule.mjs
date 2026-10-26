// The checks import Vue and vue-router by file path, so they share the exact copy Vite
// externalises. With npm workspaces (`npm install` at the repo root, as the README says)
// those packages are hoisted to the root's node_modules; with a standalone install of
// frontend/ they live in frontend/node_modules. Look in both, nearest first.
import { existsSync } from 'node:fs'
import path from 'node:path'

export function nodeModule(root, rel) {
  for (const dir of [path.join(root, 'node_modules'), path.join(root, '..', 'node_modules')]) {
    const p = path.join(dir, rel)
    if (existsSync(p)) return p
  }
  throw new Error(`${rel} not found in ${root}/node_modules or ${path.dirname(root)}/node_modules`)
}
