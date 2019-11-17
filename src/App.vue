<template>
    <div id="app">
        <home/>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from 'vue-property-decorator';
    import Home from './components/Home.vue';

    @Component({
        components: {
            Home,
        }
    })
    export default class App extends Vue {}
</script>

<style>
    @import'~bootstrap/dist/css/bootstrap.css';
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        background: #111;
        color: #ddd;
    }
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #460303;
    }

    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #222;
        box-shadow: inset 0 0 5px #555;
        border-radius: 10px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background: #555;
        cursor: pointer;
    }
    .custom-control-input ~ .custom-control-label::before {
        color: #fff;
        border-color: #804545;
        background-color: #a08c8c;
        border-radius: 2px;
    }
    .custom-control-input:checked ~ .custom-control-label::before {
        color: #fff;
        border-color: #850909;
        background-color: #850909;
    }
</style>
