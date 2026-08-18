import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'

export function useSettings() {
  const loading = ref(true)
  const saving = ref(false)
  const error = ref(null)
  const saved = ref(false)

  const dailyRunTime = ref('06:00')
  const weeklyRunTime = ref('06:00')
  const gradeForcesRevision = ref(false)
  const reportRecipientEmail = ref('')
  const reportLanguage = ref('en')

  onMounted(async () => {
    try {
      const settings = await api.settings()
      dailyRunTime.value = settings.daily_run_time
      weeklyRunTime.value = settings.weekly_run_time
      gradeForcesRevision.value = settings.grade_forces_revision === 'true'
      reportRecipientEmail.value = settings.report_recipient_email
      reportLanguage.value = settings.report_language
    } catch (e) {
      error.value = e.message
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
        grade_forces_revision: String(gradeForcesRevision.value),
        report_recipient_email: reportRecipientEmail.value.trim(),
        report_language: reportLanguage.value,
      })
      dailyRunTime.value = settings.daily_run_time
      weeklyRunTime.value = settings.weekly_run_time
      gradeForcesRevision.value = settings.grade_forces_revision === 'true'
      reportRecipientEmail.value = settings.report_recipient_email
      reportLanguage.value = settings.report_language
      saved.value = true
    } catch (e) {
      error.value = e.message
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
    gradeForcesRevision,
    reportRecipientEmail,
    reportLanguage,
    save,
  }
}
