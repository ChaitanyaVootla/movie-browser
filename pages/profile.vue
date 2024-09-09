<template>
    <div class="flex w-full h-full">
        <div class="min-w-60 w-[15%] bg-neutral-950 flex flex-col justify-between px-4 pt-4 text-lg">
            <div>
                <div v-for="item in sidebarTopItems" class="flex items-center gap-4 py-3
                    hover:bg-neutral-900 pl-4 cursor-pointer rounded-lg"
                    :class="{ 'bg-neutral-800': currentSidebarItem === item.name }"
                    @click="sidebarItemClicked(item)">
                    <span class="material-symbols-outlined !text-[22px] md:!text-3xl">
                        {{ item.icon}}
                    </span>
                    {{ item.title }}
                </div>
            </div>
            <div>
                <div v-for="item in sidebarBottomItems" class="flex items-center gap-4 py-3
                    hover:bg-neutral-800 pl-4 cursor-pointer"
                    @click="sidebarItemClicked(item)">
                    <span class="material-symbols-outlined !text-[22px] md:!text-3xl">
                        {{ item.icon}}
                    </span>
                    {{ item.title }}
                </div>
            </div>
        </div>
        <div class="w-full px-10 pt-4">
            <div v-if="currentSidebarItem === 'likes'">
                <div class="top-action flex justify-center mt-4">
                    <v-btn-toggle v-model="selectedType" mandatory density="compact" @update:model-value="viewUpdated">
                        <v-btn size="default">
                            Movies
                        </v-btn>
                        <v-btn size="default">
                            Series
                        </v-btn>
                    </v-btn-toggle>
                </div>
                <Grid v-if="!series" :items="likes?.movies || []" :title="`${likes?.movies?.length} movies`" />
                <Grid v-else :items="likes?.series || []" :title="`${likes?.series?.length} series`" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const currentSidebarItem = ref('likes')
const series = ref(useRoute().query.series as string);
const selectedType = ref(series?parseInt(series.value):1);

const sidebarTopItems = [
    {
        title: 'Likes',
        icon: 'thumb_up',
        name: 'likes'
    },
    {
        title: 'Watch List',
        icon: 'menu',
        name: 'watchlist',
    },
]
const sidebarBottomItems = [
    {
        title: 'Account',
        icon: 'person',
        name: 'account',
    },
]

const sidebarItemClicked = (item: any) => {
    useRouter().replace({ name: 'profile', query: { tab: item.name } })
    currentSidebarItem.value = item.name
}

const headers = useRequestHeaders(['cookie']) as HeadersInit
const likes = await $fetch('/api/user/ratings/likes', { headers });

const viewUpdated = (val: number) => {
    series.value = val;
    useRouter().replace({ query: {
        ...useRoute().query,
        series: val
    }});
};
</script>