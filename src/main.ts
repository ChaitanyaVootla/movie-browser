import Vue from 'vue';
import VueRouter from 'vue-router';
import App from './App.vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import _ from 'lodash';
import VueLazyload from 'vue-lazyload';
import Element from 'element-ui';
import './Assets/Styles/element-ui.scss';
import { store } from './store';

Vue.use(Element);

Object.defineProperty(Vue.prototype, '_', { value: _ });

library.add(fas);
library.add(fab);
library.add(far);

Vue.component('font-awesome-icon', FontAwesomeIcon);
Vue.config.productionTip = true;
(<any>window).$ = require('jquery');

Vue.component('mbSlider', require('./components/Slider').default);
Vue.component('movieCard', require('./components/Common/movieCard.vue').default);
Vue.component('movieInfoFull', require('./components/MovieInfo/index.vue').default);
Vue.component('seriesInfo', require('./components/SeriesInfo').default);
Vue.component('personCard', require('./components/Common/personCard.vue').default);
Vue.component('episodeCard', require('./components/Common/episodeCard.vue').default);
Vue.component('popoverInfo', require('./components/Common/popoverInfo.vue').default);
Vue.component('continueWatching', require('./components/Common/continueWatching.vue').default);
Vue.component('wideCard', require('./components/Common/wideCard.vue').default);

Vue.component('discover', require('./components/Discover').default);
Vue.component('WatchList', require('./components/WatchList/index.vue').default);
Vue.component('ShareView', require('./components/ShareView/index.vue').default);
Vue.component('person', require('./components/Person/index.vue').default);
Vue.component('searchResults', require('./components/SearchResults/index.vue').default);
Vue.component('trendingCarousel', require('./components/Common/trendingCarousel.vue').default);

Vue.component('Home', require('./components/Home.vue').default);

const routes = [
    {
        path: '',
        component: () => import(/* webpackChunkName: "landing" */'@/components/Home.vue'),
        name: 'home',
        redirect: { name: 'trending' },
    },
    {
        path: '/',
        component: () => import(/* webpackChunkName: "landing" */'@/components/Trending/index.vue'),
        name: 'trending',
    },
    {
        path: '/discover',
        component: () => import(/* webpackChunkName: "discover" */'@/components/Discover/index.vue'),
        name: 'discover',
    },
    {
        path: '/friends',
        component: () => import('@/components/Friends/index.vue'),
        name: 'Friends',
    },
    {
        path: '/person/:name/:id',
        component: () => import('@/components/Person/index.vue'),
        name: 'person',
    },
    {
        path: '/movie/:name/:id',
        component: () => import(/* webpackChunkName: "movie" */'@/components/MovieInfo/index.vue'),
        name: 'movieInfoFull',
    },
    {
        path: '/series/:name/:id',
        component: () => import(/* webpackChunkName: "series" */'@/components/SeriesInfo/index.vue'),
        name: 'seriesInfo',
    },
    {
        path: '/watchList',
        component: () => import(/* webpackChunkName: "watchList" */'@/components/WatchList/index.vue'),
        name: 'WatchList',
    },
    {
        path: '/shareView/:userID',
        component: () => import('@/components/ShareView/index.vue'),
        name: 'ShareView',
    },
    {
        path: '/interests',
        component: () => import(/* webpackChunkName: "profile" */'@/components/Interests/index.vue'),
        name: 'Interests',
    },
    {
        path: '/sandbox',
        component: () => import('@/components/Sandbox/index.vue'),
        name: 'Sandbox',
    },
    {
        path: '/admin',
        component: () => import(/* webpackChunkName: "admin" */'@/components/Admin/index.vue'),
        name: 'admin',
    },
];
import errorImage from '@/Assets/Images/error.svg';
Vue.use(VueLazyload, {
    error: errorImage,
    attempt: 3
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
