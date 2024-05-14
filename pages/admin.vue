<template>
    <div class="px-14 pt-5">
        <v-data-table
            :items-per-page="-1"
            height="100%"
            :items="users"
            :headers="[
                {title: 'User', key: 'user'},
                {title: 'Email', key: 'email'},
                {title: 'Created At', key: 'createdAt'},
                {title: 'Last Visit', key: 'lastVisited'},
                {title: 'Watched movies', key: 'WatchedMovies'},
                {title: 'Movies watch list', key: 'MoviesWatchList'},
                {title: 'Series watch list', key: 'SeriesList'},
                {title: 'Continue watching', key: 'ContinueWatching'},
                {title: 'Recents', key: 'recent'},
            ]"
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
        </v-data-table>
    </div>
</template>

<script setup lang="ts">
const headers = useRequestHeaders(['cookie']) as HeadersInit
const users: any[] = await $fetch('/api/admin/users', { headers });

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
