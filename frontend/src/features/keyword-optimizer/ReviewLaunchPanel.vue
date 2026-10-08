<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Launch, Suggestion } from '../../shared/api/types'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import { adsToLaunchWith, canCreateLaunch, confirmNameOf, confirmationMatches, countByKind, launchKind, plannedObjects } from './launchModel'
import { suggestionTitle } from './suggestionView'

// Review and create (contract 3.6). Shows exactly what a launch would create, always PAUSED, lets the owner run a
// validate-only check, and requires the exact name to be typed before Create is possible. In this version the
// "creation" is a SIMULATION in the demo data; nothing is ever sent to Google Ads, and the panel says so.
const props = defineProps<{
  suggestion: Suggestion
  /** Every suggestion loaded, to find the planned ads that go out with a campaign. */
  all: Suggestion[]
  canEdit: boolean
  /** The `ads_write_enabled` switch; null = unknown, treated as off. */
  writeEnabled: boolean | null
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>()
const { t } = useI18n()

const expected = computed(() => confirmNameOf(props.suggestion))
const kind = computed(() => launchKind(props.suggestion))
const ads = computed(() => (props.suggestion.payload.kind === 'new_campaign' ? adsToLaunchWith(props.all, props.suggestion.id) : []))
const objects = computed(() => plannedObjects(props.suggestion, ads.value))
const counts = computed(() => countByKind(objects.value))

const typed = ref('')
const validating = ref(false)
const creating = ref(false)
const validation = ref<Launch | null>(null)
const result = ref<Launch | null>(null)
const error = ref<string | null>(null)

const off = computed(() => props.writeEnabled !== true)
const canCreate = computed(() =>
  canCreateLaunch({
    canEdit: props.canEdit,
    writeEnabled: props.writeEnabled,
    launchable: kind.value !== null,
    alreadyCreated: !!result.value,
    creating: creating.value,
    typed: typed.value,
    expected: expected.value,
  })
)
const title = computed(() => suggestionTitle(props.suggestion, t as never))

async function run(validateOnly: boolean) {
  if (expected.value === null) return
  error.value = null
  if (validateOnly) validating.value = true
  else creating.value = true
  try {
    // A validate-only call does not need the owner's typing, but the server still wants the name: send the expected one.
    const res = await keywordOptimizerApi.launch({
      suggestion_id: props.suggestion.id,
      validate_only: validateOnly,
      confirm_name: validateOnly ? expected.value : typed.value,
    })
    if (validateOnly) validation.value = res
    else {
      result.value = res
      emit('done')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    validating.value = false
    creating.value = false
  }
}

const closeButton = ref<HTMLButtonElement | null>(null)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(async () => {
  document.addEventListener('keydown', onKey)
  await nextTick()
  closeButton.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-modal="true" :aria-label="t('keywordOptimizer.launch.title')">
      <header class="panel__head">
        <h2 class="panel__title">{{ t('keywordOptimizer.launch.title') }}</h2>
        <button ref="closeButton" type="button" class="panel__close" @click="emit('close')">{{ t('keywordOptimizer.board.drawer.close') }}</button>
      </header>

      <p class="banner banner--sim" role="note">{{ t('keywordOptimizer.launch.simulated') }}</p>
      <p class="mb-3 text-sm text-ink">{{ title }}</p>

      <p v-if="off" class="banner banner--off" role="status">
        {{ t('keywordOptimizer.launch.off') }}
        <router-link v-if="canEdit" to="/settings" class="font-bold underline">{{ t('keywordOptimizer.launch.offLink') }}</router-link>
      </p>
      <p v-if="!canEdit" class="mb-3 text-sm text-ink-soft">{{ t('keywordOptimizer.launch.viewOnly') }}</p>

      <section v-if="result" class="result" role="status">
        <div class="font-bold text-flag-good">{{ t('keywordOptimizer.launch.created') }}</div>
        <p v-for="m in result.messages" :key="m" class="mt-1 text-sm text-ink">{{ m }}</p>
        <router-link v-if="result.campaign" to="/campaigns" class="mt-2 inline-block font-mono text-[11px] font-bold uppercase text-link underline" @click="emit('close')">
          {{ t('keywordOptimizer.launch.openCampaigns') }}
        </router-link>
      </section>

      <template v-else>
        <h3 class="sub">{{ t('keywordOptimizer.launch.willCreate') }}</h3>
        <p class="mb-2 text-sm text-ink-soft">
          {{ t('keywordOptimizer.launch.counts', counts) }}
        </p>
        <ul class="objects">
          <li v-for="(o, i) in objects" :key="i">
            <span class="objects__kind">{{ t(`keywordOptimizer.launch.kinds.${o.kind}`) }}</span>
            <span class="objects__name">{{ o.name }}</span>
            <span v-if="o.detail" class="objects__detail">{{ o.detail }}</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-ink-faint">{{ t('keywordOptimizer.launch.pausedNote') }}</p>

        <div v-if="canEdit" class="mt-4">
          <button type="button" class="btn btn--ghost" :disabled="validating || kind === null" @click="run(true)">
            {{ validating ? t('keywordOptimizer.launch.validating') : t('keywordOptimizer.launch.validate') }}
          </button>
          <div v-if="validation" class="mt-2 text-sm text-ink" role="status">
            <div class="font-bold text-flag-good">{{ t('keywordOptimizer.launch.validated') }}</div>
            <p v-for="m in validation.messages" :key="m">{{ m }}</p>
          </div>
        </div>

        <div v-if="canEdit" class="mt-5 border-t border-border pt-4">
          <label class="mb-1 block font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint" for="launch-confirm">
            {{ t(kind === 'ad' ? 'keywordOptimizer.launch.confirmAd' : 'keywordOptimizer.launch.confirmCampaign') }}
          </label>
          <p class="mb-1 text-sm text-ink">
            <code class="bg-surface-raised px-1">{{ expected }}</code>
          </p>
          <input
            id="launch-confirm"
            v-model="typed"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="w-full max-w-md rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
          />
          <p v-if="typed !== '' && !confirmationMatches(typed, expected)" class="mt-1 text-xs text-flag-caution">{{ t('keywordOptimizer.launch.mismatch') }}</p>
          <button type="button" class="btn btn--solid mt-3" :disabled="!canCreate" @click="run(false)">
            {{ creating ? t('keywordOptimizer.launch.creating') : t('keywordOptimizer.launch.create') }}
          </button>
        </div>
      </template>

      <p v-if="error" class="mt-3 text-sm text-flag-critical" role="alert">{{ error }}</p>
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: flex-start; overflow-y: auto; padding: 24px 12px; }
.panel { width: min(100%, 40rem); padding: 18px; background: var(--color-bg); color: var(--color-ink); border: 2px solid var(--color-border-strong); }
.panel__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.panel__title { margin: 0; font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; }
.panel__close { padding: 6px 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--color-ink); background: var(--color-surface); border: 1.5px solid var(--color-border-strong); cursor: pointer; }
.banner { margin: 0 0 10px; padding: 8px 10px; font-size: 0.9rem; border: 1.5px solid #000; color: #000; }
.banner--sim { background: var(--kv-tape); font-weight: 700; }
.banner--off { background: var(--kv-warn); }
.sub { margin: 14px 0 4px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-ink-faint); }
.objects { margin: 0; padding: 0; list-style: none; max-height: 18rem; overflow-y: auto; border: 1.5px solid var(--color-border); background: var(--color-surface); }
.objects li { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 5px 10px; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
.objects li:last-child { border-bottom: 0; }
.objects__kind { min-width: 5.5rem; font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--color-ink-faint); }
.objects__name { font-weight: 600; }
.objects__detail { color: var(--color-ink-soft); }
.result { padding: 10px; background: var(--color-surface); border: 1.5px solid var(--color-border); }
.btn { padding: 8px 14px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; border: 1.5px solid var(--color-border-strong); }
.btn--solid { background: var(--color-rosso); color: var(--color-bianco); }
.btn--ghost { background: var(--color-surface); color: var(--color-ink); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
