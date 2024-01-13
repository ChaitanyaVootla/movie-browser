<template>
    <Scroller :items="scrollItems" :title="scrollItem.name" :pending="pending">
        <template v-slot:title>
            <div class="flex items-center max-md:justify-between">
                <NuxtImg :src="scrollItem.logo" :alt="scrollItem.name" class="h-10 object-cover -m-0" :class="scrollItem.name" />
                <v-btn-toggle v-model="sortOrder" density="compact" @update:model-value="changeSort" mandatory
                    :style="$vuetify.display.mobile?'height: 15px':'height: 20px'" class="ml-5" variant="outlined">
                    <v-btn v-bind:size="$vuetify.display.mobile?'x-small':'small'">Popular</v-btn>
                    <v-btn size="x-small">New</v-btn>
                </v-btn-toggle>
            </div>
        </template>
    </Scroller>
</template>

<script setup lang="ts">
const sortOrder = ref(0);
const { scrollItem } = defineProps<{
    scrollItem: any
}>()
const { data: scrollItems, pending, refresh }: any = useLazyAsyncData(`scrollDiscover-${scrollItem.name}`, async () => {
    return await $fetch('/api/discover', {
        method: 'POST',
        body: scrollItem.filterParams
    })
}, {
    transform: (discoverData: any) => {
        return discoverData.results;
    },
    server: false
});

const changeSort = () => {
    scrollItem.filterParams.sort_by = sortOrder.value === 0 ? 'popularity.desc' : 'release_date.desc';
    refresh();
}
</script>

<style scoped lang="less">
.netflix, .prime {
    margin: -5px;
}
.hotstar {
    padding: 3px;
    margin: -3px;
}
.apple, .aha {
    margin: -8px;
    padding: 10px;
}
</style>
