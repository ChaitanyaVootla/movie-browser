import Vue from 'vue';
import VueRouter from 'vue-router';
import App from './App.vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import _ from 'lodash';
import 'bootstrap';
import Home from './components/Home.vue';
import People from './components/Person/index.vue';
import Trending from './components/Trending/index.vue';
import Discover from './components/MovieDiscover/index.vue';
import Search from './components/Search/index.vue';
import MovieInfoFull from './components/Common/movieInfoFull.vue';
import SeriesInfo from './components/SeriesInfo/index.vue';
import VueLazyload from 'vue-lazyload'
import Element from 'element-ui';
import './Assets/Styles/element-ui.scss';
Vue.use(Element);

Object.defineProperty(Vue.prototype, '_', { value: _ });

library.add(fas);
library.add(fab);

Vue.component('font-awesome-icon', FontAwesomeIcon);
Vue.config.productionTip = true;
window.$ = require('jquery')

Vue.component('movieSlider', require('./components/MovieSlider').default);
Vue.component('seasonSlider', require('./components/SeasonSlider').default);
Vue.component('movieCard', require('./components/Common/movieCard.vue').default);
Vue.component('movieInfo', require('./components/Common/movieInfo.vue').default);
Vue.component('movieInfoFull', require('./components/Common/movieInfoFull.vue').default);
Vue.component('seriesInfo', require('./components/SeriesInfo').default);
Vue.component('personCard', require('./components/Common/personCard.vue').default);
Vue.component('episodeCard', require('./components/Common/episodeCard.vue').default);

Vue.component('movieDiscover', require('./components/MovieDiscover').default);
Vue.component('search', require('./components/Search').default);
Vue.component('personSlider', require('./components/PersonSlider/index.vue').default);

Vue.component('Home', require('./components/Home.vue').default);

const routes = [
    {
        path: '',
        component: Home,
        name: 'home',
        redirect: '/trending',
    },
    {
        path: '/trending',
        component: Trending,
        name: 'trending',
    },
    {
        path: '/discover',
        component: Discover,
        name: 'discover',
    },
    {
        path: '/search',
        component: Search,
        name: 'search',
    },
    {
        path: '/person/:name/:id',
        component: People,
        name: 'person'
    },
    {
        path: '/movie/:name/:id',
        component: MovieInfoFull,
        name: 'movieInfoFull'
    },
    {
        path: '/series/:name/:id',
        component: SeriesInfo,
        name: 'seriesInfo'
    },
];
Vue.use(VueLazyload);
const router = new VueRouter({
    mode: 'history',
    routes
});
Vue.use(VueRouter);
new Vue({
    render: h => h(App),
    router
}).$mount('#app');
