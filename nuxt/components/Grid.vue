<template>
    <div>
        <div class="title text-2xl mb-5">
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
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    grid-gap: 2rem;
}
</style>
