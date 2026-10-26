import { ref } from 'vue'

// One shared "which planned suggestion is being reviewed for launch" value, so any card, poster or panel can open
// the Review and create panel with a single call, without every parent passing handlers down. The pages that can
// show the panel mount one LaunchHost; it reads this.
export const launchTargetId = ref<number | null>(null)

export function openLaunch(suggestionId: number): void {
  launchTargetId.value = suggestionId
}
export function closeLaunch(): void {
  launchTargetId.value = null
}
