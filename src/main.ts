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
import People from './components/People/index.vue';
import Trending from './components/Trending/index.vue';
import Discover from './components/MovieDiscover/index.vue';
import VueLazyload from 'vue-lazyload'

Object.defineProperty(Vue.prototype, '_', { value: _ });

library.add(fas);
library.add(fab);

Vue.component('font-awesome-icon', FontAwesomeIcon);
Vue.config.productionTip = true;
window.$ = require('jquery')

Vue.component('movieSlider', require('./components/MovieSlider').default);
Vue.component('movieCard', require('./components/MovieSlider/movieCard.vue').default);
Vue.component('movieInfo', require('./components/MovieSlider/movieInfo.vue').default);

Vue.component('movieDiscover', require('./components/MovieDiscover').default);

Vue.component('Home', require('./components/Home.vue').default);

const routes = [
    {
        path: '',
        component: Home,
        name: 'home',
        redirect: '/trending',
        children: [
            {
                path: '/people',
                component: People,
                name: 'people'
            }
        ]
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
