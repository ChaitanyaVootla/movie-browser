<template>
    <div id="app" :class="isLightMode?'lightMode':''">
        <home/>
    </div>
</template>

<script lang="ts">
    // import { Component, Vue } from 'vue-property-decorator';
    // import Home from './components/Home.vue';
    import { store } from './store';

    // @Component({
    //     components: {
    //         Home,
    //     }
    // })
    export default {
        created() {
            store.dispatch('initFirebase');
        },
        computed: {
            isLightMode() {
                if (store.getters.isLightMode) {
                    const htmlTag = document.getElementsByTagName('html');
                    htmlTag[0].classList = ['lightMode'];
                }
                return store.getters.isLightMode;
            }
        },
    }
</script>

<style lang="less">
    @import'~bootstrap/dist/css/bootstrap.css';
    @import './Assets/Styles/main.less';

    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        background: #111;
        color: @text-color;
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
