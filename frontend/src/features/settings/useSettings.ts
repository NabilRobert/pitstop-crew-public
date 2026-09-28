import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'

export function useSettings() {
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const saved = ref(false)

  const dailyRunTime = ref('06:00')
  const weeklyRunTime = ref('06:00')
  const reportRecipientEmail = ref('')
  const reportLanguage = ref('en')
  const autoReportsEnabled = ref(true)

  onMounted(async () => {
    try {
      const settings = await api.settings()
      dailyRunTime.value = settings.daily_run_time
      weeklyRunTime.value = settings.weekly_run_time
      reportRecipientEmail.value = settings.report_recipient_email
      reportLanguage.value = settings.report_language
      autoReportsEnabled.value = settings.auto_reports_enabled === 'true'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  async function save() {
    saving.value = true
    error.value = null
    saved.value = false
    try {
      const settings = await api.updateSettings({
        daily_run_time: dailyRunTime.value,
        weekly_run_time: weeklyRunTime.value,
        report_recipient_email: reportRecipientEmail.value.trim(),
        report_language: reportLanguage.value,
        auto_reports_enabled: String(autoReportsEnabled.value),
      })
      dailyRunTime.value = settings.daily_run_time
      weeklyRunTime.value = settings.weekly_run_time
      reportRecipientEmail.value = settings.report_recipient_email
      reportLanguage.value = settings.report_language
      autoReportsEnabled.value = settings.auto_reports_enabled === 'true'
      saved.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    error,
    saved,
    dailyRunTime,
    weeklyRunTime,
    reportRecipientEmail,
    reportLanguage,
    autoReportsEnabled,
    save,
  }
}
