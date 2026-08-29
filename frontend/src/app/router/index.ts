import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '../../features/dashboard/DashboardPage.vue'
import CampaignDetailPage from '../../features/dashboard/CampaignDetailPage.vue'
import ReportsListPage from '../../features/reports/ReportsListPage.vue'
import ReportDetailPage from '../../features/reports/ReportDetailPage.vue'
import SystemHealthPage from '../../features/system-health/SystemHealthPage.vue'
import TimeMachinePage from '../../features/time-machine/TimeMachinePage.vue'
import SettingsPage from '../../features/settings/SettingsPage.vue'
import LearningPage from '../../features/learning/LearningPage.vue'
import HowItWorksPage from '../../features/how-it-works/HowItWorksPage.vue'
import ApiReferencePage from '../../features/api-reference/ApiReferencePage.vue'
import AskaPage from '../../features/aska/AskaPage.vue'

const routes = [
  { path: '/', name: 'dashboard', component: DashboardPage },
  { path: '/campaigns/:id', name: 'campaign-detail', component: CampaignDetailPage, props: true },
  { path: '/reports', name: 'reports', component: ReportsListPage },
  { path: '/reports/:period/:id', name: 'report-detail', component: ReportDetailPage, props: true },
  { path: '/system-health', name: 'system-health', component: SystemHealthPage },
  { path: '/time-machine', name: 'time-machine', component: TimeMachinePage },
  { path: '/settings', name: 'settings', component: SettingsPage },
  { path: '/learning', name: 'learning', component: LearningPage },
  { path: '/how-it-works', name: 'how-it-works', component: HowItWorksPage },
  { path: '/api-reference', name: 'api-reference', component: ApiReferencePage },
  { path: '/aska', name: 'aska', component: AskaPage },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
