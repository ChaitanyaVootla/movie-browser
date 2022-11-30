<template>
    <div id="app">
        <Home />
    </div>
</template>

<script lang="ts">
import { store } from './store';
import Home from '@/views/Home.vue';

export default {
    created() {
        store.dispatch('init');
    },
    components: {
        Home,
    },
    computed: {
        // isLightMode() {
        //     if (store.getters.isLightMode) {
        //         const htmlTag: any = document.getElementsByTagName('html');
        //         htmlTag[0].classList = ['lightMode'];
        //     }
        //     return store.getters.isLightMode;
        // },
    },
};
</script>

<style lang="less">
@import '~bootstrap/dist/css/bootstrap.css';
@import './Assets/Styles/main.less';
@import './Assets/Styles/element-custom.less';
:root {
    --el-color-primary: @link-color-red !important;
    --el-border-width: 1.5px !important;
    --el-border-color: #3f3f3f !important;
}
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
        'Helvetica Neue', sans-serif;
    background: #111;
    color: @text-color;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    text-shadow: rgba(0, 0, 0, 0.01) 0 0 1px;
}
@media (max-width: 767px) {
    body {
        padding-bottom: 0.5em;
    }
}
.lightMode {
    body {
        background: #eee;
    }
}
/* width */
::-webkit-scrollbar {
    width: 7px;
}

/* Track */
::-webkit-scrollbar-track {
    background: #0000008f;
}

/* Handle */
::-webkit-scrollbar-thumb {
    background: #222;
    box-shadow: inset 0 0 5px rgb(54, 54, 54);
    border-radius: 2px;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
    background: rgb(61, 61, 61);
    cursor: pointer;
}
.custom-control-input ~ .custom-control-label::before {
    color: @text-color;
    border-color: #804545;
    background-color: #a08c8c;
    border-radius: 2px;
}
.custom-control-input:checked ~ .custom-control-label::before {
    color: @text-color;
    border-color: #850909;
    background-color: #850909;
}
</style>
