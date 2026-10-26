import { ref, onMounted } from 'vue'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import type { InventorySummary } from '../../shared/api/types'

export function useInventorySummary() {
  const inventory = ref<InventorySummary | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  onMounted(async () => {
    try {
      inventory.value = await keywordOptimizerApi.inventory()
    } catch (e) {
      // The inventory panel degrades on its own; it must never take the page down with it.
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return { inventory, loading, error }
}
