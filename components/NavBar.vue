<template>
    <div class="navbar hidden md:flex justify-between font-semibold text-xl items-center
        shadow-md shadow-neutral-900 pl-14 pr-14 overflow-visible bg-neutral-950 h-16 z-50">
        <div class="left-actions flex-1 flex gap-20">
            <NuxtLink to="/" aria-label="Go Home">
                <div class="flex items-center gap-2">
                    <v-icon icon="mdi-home" class="text-3xl" />
                    Home
                </div>
            </NuxtLink>
            <NuxtLink to="/browse">
                <div class="flex items-center gap-2" aria-label="Go To AI search">
                    <v-icon icon="mdi-movie-search" class="text-3xl" />
                    Browse
                </div>
            </NuxtLink>
            <NuxtLink to="/watchList" aria-label="Go To Watch List">
                <div class="flex items-center gap-2">
                    <v-icon icon="mdi-playlist-play" class="text-3xl" />
                    Watch List
                </div>
            </NuxtLink>
            <!-- <NuxtLink to="/ai">
                <div class="flex items-center gap-2" aria-label="Go To AI search">
                    <v-icon icon="mdi-panorama-sphere-outline" class="text-3xl" />
                    AI <span class="text-neutral-400 text-sm italic">BETA</span>
                </div>
            </NuxtLink> -->
        </div>
        <NuxtLink to="/" class="h-full flex items-center justify-center" aria-label="Go Home">
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
                        <v-chip class="rounded-pill ml-1 -mt-1" size="small">
                            Ctrl + K
                        </v-chip>
                    </div>
                </v-chip>
                <div class="ml-5">
                    <div v-if="status === 'unauthenticated' || status === 'loading'">
                        <v-btn @click="signIn('google')" color="#333" prepend-icon="mdi-google">
                            Continue with Google
                        </v-btn>
                    </div>
                    <div v-else>
                        <v-menu>
                            <template v-slot:activator="{ props }">
                                <v-avatar :image="(data?.user?.image as string)" :size="35" class="relative cursor-pointer"
                                    v-bind="props">
                                </v-avatar>
                            </template>
                            <v-list>
                                <v-list-item @click="signOut">
                                    Sign Out
                                </v-list-item>
                            </v-list>
                        </v-menu>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="md:hidden">
        <v-bottom-navigation :grow="true" @update:modelValue="bottomNavItemClicked" bg-color="#111" color="#aaa"
            density="comfortable" mandatory rounded v-model="defaultNavBarItem">
            <v-btn value="home" @click="bottomNavItemClicked('home')">
                <v-icon>mdi-home</v-icon>
                <span>Home</span>
            </v-btn>

            <v-btn value="browse" @click="bottomNavItemClicked('browse')">
                <v-icon>mdi-movie-search</v-icon>
                <span>Browse</span>
            </v-btn>

            <v-btn value="search" @click="bottomNavItemClicked('search')">
                <v-icon>mdi-magnify</v-icon>
                <span>Search</span>
            </v-btn>

            <v-btn v-if="status === 'unauthenticated' || status === 'loading'" value="profile" @click="signIn('google')">
                <v-icon>mdi-google</v-icon>
                <span>Login</span>
            </v-btn>
            <v-btn v-else>
                <v-menu>
                    <template v-slot:activator="{ props }">
                        <v-avatar :image="(data?.user?.image as string)" :size="35" class="relative cursor-pointer"
                            v-bind="props">
                        </v-avatar>
                    </template>
                    <v-list>
                        <v-list-item @click="signOut">
                            Sign Out
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-btn>
        </v-bottom-navigation>
    </div>
    <v-overlay v-model="showSearchOverlay" absolute width="100%" height="100%" contained>
        <div class="flex justify-center relative min-h-full">
        <div class="absolute w-full px-10 top-36 flex justify-center md:w-1/2">
            <v-autocomplete
                auto-select-first
                label="Search"
                class="search relative"
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
import { useAuth } from '#imports'

const { data, status, signIn, signOut } = useAuth();

const defaultNavBarItem = ref(0);

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
    if (item.media_type === 'person') {
      return useRouter().push(`/person/${item.id}`);
    } else if (item.media_type === 'tv') {
      return useRouter().push(`/series/${item.id}`);
    } else if (item.media_type === 'movie') {
        useRouter().push(`/movie/${item.id}`);
    }
  }, 100);
};

const bottomNavItemClicked = (item: any) => {
    if (item === 'home') {
        return useRouter().push('/');
    } else if (item === 'search') {
        showSearchOverlay.value = true;
    } else if (item === 'browse') {
        return useRouter().push('/browse');
    } else if (item === 'watchList') {
        return useRouter().push('/watchList');
    } else if (item === 'profile') {
        return;
    }
}
</script>

<style lang="less">
:deep(.search) {
    .v-list-item__content {
        width: 100% !important;
    }
}

@media (min-width: 768px) {
    .v-list-item__content {
        max-width: calc(50vw - 3rem);
    }
    .search {
        width: 50% !important;
    }
}
.v-autocomplete__content {
    max-height: calc(100vh - 20rem) !important;
}
</style>
