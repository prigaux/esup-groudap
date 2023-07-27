import { createRouter, createWebHistory } from 'vue-router'
import WelcomeView from '@/views/WelcomeView.vue'
import SgroupViewVue, * as SgroupView from '@/views/SgroupView.vue'
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
      component: SgroupViewVue,
      props: route => ({ ...route.meta, tabToDisplay: route.hash.match(/tabToDisplay=(\w+)/)?.[1] }),
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
      props: route => ({ id: route.query.id, show_sync: route.query.show_sync === 'true' }),
    },
    // must be kept in sync with isJsUiRoute in Rust code
  ]
})

router.beforeEach(async (to) => { 
    if (to.path === '/sgroup') {
        to.meta = await SgroupView.computedProps(to)
    }
    return true
})

export default router
