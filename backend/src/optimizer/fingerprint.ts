// A suggestion's identity across runs: a hash of its type and target, used
// to dedupe weekly runs and to keep a dismissed idea away (engine.ts guards).

import { createHash } from 'node:crypto'
import type { SuggestionType } from './types.js'

export function fingerprintOf(type: SuggestionType, target: string): string {
  return createHash('sha256').update(`${type}|${target}`).digest('hex').slice(0, 32)
}
