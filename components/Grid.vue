<template>
    <div>
        <div v-if="title" class="title text-2xl mb-5">
            {{ title }}
        </div>
        <div class="grid pb-3">
            <PosterCard v-for="item in items" :item="item" :addToFilter="addToFilter"/>
        </div>
    </div>
</template>

<script lang="ts">
export default {
    name: "Grid",
    props: {
        items: {
            type: Object,
            required: true
        },
        title: {
            type: String,
            required: true
        },
        addToFilter: {
            type: Function,
        }
    },
}
</script>

<style scoped lang="less">
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    grid-gap: 2rem;
}
@media screen and (max-width: 768px) {
    @image-mobile-width: 7rem;
    .grid {
        grid-template-columns: repeat(auto-fill, minmax(@image-mobile-width, 1fr));
        grid-gap: 2px;
    }
    :deep(.card) {
        width: 100%;
        .image {
            height: auto;
            width: 100%;
        }
    }
    
}
</style>
