import Vue, { createApp } from 'vue';
import * as VueRouter from 'vue-router';
import App from './App.vue';
import VueLazyload from 'vue-lazyload';
import ElementPlus from 'element-plus';
import { store } from './store';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css'

const VueApp = createApp(App);
VueApp.use(store);
VueApp.use(ElementPlus, { zIndex: 3000 });
import jquery from 'jquery';
(<any>window).$ = jquery;

// VueApp.component('mbSlider', require('./components/Slider').default);
// VueApp.component('movieCard', require('./components/Common/movieCard.vue').default);
// VueApp.component('movieInfoFull', require('./views/Movie.vue').default);
// VueApp.component('seriesInfo', require('./views/Series.vue').default);
// VueApp.component('personCard', require('./components/Common/personCard.vue').default);
// VueApp.component('episodeCard', require('./components/Common/episodeCard.vue').default);
// VueApp.component('popoverInfo', require('./components/Common/popoverInfo.vue').default);
// VueApp.component('continueWatching', require('./components/Common/continueWatching.vue').default);
// VueApp.component('wideCard', require('./components/Common/wideCard.vue').default);

// VueApp.component('discover', require('./views/Discover.vue').default);
// VueApp.component('WatchList', require('./views/WatchList.vue').default);
// VueApp.component('ShareView', require('./components/ShareView/index.vue').default);
// VueApp.component('person', require('./views/Person.vue').default);
// VueApp.component('trendingCarousel', require('./components/Common/trendingCarousel.vue').default);
// VueApp.component('searchGrid', require('./components/Common/searchGrid.vue').default);

// VueApp.component('Home', require('./views/Home.vue').default);

const routes = [
    {
        path: '',
        component: () => import(/* webpackChunkName: "landing" */ '@/views/Home.vue'),
        name: 'home',
        redirect: { name: 'trending' },
    },
    {
        path: '/',
        component: () => import(/* webpackChunkName: "landing" */ '@/components/Trending/index.vue'),
        name: 'trending',
    },
    {
        path: '/discover',
        component: () => import(/* webpackChunkName: "discover" */ '@/views/Discover.vue'),
        name: 'discover',
    },
    {
        path: '/friends',
        component: () => import('@/components/Friends/index.vue'),
        name: 'Friends',
    },
    {
        path: '/person/:name/:id',
        component: () => import('@/views/Person.vue'),
        name: 'person',
    },
    {
        path: '/movie/:name/:id',
        component: () => import(/* webpackChunkName: "movie" */ '@/views/Movie.vue'),
        name: 'movieInfoFull',
    },
    {
        path: '/series/:name/:id',
        component: () => import(/* webpackChunkName: "series" */ '@/views/Series.vue'),
        name: 'seriesInfo',
    },
    {
        path: '/watchList',
        component: () => import(/* webpackChunkName: "watchList" */ '@/views/WatchList.vue'),
        name: 'WatchList',
    },
    {
        path: '/shareView/:userID',
        component: () => import('@/components/ShareView/index.vue'),
        name: 'ShareView',
    },
    {
        path: '/profile',
        component: () => import(/* webpackChunkName: "profile" */ '@/views/Profile.vue'),
        name: 'Profile',
    },
    {
        path: '/sandbox',
        component: () => import('@/components/Sandbox/index.vue'),
        name: 'Sandbox',
    },
    {
        path: '/admin',
        component: () => import(/* webpackChunkName: "admin" */ '@/views/Admin.vue'),
        name: 'admin',
    },
];
import errorImage from '@/Assets/Images/error.svg';
VueApp.use(VueLazyload, {
    error: errorImage,
    attempt: 3,
});
const router = VueRouter.createRouter({
    history: VueRouter.createWebHistory(),
    routes: routes as unknown as VueRouter.RouteRecordRaw[],
});
router.afterEach((to, from) => {
    if (to.name === 'movieInfoFull' || to.name === 'seriesInfo') {
        document.title = (to.params.name as string).replace(/-/g, ' ');
    } else if (to.name === 'person') {
        document.title = (to.params.name as string).replace(/-/g, ' ');
    } else {
        document.title = 'Movie Browser';
    }
});
VueApp.use(router);
VueApp.mount('#app')

export { VueApp as Vue };
