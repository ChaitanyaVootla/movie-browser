<template>
    <div class="navbar fixed w-full hidden md:flex justify-center text-xl items-center px-16 overflow-visible
        bg-neutral-950 py-2 z-50 h-14">
        <div class="left-actions items-center flex-1 flex gap-16">
            <NuxtLink to="/" aria-label="Go Home">
                <div class="flex items-start gap-1 tracking-widest text-2xl text-white font-extrabold group">
                    <NuxtImg src="/popcorn.png" class="h-8 group-hover:rotate-6 group-hover:scale-110 transition-all duration-200"/>
                    <div class="logo-text">TMB</div>
                </div>
            </NuxtLink>
            <NuxtLink to="/browse">
                <div class="flex items-center gap-2" aria-label="Go To AI search">
                    <v-icon icon="mdi-infinity" size="small" />
                    Browse
                </div>
            </NuxtLink>
            <NuxtLink to="/watchList" aria-label="Go To Watch List">
                <div class="flex items-center gap-2">
                    <v-icon icon="mdi-menu" size="small" />
                    Watch List
                </div>
            </NuxtLink>
            <!-- <NuxtLink to="/ai">
                <div class="flex items-center gap-2" aria-label="Go To AI search">
                    <v-icon icon="mdi-panorama-sphere-outline" size="small" />
                    AI <span class="text-neutral-400 text-sm italic">BETA</span>
                </div>
            </NuxtLink> -->
        </div>
        <div class="right flex-1 flex justify-end">
            <div class="flex items-center">
                <v-chip class="rounded-xl px-6 py-5 cursor-pointer flex" @click="showSearchOverlay = true"
                    color="#333" variant="outlined" size="default">
                    <div class="ml-2 flex justify-center items-center gap-1 text-neutral-100">
                        <v-icon color="#eee">mdi-magnify</v-icon>
                        <div class="ml-2">Search</div>
                        <v-chip class="rounded-pill ml-1" size="small">
                            Ctrl + K
                        </v-chip>
                    </div>
                </v-chip>
                <div class="ml-5">
                    <div v-if="status === 'unauthenticated' || status === 'loading'">
                        <NuxtImg @click="signIn('google')" src="/images/googleLogin/login.svg" class="h-10 cursor-pointer" />
                    </div>
                    <div v-else>
                        <v-menu>
                            <template v-slot:activator="{ props }">
                                <v-avatar :image="(data?.user?.image as string)" :size="38" class="relative cursor-pointer"
                                    v-bind="props">
                                </v-avatar>
                            </template>
                            <v-list>
                                <v-list-item>
                                    <NuxtLink to="/watchList">
                                        Watch List
                                    </NuxtLink>
                                </v-list-item>
                                <v-list-item @click="signOut" class="text-red">
                                    Sign Out
                                </v-list-item>
                            </v-list>
                        </v-menu>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="hidden md:flex navbar-pseudo h-14"></div>
    <div class="md:hidden">
        <v-bottom-navigation :grow="true" @update:modelValue="bottomNavItemClicked" bg-color="#050505" color="#aaa"
            density="comfortable" mandatory rounded v-model="defaultNavBarItem">
            <v-btn value="home" @click="bottomNavItemClicked('home')">
                <v-icon>mdi-home-outline</v-icon>
                <span class="text-2xs">Home</span>
            </v-btn>

            <v-btn value="browse" @click="bottomNavItemClicked('browse')">
                <v-icon>mdi-infinity</v-icon>
                <span class="text-2xs">Browse</span>
            </v-btn>

            <v-btn value="search" @click="bottomNavItemClicked('search')">
                <v-icon>mdi-magnify</v-icon>
                <span class="text-2xs">Search</span>
            </v-btn>

            <v-btn v-if="status === 'unauthenticated' || status === 'loading'" value="profile" @click="signIn('google')">
                <NuxtImg src="/images/googleLogin/login_small.svg" class="h-6 -mt-1" />
                <span class="text-2xs">Login</span>
            </v-btn>
            <v-btn v-else>
                <v-menu>
                    <template v-slot:activator="{ props }">
                        <v-avatar :image="(data?.user?.image as string)" :size="35" class="relative cursor-pointer"
                            v-bind="props">
                        </v-avatar>
                    </template>
                    <v-list>
                        <v-list-item @click="signOut" class="text-red">
                            Sign Out
                        </v-list-item>
                        <v-list-item>
                            <NuxtLink to="/watchList">
                                Watch List
                            </NuxtLink>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-btn>
        </v-bottom-navigation>
    </div>
    <v-overlay v-model="showSearchOverlay" width="100%" height="100%" contained :close-on-content-click="true"
        scrim="black">
        <div class="flex justify-center relative h-full">
        <div class="absolute max-md:w-full px-10 max-md:top-3 md:top-36 flex justify-center md:w-1/3">
            <v-autocomplete
                auto-select-first
                label="Search"
                class="search relative"
                autofocus
                variant="solo-filled"
                return-object
                :loading="isSearching"
                @update:search="searchUpdated"
                @update:model-value="searchItemClicked"
                :items="searchResults"
                no-filter
                item-color="black"
                bg-color="black"
                base-color="black"
            >
                <template v-slot:item="{ props, item }">
                    <v-list-item v-bind="props" title="" variant="flat">
                        <div v-if="item?.raw" class="flex justify-between p-3">
                            <div class="max-md:w-2/3 md:w-3/4 max-md:text-sm">
                                <div class="title">
                                    {{ item.raw.title || item.raw.name }}
                                </div>
                                <div class="text-neutral-400 capitalize flex gap-2 max-md:text-xs">
                                    <div v-if="item.raw.release_date || item.raw.first_air_date">
                                        {{ (item.raw.release_date || item.raw.first_air_date).slice(0, 4) }} -
                                    </div>
                                    <div>
                                        {{ item.raw.media_type }}
                                    </div>
                                </div>
                                <div :key="`${isMounted}`" class="flex gap-2 mt-2 flex-wrap">
                                    <div v-for="genre in item.raw.genres">
                                        <v-chip class="text-md" rounded :size="$vuetify.display.mdAndUp?'small':'x-small'">
                                            {{ genre.name }}
                                        </v-chip>
                                    </div>
                                </div>
                                <!-- <Ratings :googleData="{}" :tmdbRating="item.raw.vote_average" :itemId="item.raw.id"
                                    :small="true" class="mt-2"/> -->
                            </div>
                            <div class="max-md:w-1/3 md:w-1/4">
                                <v-img
                                    :src="`https://image.tmdb.org/t/p/${configuration.images.poster_sizes.w185
                                        }${item.raw.backdrop_path || item.raw.profile_path}`"
                                    height="100"
                                    width="100%"
                                    class="rounded-md"
                                    cover
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
const isSearching = ref(false);
const isMounted = ref(false);
let searchResults = ref([] as any[]);

onMounted(() => {
    isMounted.value = true;
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.ctrlKey && event.key === 'k') {
            event.preventDefault();
            showSearchOverlay.value = !showSearchOverlay.value;
        }
    });
});

const searchUpdated = useDebounce(async (query: string) => {
    isSearching.value = true;
    let searchResponse = await $fetch(`/api/search?query=${query}`);
    searchResponse = searchResponse.map((item: any) => {
        if (item.media_type === 'movie') {
            return {
                ...item,
                genres: item.genre_ids.map((genreId: number) => movieGenres[genreId]),
            }
        } else if (item.media_type === 'tv') {
            return {
                ...item,
                genres: item.genre_ids.map((genreId: number) => seriesGenres[genreId]),
            }
        } else if (item.media_type === 'person') {
            return {
                ...item,
                genres: [],
            }
        }
    });
    searchResults.value = searchResponse;
    isSearching.value = false;
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

<style scoped lang="less">
// .anim-icon {
//     animation: stroke 6s infinite alternate;
// }
// @keyframes stroke {
// 	0%   { color: #E50914}
// 	50%  { color: white}
// 	100%  { color: #00A8E1 }
// }
:deep(.v-chip) {
    border-width: 2px !important;
}
</style>

<style lang="less">
.v-autocomplete__content {
    max-height: calc(100vh - 20rem) !important;
    height: auto !important;
    .v-list-item {
        background-color: #111;
        border-bottom: 1px solid #333;
    }
}
</style>
