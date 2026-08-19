import { ref, watch } from 'vue'

// Shared singleton (not per-component state) so pages like ReportsListPage
// can open the console panel programmatically — ConsolePanel lives in
// App.vue, outside the router-view, so a local ref there isn't reachable
// from a routed page without this.
const OPEN_KEY = 'pitstop-console-open'
export const consoleOpen = ref(localStorage.getItem(OPEN_KEY) === 'true')
watch(consoleOpen, (v) => localStorage.setItem(OPEN_KEY, String(v)))
