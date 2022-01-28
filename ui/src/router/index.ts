import { createRouter, createWebHistory } from 'vue-router'
import SgroupView from '@/views/SgroupView.vue'
import WelcomeView from '@/views/WelcomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'welcome',
      component: WelcomeView
    },
    {
      path: '/sgroup',
      name: 'sgroup',
      component: SgroupView,
      props: route => ({ id: route.query.id, tabToDisplay: route.hash.match(/tabToDisplay=(\w+)/)?.[1] }),
    },
  ]
})

export default router
