<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { NewCampaignPayload, Suggestion } from '../../shared/api/types'
import { formatMicrosAsIDR } from '../../shared/utils/format'
import { adsOfProposal } from './boardModel'
import { openLaunch } from './useLaunchPanel'

// One lane of whole-campaign proposals (contract 3.3). 'proposed' = the AI suggested it and it is waiting
// for a decision; 'planned' = the owner approved it, but it is NOT in Google Ads yet. Cards are deliberately
// poster-like (a stamp, the ad groups and keywords written out) so they cannot be mistaken for the
// small notes on the keyword board or for campaigns that really exist.
const props = defineProps<{
  mode: 'proposed' | 'planned'
  items: Suggestion[]
  /** Every suggestion loaded, to find each proposal's ads. */
  all?: Suggestion[]
  canEdit: boolean
  busyIds: Set<number>
}>()
const emit = defineEmits<{
  (e: 'open', s: Suggestion): void
  (e: 'status', id: number, status: 'open' | 'applied' | 'dismissed' | 'planned'): void
}>()
const { t } = useI18n()

const payloadOf = (s: Suggestion) => s.payload as NewCampaignPayload
const adsOf = (s: Suggestion) => adsOfProposal(props.all ?? [], s.id)
/** Plain strings for one ad, so the template never has to narrow the payload union. */
function adInfo(a: Suggestion): { group: string; headline: string; description: string } {
  const p = a.payload
  if (p.kind !== 'new_ad') return { group: '', headline: '', description: '' }
  return {
    group: p.target.kind === 'proposed_campaign' ? p.target.ad_group_name : '',
    headline: p.headlines.slice(0, 3).map((h) => h.text).join(' | '),
    description: p.descriptions[0]?.text ?? '',
  }
}
const keywordCount = (p: NewCampaignPayload) => p.ad_groups.reduce((n, g) => n + g.keywords.length, 0)
</script>

<template>
  <section class="mb-8" :aria-label="t(`keywordOptimizer.lanes.${mode}.title`)">
    <h2 class="font-display text-lg font-bold text-ink">
      {{ t(`keywordOptimizer.lanes.${mode}.title`) }}
      <span class="ml-1 font-mono text-[11px] font-bold text-ink-faint">{{ items.length }}</span>
    </h2>
    <p class="mb-3 mt-1 max-w-3xl text-sm text-ink-soft">{{ t(`keywordOptimizer.lanes.${mode}.hint`) }}</p>

    <div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="s in items"
        :key="s.id"
        class="proposal"
        :class="mode === 'proposed' ? 'proposal--proposed' : 'proposal--planned'"
      >
        <span class="proposal__stamp">{{ t(`keywordOptimizer.lanes.${mode}.stamp`) }}</span>
        <h3 class="proposal__title">{{ payloadOf(s).name }}</h3>
        <p class="proposal__why">{{ t(`keywordOptimizer.proposal.basis.${payloadOf(s).basis}`) }}</p>
        <p class="proposal__facts">
          {{ t('keywordOptimizer.lanes.facts', {
            cars: payloadOf(s).stock.units,
            groups: payloadOf(s).ad_groups.length,
            keywords: keywordCount(payloadOf(s)),
            budget: formatMicrosAsIDR(payloadOf(s).budget.daily_micros),
          }) }}
        </p>
        <p v-if="s.basis === 'prior'" class="proposal__unverified">{{ t('keywordOptimizer.card.unverified') }}</p>

        <!-- The keywords it would use, written out: no clicking needed to see what it contains. -->
        <details class="proposal__details">
          <summary>{{ t('keywordOptimizer.lanes.showKeywords', { n: keywordCount(payloadOf(s)) }) }}</summary>
          <div v-for="g in payloadOf(s).ad_groups" :key="g.name" class="proposal__group">
            <div class="proposal__group-name">{{ g.name }}</div>
            <ul>
              <li v-for="k in g.keywords" :key="k.text + k.match_type">
                {{ k.text }}
                <span class="proposal__match">{{ t(`keywordOptimizer.match.${k.match_type}`) }}</span>
              </li>
            </ul>
          </div>
        </details>

        <!-- The ads written for it, one per ad group: the first headline and description of each. -->
        <details v-if="adsOf(s).length" class="proposal__details">
          <summary>{{ t('keywordOptimizer.lanes.showAds', { n: adsOf(s).length }) }}</summary>
          <div v-for="a in adsOf(s)" :key="a.id" class="proposal__group">
            <div class="proposal__group-name">{{ adInfo(a).group }}</div>
            <div>{{ adInfo(a).headline }}</div>
            <div class="proposal__match" style="text-transform: none; opacity: 1;">{{ adInfo(a).description }}</div>
          </div>
        </details>

        <div class="proposal__actions">
          <button type="button" class="btn btn--ghost" @click="emit('open', s)">{{ t('keywordOptimizer.lanes.details') }}</button>
          <template v-if="canEdit && mode === 'proposed'">
            <button type="button" class="btn btn--solid" :disabled="busyIds.has(s.id)" @click="emit('status', s.id, 'planned')">
              {{ t('keywordOptimizer.proposal.plan') }}
            </button>
            <button type="button" class="btn btn--ghost" :disabled="busyIds.has(s.id)" @click="emit('status', s.id, 'dismissed')">
              {{ t('keywordOptimizer.card.dismiss') }}
            </button>
          </template>
          <button v-if="mode === 'planned'" type="button" class="btn btn--solid" @click="openLaunch(s.id)">
            {{ t('keywordOptimizer.launch.reviewCreate') }}
          </button>
          <template v-if="canEdit && mode === 'planned'">
            <button type="button" class="btn btn--ghost" :disabled="busyIds.has(s.id)" @click="emit('status', s.id, 'applied')">
              {{ t('keywordOptimizer.proposal.iCreatedIt') }}
            </button>
          </template>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
/* Fixed paper and ink, like the notes on the board: a proposal must read the same in every theme. */
.proposal { position: relative; padding: 28px 16px 14px; color: #000; border: 2px solid #000; }
.proposal--proposed { background: #fff1a8; }
.proposal--planned { background: #ffffff; border-style: dashed; }
.proposal__stamp {
  position: absolute; top: -2px; left: -2px; padding: 2px 8px; background: #000; color: #fff;
  font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
}
.proposal__title { margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; line-height: 1.15; color: #000; }
.proposal__why { margin: 6px 0 0; font-size: 0.9rem; }
.proposal__facts { margin: 8px 0 0; font-size: 0.9rem; font-weight: 700; }
.proposal__unverified { margin: 4px 0 0; font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.proposal__details { margin-top: 10px; font-size: 0.85rem; }
.proposal__details summary { cursor: pointer; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; text-decoration: underline; }
.proposal__group { margin-top: 8px; padding: 6px 8px; background: rgba(255, 255, 255, 0.7); border: 1px solid #000; }
.proposal__group-name { font-weight: 700; }
.proposal__group ul { margin: 4px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.proposal__match { margin-left: 2px; font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; opacity: 0.7; }
.proposal__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.btn { padding: 6px 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; border: 1.5px solid #000; }
.btn--solid { background: #000; color: #fff; }
.btn--ghost { background: #fff; color: #000; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
