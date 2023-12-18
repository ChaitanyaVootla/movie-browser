<template>
    <div>
        <div class="title text-2xl mb-5 ml-14">
            {{ title }}
        </div>
        <v-slide-group show-arrows="desktop">
            <v-slide-group-item v-for="movie in (items || Array(10))">
                <PosterCard :item="movie" :pending="pending" class="mr-6"/>
            </v-slide-group-item>
        </v-slide-group>
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
        },
        pending: {
            type: Boolean,
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
