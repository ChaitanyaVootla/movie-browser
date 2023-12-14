<template>
    <div class="navbar hidden md:flex justify-between font-semibold text-xl items-center
        shadow-lg shadow-neutral-900 pl-14 pr-14 overflow-visible bg-neutral-950 h-16
        z-50">
        <div class="left-actions flex-1 flex gap-20">
            <NuxtLink to="/">
                <div class="flex items-center gap-2">
                    <v-icon icon="mdi-home" class="text-3xl" />
                    Home
                </div>
            </NuxtLink>
            <NuxtLink to="/ai">
                <div class="flex items-center gap-2">
                    <v-icon icon="mdi-alien" class="text-3xl" />
                    AI
                </div>
            </NuxtLink>
        </div>
        <NuxtLink to="/" class="h-full flex items-center justify-center">
            <div class="center border-1 border-gray-700 bg-red-900 p-2 pl-3 pr-3 text-black h-full
                flex items-center justify-center">
                <v-icon icon="mdi-filmstrip" size="large" />
            </div>
        </NuxtLink>
        <div class="right flex-1 flex justify-end">
            <div class="flex items-center">
                <v-chip class="rounded-xl px-6 py-5 cursor-pointer" @click="showSearchOverlay = true">
                    <v-icon icon="mdi-magnify" />
                    <div class="ml-2">Search
                        <v-chip class="rounded-pill ml-1" size="small">
                            Ctrl + K
                        </v-chip>
                    </div>
                </v-chip>
            </div>
        </div>
    </div>
    <v-overlay v-model="showSearchOverlay" absolute width="100%" height="100%">
        <div class="flex justify-center relative min-h-full">
        <div class="absolute w-4/5 top-36 md:w-1/3">
            <v-autocomplete
                auto-select-first
                label="Search"
                class="search"
                autofocus
                variant="solo-filled"
                return-object
                @update:search="searchUpdated"
                @update:model-value="searchItemClicked"
                :items="searchResults"
                no-filter
            >
                <template v-slot:item="{ props, item }">
                    <v-list-item v-bind="props" title="" variant="flat">
                        <div class="flex justify-between p-3">
                            <div>
                                <div class="title">
                                    {{ item.raw.title || item.raw.name }}
                                </div>
                                <div class="text-neutral-400">
                                    {{ (item.raw.release_date || item.raw.first_air_date || '').slice(0, 4)
                                        }} - {{ item.raw.media_type }}
                                </div>
                                <div class="overview text-neutral-400 text-sm text-ellipsis mt-3">
                                    {{ item.raw.overview?.slice(0, 200) }}
                                </div>
                            </div>
                            <div>
                                <v-img
                                    :src="`https://image.tmdb.org/t/p/w185${item.raw.poster_path || item.raw.profile_path}`"
                                    width="120"
                                    height="180"
                                    class="rounded-md"
                                    :alt="item.raw.title"
                                >
                                    <template v-slot:placeholder>
                                        <v-skeleton-loader type="image" class="w-full h-full"></v-skeleton-loader>
                                    </template>
                                    <template v-slot:error>
                                        <v-skeleton-loader type="image" class="w-full h-full">
                                            <div class="bg-neutral-700 w-full h-full"></div>
                                        </v-skeleton-loader>
                                    </template>
                                </v-img>
                            </div>
                        </div>
                    </v-list-item>
                </template>
            </v-autocomplete>
        </div>
        </div>
    </v-overlay>
</template>

<script setup lang="ts">
const showSearchOverlay = ref(false);
let searchResults = ref([] as any[]);

onMounted(() => {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === 'k') {
      event.preventDefault();
      showSearchOverlay.value = !showSearchOverlay.value;
    }
  });
});

const searchUpdated = useDebounce(async (query: string) => {
  const searchResponse = await $fetch(`/api/search?query=${query}`);
  searchResults.value = searchResponse;
}, 300, { leading: false });

const searchItemClicked = (item: any) => {
  showSearchOverlay.value = false;
  setTimeout(() => {
    useRouter().push(`/movie/${item.id}`);
  }, 100);
};
</script>

<style lang="less">
.search {
    width: 50vw;
}
.v-list-item__content {
    max-width: calc(50vw - 3rem);
}
.v-autocomplete__content {
    max-height: calc(100vh - 20rem) !important;
}
</style>
