<template>
    <grid :items="items"></grid>
</template>

<script lang="ts">
import api from '@/api';
import grid from '@/components/grid.vue';
    export default {
        components: {
            grid,
        },
        data() {
            return {
                items: [],
            }
        },
        created() {
            this.init();
        },
        methods: {
            async init() {
                const items = [];
                for (let i = 1; i < 25; i++) {
                    items.push(...(await api.getDiscoverMovies(`page=${i}`)))
                }
                this.items = items;
            },
        }
    }
</script>

<style scoped lang="scss">

</style>
    