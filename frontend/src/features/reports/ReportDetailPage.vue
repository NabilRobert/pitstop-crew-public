<script setup>
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../shared/utils/format'
import { api } from '../../shared/api/api'
import ReportColumns from '../../shared/report/ReportColumns.vue'
import ReportTabs from '../../shared/report/ReportTabs.vue'
import ReportDrawer from '../../shared/report/ReportDrawer.vue'
import AskPanel from '../../shared/report/AskPanel.vue'
import WhyTrailPanel from '../../shared/report/WhyTrailPanel.vue'
import { useReportDrawer } from '../../shared/report/useReportDrawer'

const props = defineProps({
  period: { type: String, required: true },
  id: { type: [String, Number], required: true },
})

const report = ref({ analysis: null, recommendation: null, summary: null })
const loading = ref(true)
const error = ref(null)

const VIEW_MODE_KEY = 'pitstop-report-view-mode'
const viewMode = ref(localStorage.getItem(VIEW_MODE_KEY) || 'columns')
watch(viewMode, (mode) => localStorage.setItem(VIEW_MODE_KEY, mode))

const { t } = useI18n()

const { activeDrawer, openDrawer, closeDrawer } = useReportDrawer()
const drawerTitle = () => (activeDrawer.value?.type === 'ask' ? t('askPanel.title') : t('reportSection.whyThis'))

async function load() {
  loading.value = true
  error.value = null
  try {
    report.value = await api.reportById(props.id)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch(() => props.id, load)
onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <router-link to="/reports" class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink">
      {{ t('reportDetail.back') }}
    </router-link>

    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('reportDetail.loading') }}</div>

    <div
      v-else-if="error"
      class="mt-6 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('reportDetail.couldNotLoad', { error }) }}
    </div>

    <template v-else>
      <div class="mb-6 mt-4 flex items-end justify-between">
        <div>
          <h1 class="font-display text-2xl font-bold capitalize text-ink">
            {{ period === 'weekly' ? t('reportDetail.weeklyTitle') : t('reportDetail.dailyTitle') }}
          </h1>
          <p class="mt-1 font-mono text-xs text-ink-faint">{{ formatDate(report.summary?.report_date) }}</p>
        </div>
        <div class="flex rounded-md border border-border bg-surface p-1">
          <button
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="viewMode === 'columns' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="viewMode = 'columns'"
          >
            {{ t('reportDetail.columnsView') }}
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="viewMode === 'tabs' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="viewMode = 'tabs'"
          >
            {{ t('reportDetail.tabsView') }}
          </button>
        </div>
      </div>

      <ReportColumns v-if="viewMode === 'columns'" :report="report" @ask="openDrawer('ask', $event)" @why-trail="openDrawer('why-trail', $event)" />
      <ReportTabs v-else :report="report" default-tab="analysis" @ask="openDrawer('ask', $event)" @why-trail="openDrawer('why-trail', $event)" />
    </template>

    <ReportDrawer :open="!!activeDrawer" :title="drawerTitle()" @close="closeDrawer">
      <WhyTrailPanel v-if="activeDrawer?.type === 'why-trail'" :key="activeDrawer.outputId" :output-id="activeDrawer.outputId" />
      <AskPanel v-else-if="activeDrawer?.type === 'ask'" :key="activeDrawer.outputId" :output-id="activeDrawer.outputId" />
    </ReportDrawer>
  </main>
</template>
