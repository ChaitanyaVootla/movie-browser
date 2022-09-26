<template>
    <div class="grid-container">
        <div v-for="item in items">
            <card :item="item"/>
        </div>
    </div>
</template>

<script lang="ts">
import { configuration, movieGenresById, seriesGenreById } from '@/constants/tmdb'
import card from '@/components/card.vue'
export default {
    props: {
        items: Array,
    },
    components: {
        card,
    },
    data() {
        return {
            configuration,
        }
    }
}
</script>

<style scoped lang="scss">
.grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill,16em);
    gap: 1.5em;
    justify-content: space-between;
    padding: 1em;
    :deep(img) {
        height: 20rem;
        border-radius: 5px;
    }
}
</style>
