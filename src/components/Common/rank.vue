<template>
    <div v-if="item.rank" class="ml-3">
        <div v-if="item.rank < 10" class="fire">
            <font-awesome-icon :icon="['fas', 'fire']" /> TOP 10
        </div>
        <div v-else-if="item.rank < 50" class="hot">
            <font-awesome-icon :icon="['fas', 'burn']" /> HOT
        </div>
    </div>
</template>

<script lang="ts">
export default {
    name: 'movieInfo',
    props: {
        item: Object
    },
}
</script>

<style scoped lang="less">
    div {
        font-weight: 700;
    }
    .fire {
        color: #ff5100;
    }
    .hot {
        color: #ff8349;
    }
</style>