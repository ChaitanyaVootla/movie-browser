import Vue from 'vue';
import VueRouter from 'vue-router';
import App from './App.vue';
import VueLazyload from 'vue-lazyload';
import ElementUI from 'element-ui';
import { store } from './store';
import './Assets/Styles/element-ui.scss';

Vue.use(ElementUI);
(<any>window).$ = require('jquery');

Vue.component('mbSlider', require('./components/Slider').default);
Vue.component('movieCard', require('./components/Common/movieCard.vue').default);
Vue.component('movieInfoFull', require('./views/Movie.vue').default);
Vue.component('seriesInfo', require('./views/Series.vue').default);
Vue.component('personCard', require('./components/Common/personCard.vue').default);
Vue.component('episodeCard', require('./components/Common/episodeCard.vue').default);
Vue.component('popoverInfo', require('./components/Common/popoverInfo.vue').default);
Vue.component('continueWatching', require('./components/Common/continueWatching.vue').default);
Vue.component('wideCard', require('./components/Common/wideCard.vue').default);

Vue.component('discover', require('./views/Discover.vue').default);
Vue.component('WatchList', require('./views/WatchList.vue').default);
Vue.component('ShareView', require('./components/ShareView/index.vue').default);
Vue.component('person', require('./views/Person.vue').default);
Vue.component('searchResults', require('./components/SearchResults/index.vue').default);
Vue.component('trendingCarousel', require('./components/Common/trendingCarousel.vue').default);
Vue.component('searchGrid', require('./components/Common/searchGrid.vue').default);

Vue.component('Home', require('./views/Home.vue').default);

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
        path: '/interests',
        component: () => import(/* webpackChunkName: "profile" */ '@/components/Interests/index.vue'),
        name: 'Interests',
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
Vue.use(VueLazyload, {
    error: errorImage,
    attempt: 3,
});
const router = new VueRouter({
    mode: 'history',
    routes,
});
router.afterEach((to, from) => {
    if (to.name === 'movieInfoFull' || to.name === 'seriesInfo') {
        document.title = to.params.name.replace(/-/g, ' ');
    } else if (to.name === 'person') {
        document.title = to.params.name.replace(/-/g, ' ');
    } else {
        document.title = 'Movie Browser';
    }
});
Vue.use(VueRouter);
new Vue({
    render: (h) => h(App),
    router,
    store,
}).$mount('#app');

export { Vue };
