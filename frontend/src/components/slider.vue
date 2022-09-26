<template>
    <h5 class="heading">{{heading}}</h5>
    <div class="slider">
        <div v-for="item in items" class="slider-item">
            <router-link :to="{name: item.title?'movie':'series', params: {name: item.title || item.name, id: item.id}}">
                <img :src="`https://image.tmdb.org/t/p/w300${item.poster_path}`" />
                <div>{{item.title || item.name}}</div>
            </router-link>
        </div>
    </div>
</template>

<script lang="ts">
    export default {
        props: {
            items: Array,
            heading: String,
        },
    }
</script>

<style scoped lang="scss">
@import "@/css/quasar.variables.sass";
.heading {
    line-height: 2rem;
    margin: 0;
    font-weight: 500;
}
.slider {
    display: flex;
    overflow-x: auto;
    gap: 20px;
    padding: 1rem 0;
    .slider-item {
        cursor: pointer;
        &:hover {
            scale: 1.01;
        }
        img {
            height: 20rem;
            border-radius: 5px;
        }
    }
    &::-webkit-scrollbar {
        display: none;
    }
}
</style>