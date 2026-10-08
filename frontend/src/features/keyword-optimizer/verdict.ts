// Look of each keyword verdict on the cork board. Notes are physical objects, so
// they keep black ink on paper in every theme, but the paper and sticker colours come
// from the active theme's board palette (--kv-* in style.css): racing flags on Ferrari,
// blues and greys on Blueprint, the pop-art set on Atom-Eve. Color is never the only
// cue: every sticker also prints its label.

import type { KeywordVerdict } from '../../shared/api/types'

export interface VerdictStyle {
  paper: string
  sticker: string
  stickerInk: string
}

export const VERDICT_STYLE: Record<KeywordVerdict, VerdictStyle> = {
  winner: { paper: 'var(--kv-winner-paper)', sticker: 'var(--kv-winner-sticker)', stickerInk: 'var(--kv-winner-ink)' },
  wasting: { paper: 'var(--kv-wasting-paper)', sticker: 'var(--kv-wasting-sticker)', stickerInk: 'var(--kv-wasting-ink)' },
  no_stock: { paper: 'var(--kv-nostock-paper)', sticker: 'var(--kv-nostock-sticker)', stickerInk: 'var(--kv-nostock-ink)' },
  testing: { paper: 'var(--kv-testing-paper)', sticker: 'var(--kv-testing-sticker)', stickerInk: 'var(--kv-testing-ink)' },
  needs_data: { paper: '#ffffff', sticker: '#ffffff', stickerInk: '#000000' },
  steady: { paper: '#ffffff', sticker: '#ffffff', stickerInk: '#000000' },
}

/** Verdicts that get a printed sticker. `steady` is healthy and deliberately quiet. */
export const STICKERED: KeywordVerdict[] = ['winner', 'wasting', 'no_stock', 'testing', 'needs_data']

export const LEGEND_ORDER: KeywordVerdict[] = ['winner', 'wasting', 'no_stock', 'testing', 'needs_data']

export const PAPER_FALLBACK = '#ffffff'
