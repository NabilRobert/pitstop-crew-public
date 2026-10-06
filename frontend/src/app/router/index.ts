import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '../../features/dashboard/DashboardPage.vue'
import CampaignsListPage from '../../features/dashboard/CampaignsListPage.vue'
import CampaignDetailPage from '../../features/dashboard/CampaignDetailPage.vue'
import KeywordOptimizerPage from '../../features/keyword-optimizer/KeywordOptimizerPage.vue'
import ReportsListPage from '../../features/reports/ReportsListPage.vue'
import ReportDetailPage from '../../features/reports/ReportDetailPage.vue'
import SystemHealthPage from '../../features/system-health/SystemHealthPage.vue'
import { isDemo } from '../../shared/composables/auth'
import RunInspectorPage from '../../features/run-inspector/RunInspectorPage.vue'
import TimeMachinePage from '../../features/time-machine/TimeMachinePage.vue'
import SettingsPage from '../../features/settings/SettingsPage.vue'
import LearningPage from '../../features/learning/LearningPage.vue'
import HowItWorksPage from '../../features/how-it-works/HowItWorksPage.vue'
import EngineeringNotesPage from '../../features/engineering-notes/EngineeringNotesPage.vue'
import ApiReferencePage from '../../features/api-reference/ApiReferencePage.vue'
import AskaPage from '../../features/aska/AskaPage.vue'

const routes = [
  { path: '/', name: 'dashboard', component: DashboardPage },
  { path: '/campaigns', name: 'campaigns', component: CampaignsListPage },
  { path: '/campaigns/:id', name: 'campaign-detail', component: CampaignDetailPage, props: true },
  { path: '/keyword-optimizer', name: 'keyword-optimizer', component: KeywordOptimizerPage },
  { path: '/reports', name: 'reports', component: ReportsListPage },
  { path: '/reports/:period/:id', name: 'report-detail', component: ReportDetailPage, props: true },
  { path: '/system-health', name: 'system-health', component: SystemHealthPage },
  { path: '/runs/:id', name: 'run-inspector', component: RunInspectorPage, props: true },
  { path: '/time-machine', name: 'time-machine', component: TimeMachinePage },
  { path: '/settings', name: 'settings', component: SettingsPage },
  { path: '/learning', name: 'learning', component: LearningPage },
  { path: '/how-it-works', name: 'how-it-works', component: HowItWorksPage },
  { path: '/engineering-notes', name: 'engineering-notes', component: EngineeringNotesPage },
  { path: '/api-reference', name: 'api-reference', component: ApiReferencePage },
  { path: '/aska', name: 'aska', component: AskaPage },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Pages that only make sense with write access (or show the owner's private
// chats). The API refuses a demo token on all of them anyway.
const DEMO_HIDDEN = ['/settings', '/aska', '/time-machine']
router.beforeEach((to) => {
  if (isDemo.value && DEMO_HIDDEN.some((p) => to.path.startsWith(p))) return '/'
})

export default router
