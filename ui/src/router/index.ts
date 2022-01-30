import { createRouter, createWebHistory } from 'vue-router'
import WelcomeView from '@/views/WelcomeView.vue'
import SgroupView from '@/views/SgroupView.vue'
import NewSgroupViewVue from '@/views/NewSgroupView.vue'

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
    {
      path: '/new_sgroup',
      name: 'new_sgroup',
      component: NewSgroupViewVue,
      props: route => ({ parent_id: route.query.parent_id, is_stem: route.query.is_stem }),
    },
  ]
})

export default router
