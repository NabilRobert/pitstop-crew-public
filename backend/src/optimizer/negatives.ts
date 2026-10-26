// Negative-keyword matching and the collision check
// (docs/overhaul-v3-backend.md section 11.1, guards). Pure.
//
// Google's negative matching, which differs from positive matching:
// negatives never expand to close variants.
// - exact:  the query is exactly the negative's words, in order;
// - phrase: the query contains the negative's words, in order, adjacent;
// - broad:  the query contains every one of the negative's words, any order.
// Both sides are compared after normalizeTerm, so case and punctuation
// don't matter.

import { normalizeTerm } from './intent.js'
import type { Intent, MatchType } from './types.js'

export interface NegativeSpec {
  text: string
  matchType: MatchType
}

/** True when the negative would stop the query from triggering an ad. */
export function negativeBlocks(negative: NegativeSpec, query: string): boolean {
  const neg = normalizeTerm(negative.text)
  const q = normalizeTerm(query)
  if (neg === '' || q === '') return false
  if (negative.matchType === 'exact') return neg === q
  if (negative.matchType === 'phrase') return ` ${q} `.includes(` ${neg} `)
  const words = new Set(q.split(' '))
  return neg.split(' ').every((w) => words.has(w))
}

export interface ConvertingTerm {
  text: string
  conversions: number
  intent: Intent | null // null = not classified yet
}

export interface CollisionCheck {
  // Converting buyer-intent terms the negative would block. Any of these
  // means the negative must not be suggested.
  blockedBuyers: { search_term: string; conversions: number }[]
  // Every converting term it would block (buyer or not), for the payload.
  collisions: { search_term: string; conversions: number }[]
}

/** Checks a proposed negative against the converting terms in its scope.
 * A term with no intent yet counts as a buyer: an unclassified converter
 * is not something to block on a guess. */
export function checkCollisions(negative: NegativeSpec, terms: readonly ConvertingTerm[]): CollisionCheck {
  const collisions: CollisionCheck['collisions'] = []
  const blockedBuyers: CollisionCheck['blockedBuyers'] = []
  for (const t of terms) {
    if (t.conversions <= 0 || !negativeBlocks(negative, t.text)) continue
    const row = { search_term: t.text, conversions: Math.round(t.conversions * 100) / 100 }
    collisions.push(row)
    if (t.intent === null || t.intent === 'buyer' || t.intent === 'unknown') blockedBuyers.push(row)
  }
  return { blockedBuyers, collisions }
}

// Standard junk for a used-car dealer, suggested as `prior` (unverified)
// negatives when the account has no such negative yet: one representative
// per category in the intent rules (job, free, student, new car, repair,
// parts). STARTING DEFAULT. Deliberately not "cara" (how-to): "cara kredit
// mobil bekas" is a buyer.
export interface JunkNegative {
  id: string
  text: string
  matchType: MatchType
  category: 'job' | 'free' | 'student' | 'new_car' | 'repair' | 'parts'
}

export const JUNK_NEGATIVES: readonly JunkNegative[] = [
  { id: 'junk.job.lowongan', text: 'lowongan', matchType: 'broad', category: 'job' },
  { id: 'junk.free.gratis', text: 'gratis', matchType: 'broad', category: 'free' },
  { id: 'junk.student.skripsi', text: 'skripsi', matchType: 'broad', category: 'student' },
  { id: 'junk.new_car.mobil_baru', text: 'mobil baru', matchType: 'phrase', category: 'new_car' },
  { id: 'junk.repair.bengkel', text: 'bengkel', matchType: 'broad', category: 'repair' },
  { id: 'junk.parts.sparepart', text: 'sparepart', matchType: 'broad', category: 'parts' },
]
