import { createApp } from 'vue'
import './style.css'
import App from './app/App.vue'
import router from './app/router'
import { i18n } from './i18n/index.js'
import './shared/composables/theme.js'

createApp(App).use(router).use(i18n).mount('#app')
