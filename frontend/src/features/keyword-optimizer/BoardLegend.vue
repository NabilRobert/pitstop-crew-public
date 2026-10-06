<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LEGEND_ORDER, VERDICT_STYLE } from './verdict'

const { t } = useI18n()
</script>

<template>
  <section class="legend" :aria-label="t('keywordOptimizer.board.legend.title')">
    <h3 class="legend__title">{{ t('keywordOptimizer.board.legend.title') }}</h3>
    <ul class="legend__list">
      <li class="legend__item">
        <span class="legend__size" aria-hidden="true"><i /><i /><i /></span>
        {{ t('keywordOptimizer.board.legend.size') }}
      </li>
      <li v-for="v in LEGEND_ORDER" :key="v" class="legend__item">
        <span
          class="legend__sticker"
          :style="{ background: VERDICT_STYLE[v].sticker, color: VERDICT_STYLE[v].stickerInk }"
        >{{ t(`keywordOptimizer.board.verdict.${v}`) }}</span>
        {{ t(`keywordOptimizer.board.legend.${v}`) }}
      </li>
      <li class="legend__item">
        <span class="legend__tape" aria-hidden="true">▸ …</span>
        {{ t('keywordOptimizer.board.legend.tape') }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.legend { background: #ffffff; color: #000; border: 1.5px solid #000; padding: 8px 12px; margin-bottom: 12px; }
.legend__title { margin: 0 0 4px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #000; }
.legend__list { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 0; list-style: none; font-size: 0.82rem; }
.legend__item { display: flex; align-items: center; gap: 6px; }
.legend__sticker { padding: 1px 6px; border: 1px solid #000; font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.legend__tape { padding: 1px 6px; background: #ffe556; border: 1px dashed #000; font-size: 11px; }
.legend__size { display: inline-flex; align-items: flex-end; gap: 2px; }
.legend__size i { display: block; width: 8px; background: #000; }
.legend__size i:nth-child(1) { height: 8px; }
.legend__size i:nth-child(2) { height: 12px; }
.legend__size i:nth-child(3) { height: 16px; }
</style>
