// Look of each keyword verdict on the cork board. Notes are physical objects, so
// these paper and sticker colors are fixed brand-palette hex, NOT theme tokens:
// a note has to read the same on Ferrari's dark ground, Blueprint's light one and
// Atom-Eve's pink. Ink is always black on paper. Color is never the only cue:
// every sticker also prints its label.

import type { KeywordVerdict } from '../../shared/api/types'

export interface VerdictStyle {
  paper: string
  sticker: string
  stickerInk: string
}

export const VERDICT_STYLE: Record<KeywordVerdict, VerdictStyle> = {
  winner: { paper: '#d6f4fd', sticker: '#00bcf0', stickerInk: '#000000' },
  wasting: { paper: '#ffd5e4', sticker: '#ff6aa0', stickerInk: '#000000' },
  no_stock: { paper: '#f4c2c2', sticker: '#000000', stickerInk: '#ffffff' },
  testing: { paper: '#fff1a8', sticker: '#ffe556', stickerInk: '#000000' },
  needs_data: { paper: '#ffffff', sticker: '#ffffff', stickerInk: '#000000' },
  steady: { paper: '#ffffff', sticker: '#ffffff', stickerInk: '#000000' },
}

/** Verdicts that get a printed sticker. `steady` is healthy and deliberately quiet. */
export const STICKERED: KeywordVerdict[] = ['winner', 'wasting', 'no_stock', 'testing', 'needs_data']

export const LEGEND_ORDER: KeywordVerdict[] = ['winner', 'wasting', 'no_stock', 'testing', 'needs_data']

export const PAPER_FALLBACK = '#ffffff'
