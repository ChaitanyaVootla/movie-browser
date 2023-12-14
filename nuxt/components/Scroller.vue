<template>
    <div>
        <div class="title text-2xl mb-5">
            {{ title }}
        </div>
        <div class="scroller scroll pb-3">
            <PosterCard v-for="item in items" :item="item" />
        </div>
    </div>
</template>

<script lang="ts">
export default {
    name: "Scroller",
    props: {
        items: {
            type: Object,
            required: true
        },
        title: {
            type: String,
            required: true
        }
    },
}
</script>

<style scoped lang="less">
::-webkit-scrollbar {
    display: none;
}
.scroller {
    display: flex;
    overflow-x: auto;
    :deep(.card) {
        margin-right: 2rem;
    }
}
</style>
