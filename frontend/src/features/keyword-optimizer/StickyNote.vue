<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Suggestion } from '../../shared/api/types'
import { formatMicrosAsIDR } from '../../shared/utils/format'
import type { BoardNote } from './boardModel'
import { tiltDegrees } from './boardModel'
import { tapeText } from './suggestionView'
import { PAPER_FALLBACK, STICKERED, VERDICT_STYLE } from './verdict'

const props = defineProps<{ note: BoardNote; canEdit: boolean }>()
const emit = defineEmits<{
  (e: 'open', note: BoardNote): void
  (e: 'openSuggestion', note: BoardNote, suggestion: Suggestion): void
}>()

const { t } = useI18n()

const style = computed(() => (props.note.verdict ? VERDICT_STYLE[props.note.verdict] : null))
const stickered = computed(() => !!props.note.verdict && STICKERED.includes(props.note.verdict))
const label = computed(() => t('keywordOptimizer.board.note.aria', {
  keyword: props.note.text,
  verdict: props.note.verdict ? t(`keywordOptimizer.board.verdict.${props.note.verdict}`) : t('keywordOptimizer.board.verdict.none'),
  spend: formatMicrosAsIDR(props.note.spendMicros),
  n: props.note.open.length,
}))

function dragStart(e: DragEvent, s: Suggestion) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('text/plain', String(s.id))
  e.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="note"
    :class="`note--${note.size}`"
    :style="{ '--tilt': `${tiltDegrees(note.keywordId)}deg`, '--paper': style?.paper ?? PAPER_FALLBACK }"
  >
    <span class="note__pin" aria-hidden="true" />
    <span
      v-if="stickered && style"
      class="note__sticker"
      :style="{ background: style.sticker, color: style.stickerInk }"
    >
      {{ t(`keywordOptimizer.board.verdict.${note.verdict}`) }}
    </span>

    <button type="button" class="note__body" :aria-label="label" @click="emit('open', note)">
      <span class="note__title">{{ note.text }}</span>
      <span class="note__numbers">
        {{ formatMicrosAsIDR(note.spendMicros) }}
        <template v-if="note.conversions > 0"> · {{ t('keywordOptimizer.board.note.leads', { n: Math.round(note.conversions) }, Math.round(note.conversions)) }}</template>
        <template v-else> · {{ t('keywordOptimizer.board.note.noLeads') }}</template>
      </span>
      <span v-if="note.summary?.stock_count === 0" class="note__flag">{{ t('keywordOptimizer.board.note.noCars') }}</span>
    </button>

    <!-- The advice: one plain sentence on a strip of tape. Draggable to a bin for owners; always clickable. -->
    <button
      v-for="s in note.open"
      :key="s.id"
      type="button"
      class="note__tape"
      :class="{ 'note__tape--draggable': canEdit }"
      :draggable="canEdit"
      :title="canEdit ? t('keywordOptimizer.board.tape.dragHint') : undefined"
      @dragstart="dragStart($event, s)"
      @click="emit('openSuggestion', note, s)"
    >
      <span class="note__tape-icon" aria-hidden="true">▸</span>{{ tapeText(s, t) }}
      <span v-if="s.basis === 'prior'" class="note__unverified">{{ t('keywordOptimizer.card.unverified') }}</span>
    </button>
  </div>
</template>

<style scoped>
/* A note is a physical object: fixed paper and black ink in every theme. */
.note {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 10px 10px;
  background: var(--paper);
  color: #000;
  border: 1.5px solid #000;
  transform: rotate(var(--tilt, 0deg));
  transition: transform 140ms ease-out;
  z-index: 0;
}
.note:hover,
.note:focus-within {
  transform: rotate(0deg) scale(1.04);
  z-index: 3;
}
@media (prefers-reduced-motion: reduce) {
  .note { transition: none; }
}
.note--S { width: 118px; font-size: 12px; }
.note--M { width: 156px; font-size: 13px; }
.note--L { width: 200px; font-size: 14px; }
.note__pin {
  position: absolute;
  top: -8px;
  left: 50%;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  border-radius: 9999px;
  background: #000;
  box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.35);
}
.note__sticker {
  position: absolute;
  top: 8px;
  right: -8px;
  padding: 1px 6px;
  border: 1px solid #000;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  transform: rotate(5deg);
}
.note__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0;
  text-align: left;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
}
.note__title { font-family: var(--font-display); font-weight: 700; line-height: 1.15; font-size: 1.15em; padding-right: 14px; }
.note--L .note__title { font-size: 1.3em; }
.note__numbers { font-size: 0.92em; line-height: 1.3; }
.note__flag { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.note__tape {
  display: block;
  padding: 3px 6px;
  text-align: left;
  font-size: 0.92em;
  line-height: 1.25;
  background: #ffe556;
  color: #000;
  border: 1px dashed #000;
  cursor: pointer;
}
.note__tape--draggable { cursor: grab; }
.note__tape--draggable:active { cursor: grabbing; }
.note__tape-icon { margin-right: 4px; }
.note__unverified { display: block; font-family: var(--font-mono); font-size: 9px; font-weight: 700; text-transform: uppercase; }
</style>
