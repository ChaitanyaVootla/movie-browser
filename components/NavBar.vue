<template>
    <div class="navbar fixed w-full hidden md:flex justify-center text-xl items-center px-16 overflow-visible
        bg-black py-2 z-50 h-14">
        <div class="left-actions items-center flex-1 flex gap-10 text-[1rem] font-medium">
            <NuxtLink to="/" aria-label="Go Home">
                <div class="flex items-start gap-1 tracking-widest text-xl text-white font-extrabold group mr-7">
                    <NuxtImg src="/popcorn-lite.png" class="group-hover:rotate-6 group-hover:scale-110 transition-all duration-200"
                        alt="The Movie Browser - Home" height="28" width="28"/>
                    <div class="logo-text">TMB</div>
                </div>
            </NuxtLink>
            <!-- <NuxtLink to="/movie">
                <v-menu open-on-hover :open-delay="0">
                    <template v-slot:activator="{ props }">
                        <div class="flex items-center gap-1 text-[14px]" aria-label="Go To Movies" v-bind="props">
                                <v-icon icon="mdi-movie-outline" size="small" class="mt-[1px]" />
                                Movies
                        </div>
                    </template>
                </v-menu>
            </NuxtLink>
            <NuxtLink to="/series">
                <div class="flex items-center gap-1 text-[14px]" aria-label="Go To Series">
                    <v-icon icon="mdi-television" size="small" class="mt-[1px]" />
                    Series
                </div>
            </NuxtLink> -->
            <NuxtLink to="/topics">
                <div class="flex items-center gap-1 text-[14px]" aria-label="Go To Dynamic Lists">
                    <span class="material-symbols-outlined !text-[22px] md:!text-xl text"
                    style="font-variation-settings: 'FILL' 1;">view_object_track</span>
                    Topics
                </div>
            </NuxtLink>
            <NuxtLink to="/watchList" aria-label="Go To Watch List">
                <div class="flex items-center gap-1 whitespace-nowrap text-[14px]">
                    <v-icon icon="mdi-menu" size="small" class="mt-[1px]" />
                    Watch List
                </div>
            </NuxtLink>
            <NuxtLink to="/browse">
                <div class="flex items-center gap-1 text-[14px]" aria-label="Go To Browser">
                    <v-icon icon="mdi-infinity" size="small" class="mt-[1px]" />
                    Browse
                </div>
            </NuxtLink>
            <NuxtLink to="/ai">
                <div class="flex items-center gap-1 whitespace-nowrap text-[14px]" aria-label="Go To AI search">
                    <v-icon icon="mdi-panorama-sphere-outline" size="small" class="mt-[1px]" />
                    AI Search <span class="text-neutral-400 text-sm italic">BETA</span>
                </div>
            </NuxtLink>
            <!-- <NuxtLink to="/profile">
                <div class="flex items-center gap-1 whitespace-nowrap" aria-label="Go To Profile">
                    <v-icon icon="mdi-face-man" size="small" />
                    Profile
                </div>
            </NuxtLink> -->
            <NuxtLink to="/admin" v-if="isAdmin">
                <div class="flex items-center gap-1 whitespace-nowrap text-[14px]" aria-label="Go To AI search">
                    <v-icon icon="mdi-account-supervisor" size="small" />
                    Admin
                </div>
            </NuxtLink>
        </div>
        <div class="right flex-1 flex justify-end">
            <div class="flex items-center gap-5">
                <v-chip class="rounded-xl px-5 py-4 cursor-pointer flex" @click="showSearchOverlay = true"
                    color="#666" variant="outlined" size="default" :border="1">
                    <div class="flex justify-center items-center gap-1 text-neutral-100">
                        <v-icon color="#eee">mdi-magnify</v-icon>
                        <div>Search</div>
                        <v-chip class="rounded-pill ml-1 !h-5 !cursor-pointer" size="small">
                            <span v-if="isMac">⌘</span><span v-else>Ctrl</span> <span class="ml-1">K</span>
                        </v-chip>
                    </div>
                </v-chip>
                <CountrySelector :key="userData.loadInfo.countryCode" v-model="userData.loadInfo.countryCode" />
                <div>
                    <div v-if="status === 'unauthenticated' || status === 'loading'">
                        <NuxtImg @click="signIn('google')" src="/images/googleLogin/login.svg" class="cursor-pointer"
                            alt="Sign in with Google" height="30" width="150"/>
                    </div>
                    <div class="flex items-center gap-6" v-else>
                        <v-menu>
                            <template v-slot:activator="{ props }">
                                <v-avatar :image="(data?.user?.image as string)" :size="32" class="relative cursor-pointer"
                                    v-bind="props">
                                </v-avatar>
                            </template>
                            <div class="mt-1 !rounded-lg !bg-neutral-800 min-w-60">
                                <div class="px-2 py-1 text-xs text-neutral-300 flex items-center gap-2">
                                    <span class="material-symbols-outlined w-4">location_on</span>
                                    <div v-if="userData.loadInfo.cityName">{{ userData.loadInfo.cityName}},</div>
                                    <div v-if="userData.loadInfo.stateName">{{ userData.loadInfo.stateName}},</div>
                                    <div>{{ getName(userData.loadInfo.countryCode) }}</div>
                                </div>
                                <v-list>
                                    <v-list-item>
                                        <NuxtLink to="/watchList">
                                            Watch List
                                        </NuxtLink>
                                    </v-list-item>
                                    <v-list-item>
                                        <NuxtLink to="/ratings">
                                            My Ratings
                                        </NuxtLink>
                                    </v-list-item>
                                    <v-list-item>
                                        <NuxtLink to="/watched">
                                            Watch History
                                        </NuxtLink>
                                    </v-list-item>
                                    <v-list-item @click="signOut" class="text-red">
                                        Sign Out
                                    </v-list-item>
                                </v-list>
                            </div>
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

            <v-btn value="ai" @click="bottomNavItemClicked('ai')">
                <v-icon>mdi-panorama-sphere-outline</v-icon>
                <span class="text-2xs">
                    AI Search
                </span>
            </v-btn>

            <v-btn v-if="status === 'unauthenticated' || status === 'loading'" value="profile" @click="signIn('google')">
                <NuxtImg src="/images/googleLogin/login_small.svg" height="10" width="23" />
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
                            <NuxtLink to="/topics">
                                Topics
                            </NuxtLink>
                        </v-list-item>
                        <v-list-item>
                            <NuxtLink to="/watchList">
                                Watch List
                            </NuxtLink>
                        </v-list-item>
                        <v-list-item>
                            <NuxtLink to="/ratings">
                                My Ratings
                            </NuxtLink>
                        </v-list-item>
                        <v-list-item>
                            <NuxtLink to="/watched">
                                Watch History
                            </NuxtLink>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-btn>
        </v-bottom-navigation>
    </div>
    <v-overlay v-model="showSearchOverlay" width="100%" height="100%" contained :close-on-content-click="true"
        scrim="black" aria-label="Search Overlay">
        <div class="md:flex md:justify-center relative h-full">
            <div class="absolute max-md:w-full md:px-10 md:top-36 md:flex md:justify-center md:w-1/3">
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
                            <div v-if="item?.raw">
                                <div v-if="item.raw.key" class="flex items-center gap-3">
                                    <span class="material-symbols-outlined !text-[22px] md:!text-xl text"
                                        style="font-variation-settings: 'FILL' 1;">search</span>
                                    {{ item.raw.name }}
                                </div>
                                <div v-else class="flex justify-between p-3 h-48">
                                    <div class="max-md:w-2/3 md:w-3/4 max-md:text-sm h-full">
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
                                    <div class="max-md:w-1/3 md:w-1/4 h-full">
                                        <v-img
                                            :src="`https://image.tmdb.org/t/p/${configuration.images.poster_sizes.w185
                                                }${$vuetify.display.mdAndDown?item.raw.poster_path:item.raw.poster_path || item.raw.profile_path}`"
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
import { getName } from 'country-list';
import { userStore } from '~/plugins/state';
import Clarity from '@microsoft/clarity';
import { searchTopics } from '~/utils/topics/utils';

const { data, status, signIn, signOut } = useAuth();

const defaultNavBarItem = ref(0);

const showSearchOverlay = ref(false);
const isSearching = ref(false);
const isMounted = ref(false);
const isMac = ref(false);
let searchResults = ref([] as any[]);
const userData = userStore();

onMounted(async () => {
    isMounted.value = true;
    isMac.value = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.ctrlKey && event.key === 'k') {
            event.preventDefault();
            showSearchOverlay.value = !showSearchOverlay.value;
        }
        if (event.metaKey && event.key === 'k') {
            event.preventDefault();
            showSearchOverlay.value = !showSearchOverlay.value;
        }
    });

    if (status.value === 'authenticated') {
        userData.setupStore();
        Clarity.identify(data.value?.user?.email || 'anonymous');
    }
    userData.loadInfo();
});

const isAdmin = computed(() => {
    return data?.value?.user?.email === 'speedblaze@gmail.com';
})

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

    const topics = searchTopics(query);
    searchResults.value = [...(topics.slice(0, 5)), ...searchResponse];
    isSearching.value = false;
}, 300, { leading: false });

const searchItemClicked = (item: any) => {
    showSearchOverlay.value = false;
    if (item.key) {
        useRouter().push(`/topics/${item.key}`);
        return;
    }
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
    } else if (item === 'ai') {
        return useRouter().push('/ai');
    } else if (item === 'profile') {
        return;
    }
}
</script>

<style lang="less">
.v-autocomplete__content {
    max-height: calc(100vh - 20rem) !important;
    height: auto !important;
    .v-list-item {
        background-color: #111;
        border-bottom: 1px solid #333;
    }
}
@media (max-width: 768px) {
    .v-autocomplete__content {
        left: 0 !important;
        max-height: calc(100vh - 10rem) !important;
    }
}
</style>
