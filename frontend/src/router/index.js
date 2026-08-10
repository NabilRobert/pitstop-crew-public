import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '../pages/DashboardPage.vue'
import ReportsListPage from '../pages/ReportsListPage.vue'
import ReportDetailPage from '../pages/ReportDetailPage.vue'
import SystemHealthPage from '../pages/SystemHealthPage.vue'
import TimeMachinePage from '../pages/TimeMachinePage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import LearningPage from '../pages/LearningPage.vue'

const routes = [
  { path: '/', name: 'dashboard', component: DashboardPage },
  { path: '/reports', name: 'reports', component: ReportsListPage },
  { path: '/reports/:period/:date', name: 'report-detail', component: ReportDetailPage, props: true },
  { path: '/system-health', name: 'system-health', component: SystemHealthPage },
  { path: '/time-machine', name: 'time-machine', component: TimeMachinePage },
  { path: '/settings', name: 'settings', component: SettingsPage },
  { path: '/learning', name: 'learning', component: LearningPage },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
