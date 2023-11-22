<template>
    <div class="card">
        <NuxtImg :src="`https://image.tmdb.org/t/p/w300${item.poster_path}`" class="rounded-md"/>
        <div class="title overflow-ellipsis whitespace-nowrap overflow-hidden mt-1">
            {{ item.title || item.name }}
        </div>
    </div>
</template>

<script lang="ts">
    export default {
        name: "PosterCard",
        props: {
            item: {
                type: Object,
                required: true
            }
        }
    }
</script>

<style scoped lang="less">
.card {
    width: 13rem;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    img {
        width: 100%;
        height: 100%;
    }
}
</style>
