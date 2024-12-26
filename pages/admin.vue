<template>
    <div class="px-14 pt-5">
        <v-data-table
            :items-per-page="20"
            height="100%"
            :items="users"
            :headers="tableHeaders"
            fixed-header
            expand-on-click
            show-expand
            hover
            :sort-by="sortBy"
        >
            <template v-slot:item.user="{ item }">
                <div class="flex items-center">
                    <v-avatar>
                        <img :src="item.picture" class="w-100 h-100 object-cover items-center object-center" />
                    </v-avatar>
                    <div class="ml-2">{{ item.name }}</div>
                </div>
            </template>
            <template v-slot:item.createdAt="{ item }">
                {{ humanizeDate(item.createdAt) }}
            </template>
            <template v-slot:item.lastVisited="{ item }">
                {{ item.lastVisited?new Date(item.lastVisited):'' }}
            </template>
            <template v-slot:expanded-row="{ columns, item }">
                <tr>
                    <td :colspan="columns.length">
                        <div class="px-2 py-4">
                            <div class="text-lg font-medium">Recents</div>
                            <div class="flex flex-wrap gap-2 mt-4">
                                <NuxtLink v-for="recent in (item['recent-items'] || [])" :key="recent.itemId"
                                    :to="`/${recent.title?'movie':'series'}/${recent.itemId}`">
                                    <v-chip rounded>
                                        {{ recent.title?'Movie':'Series' }} -
                                        {{ recent.title || recent.name }}
                                        <span class="font-mono ml-4">{{ recent.itemId }}</span>
                                    </v-chip>
                                </NuxtLink>
                            </div>
                        </div>
                    </td>
                </tr>
            </template>
        </v-data-table>
    </div>
</template>

<script setup lang="ts">
const headers = useRequestHeaders(['cookie']) as HeadersInit
const users: any[] = await $fetch('/api/admin/users', { headers });

const tableHeaders = [
    { title: 'User', key: 'user' },
    { title: 'Email', key: 'email' },
    { title: 'Created At', key: 'createdAt' },
    { title: 'Last Visit', key: 'lastVisited', sortable: true },
    { title: 'Watched movies', key: 'WatchedMovies' },
    { title: 'Movies watch list', key: 'MoviesWatchList' },
    { title: 'Series watch list', key: 'SeriesList' },
    { title: 'Continue watching', key: 'ContinueWatching' },
    { title: 'Recents', key: 'recent' },
];

const sortBy = [{ key: 'lastVisited', order: 'desc'}] as any[]

useHead({
    title: 'Admin',
    meta: [
        { name: 'description', content: 'Admin page' },
    ],
});
</script>

<style scoped lang="less">
:deep(img) {
    height: 100px;
    width: 100px;
}
</style>
