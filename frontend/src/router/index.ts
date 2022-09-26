import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/home.vue'
import MovieView from '@/views/movie.vue'
import SeriesView from '@/views/series.vue'
import BrowseView from '@/views/browse.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/movie/:name/:id',
      name: 'movie',
      component: MovieView
    },
    {
      path: '/series/:name/:id',
      name: 'series',
      component: SeriesView
    },
    {
      path: '/browse',
      name: 'browse',
      component: BrowseView
    },
  ]
})

export default router
