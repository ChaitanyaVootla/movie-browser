<template>
    <div class="toolbar-container">
        <q-toolbar class="bg-white mobile-hide navbar">
            <q-toolbar-title>
                <RouterLink :to="{name: 'home'}">
                    Movie Browser
                </RouterLink>
            </q-toolbar-title>
            <q-tabs v-model="tab" shrink>
                <RouterLink :to="{name: 'browse'}">
                    <q-tab name="tab1" label="Browse" />
                </RouterLink>
                <q-tab name="tab2" label="Browse" />
            </q-tabs>
        </q-toolbar>
    </div>
    <RouterView class="app-container" />
</template>

<script lang="ts">
    import home from '@/views/home.vue'
    export default {
        components: {
            home,
        },
        data() {
            return {
            }
        },
        created() {
        }
    }
</script>

<style lang="scss">
@import "@/css/quasar.variables.sass";
body {
    padding: 0;
    top: 0;
}
.toolbar-container {
    border-bottom: 1px solid $grey-4;
    .navbar {
        padding: 0 2rem;
    }
    z-index: 1;
}
.app-container {
    overflow: hidden;
}
</style>
