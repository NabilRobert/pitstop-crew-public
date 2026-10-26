<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Suggestion } from '../../shared/api/types'
import type { BoardNote } from './boardModel'
import StickyNote from './StickyNote.vue'
import { tapeText } from './suggestionView'

defineProps<{
  notes: BoardNote[]
  hidden: number
  ideas: Suggestion[]
  canEdit: boolean
  appliedCount: number
  dismissedCount: number
}>()
const emit = defineEmits<{
  (e: 'open', note: BoardNote): void
  (e: 'openSuggestion', note: BoardNote, suggestion: Suggestion): void
  (e: 'openIdea', suggestion: Suggestion): void
  (e: 'drop', id: number, status: 'applied' | 'dismissed'): void
  (e: 'showAll'): void
}>()

const { t } = useI18n()
const overBin = ref<'applied' | 'dismissed' | null>(null)

function dragStartIdea(e: DragEvent, s: Suggestion) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('text/plain', String(s.id))
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e: DragEvent, bin: 'applied' | 'dismissed') {
  e.preventDefault() // allows the drop
  overBin.value = bin
}
function onDrop(e: DragEvent, bin: 'applied' | 'dismissed') {
  e.preventDefault()
  overBin.value = null
  const id = Number(e.dataTransfer?.getData('text/plain'))
  if (Number.isInteger(id) && id > 0) emit('drop', id, bin)
}
</script>

<template>
  <div class="board-wrap">
    <div class="cork-board board" :aria-label="t('keywordOptimizer.board.aria')">
      <p v-if="notes.length === 0" class="board__empty">{{ t('keywordOptimizer.board.empty') }}</p>
      <StickyNote
        v-for="n in notes"
        :key="n.keywordId"
        :note="n"
        :can-edit="canEdit"
        @open="emit('open', $event)"
        @open-suggestion="(note, s) => emit('openSuggestion', note, s)"
      />

      <button v-if="hidden > 0" type="button" class="board__more" @click="emit('showAll')">
        {{ t('keywordOptimizer.board.showAll', { n: hidden }) }}
      </button>
    </div>

    <aside class="side">
      <!-- Suggestions that belong to no single keyword. -->
      <section v-if="ideas.length" class="tray" :aria-label="t('keywordOptimizer.board.ideas.title')">
        <h3 class="tray__title">{{ t('keywordOptimizer.board.ideas.title') }}</h3>
        <p class="tray__hint">{{ t('keywordOptimizer.board.ideas.hint') }}</p>
        <button
          v-for="s in ideas"
          :key="s.id"
          type="button"
          class="idea"
          :draggable="canEdit"
          @dragstart="dragStartIdea($event, s)"
          @click="emit('openIdea', s)"
        >
          <span class="idea__type">{{ t(`keywordOptimizer.types.${s.type}`) }}</span>
          {{ tapeText(s, t) }}
          <span v-if="s.basis === 'prior'" class="idea__unverified">{{ t('keywordOptimizer.card.unverified') }}</span>
        </button>
      </section>

      <section class="bins" :aria-label="t('keywordOptimizer.board.bins.title')">
        <div
          class="bin bin--done"
          :class="{ 'bin--over': overBin === 'applied' }"
          @dragover="canEdit && onDragOver($event, 'applied')"
          @dragleave="overBin = null"
          @drop="canEdit && onDrop($event, 'applied')"
        >
          <div class="bin__title">{{ t('keywordOptimizer.board.bins.done') }} <span class="bin__count">{{ appliedCount }}</span></div>
          <div class="bin__hint">{{ canEdit ? t('keywordOptimizer.board.bins.doneHint') : t('keywordOptimizer.board.bins.readOnly') }}</div>
        </div>
        <div
          class="bin bin--no"
          :class="{ 'bin--over': overBin === 'dismissed' }"
          @dragover="canEdit && onDragOver($event, 'dismissed')"
          @dragleave="overBin = null"
          @drop="canEdit && onDrop($event, 'dismissed')"
        >
          <div class="bin__title">{{ t('keywordOptimizer.board.bins.notNow') }} <span class="bin__count">{{ dismissedCount }}</span></div>
          <div class="bin__hint">{{ canEdit ? t('keywordOptimizer.board.bins.notNowHint') : t('keywordOptimizer.board.bins.readOnly') }}</div>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.board-wrap { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.board { flex: 1 1 420px; min-height: 280px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 26px 20px; padding: 26px 22px 28px; }
.board__empty { margin: 0; padding: 20px; background: #fff; color: #000; border: 1.5px solid #000; font-size: 0.95rem; }
.board__more { align-self: center; padding: 8px 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; color: #000; background: #fff; border: 1.5px dashed #000; cursor: pointer; }
.side { flex: 0 1 220px; display: flex; flex-direction: column; gap: 12px; min-width: 200px; }
.tray { background: #ffffff; color: #000; border: 1.5px solid #000; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.tray__title { margin: 0; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #000; }
.tray__hint { margin: 0; font-size: 0.78rem; }
.idea { text-align: left; padding: 6px 8px; font-size: 0.85rem; line-height: 1.3; color: #000; background: var(--kv-poster); border: 1px dashed #000; cursor: pointer; }
.idea[draggable='true'] { cursor: grab; }
.idea__type { display: block; font-family: var(--font-mono); font-size: 9px; font-weight: 700; text-transform: uppercase; }
.idea__unverified { display: block; font-family: var(--font-mono); font-size: 9px; font-weight: 700; text-transform: uppercase; }
.bins { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; }
.bin { flex: 1 1 140px; min-height: 84px; padding: 8px 10px; color: #000; border: 2px dashed #000; transition: transform 100ms ease-out; }
.bin--done { background: var(--kv-good); }
.bin--no { background: var(--kv-warn); }
.bin--over { transform: scale(1.04); border-style: solid; }
.bin__title { font-family: var(--font-mono); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.bin__count { margin-left: 4px; padding: 0 5px; background: #000; color: #fff; }
.bin__hint { margin-top: 2px; font-size: 0.78rem; line-height: 1.3; }
@media (prefers-reduced-motion: reduce) { .bin { transition: none; } }
</style>
