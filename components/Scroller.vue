<template>
    <div>
        <div class="title text-lg md:text-2xl font-light -mb-2 md:mb-1 md:ml-14">
            {{ title }}
        </div>
        <v-slide-group show-arrows="desktop">
            <v-slide-group-item v-for="item in (items || Array(10))">
                <slot :item="item">
                    <PosterCard :item="item" :pending="pending" class="mr-2 md:pr-6"/>
                </slot>
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
