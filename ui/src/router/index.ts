import { createRouter, createWebHistory } from 'vue-router'
import WelcomeView from '@/views/WelcomeView.vue'
import SgroupView from '@/views/SgroupView.vue'
import NewSgroupView from '@/views/NewSgroupView.vue'
import SgroupHistoryView from '@/views/SgroupHistoryView.vue'

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
      component: NewSgroupView,
      props: route => ({ parent_id: route.query.parent_id, is_stem: route.query.is_stem }),
    },
    {
      path: '/sgroup_history',
      name: 'sgroup_history',
      component: SgroupHistoryView,
      props: route => ({ id: route.query.id }),
    },
    // must be kept in sync with isJsUiRoute in Rust code
  ]
})

export default router
