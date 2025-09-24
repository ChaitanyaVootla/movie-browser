<template>
    <div :key="`${seriesUpdateKey}`">
        <div v-if="pending" class="pending w-full h-full">
            <v-skeleton-loader
                class="hidden md:block m-5"
                type="card, article"
                color="transparent"
                :elevation="20"
            ></v-skeleton-loader>
        </div>
        <div v-else-if="series?.id">
            <DetailsTopInfo :item="series" :watched="false"/>
            <div>
                <div class="px-3 md:mx-12 mt-3">
                    <div class="identify max-md:justify-center flex gap-2 md:gap-6 mb-0 md:mb-5 overflow-x-auto">
                        <UserRating itemType="series" :itemId="series.id" @show-login="showLogin" />
                        <v-btn :key="`${isMounted}`" @click="watchListClicked()" icon="mdi-playlist-plus" :color="(watchlist === true)?'primary':''"
                            :elevation="5" :size="$vuetify.display.mdAndUp?'small':'x-small'" aria-label="add to watchlist"  >
                        </v-btn>
                        <v-btn :key="`${isMounted}`" @click="share" icon="mdi-share" :elevation="5"
                            :size="$vuetify.display.mdAndUp?'small':'x-small'" :color="''" aria-label="share">
                        </v-btn>
                    </div>
                    <div class="flex w-full items-start gap-4 flex-wrap max-md:justify-center md:justify-start
                        max-md:mt-3 md:mt-5">
                        <div>
                            <v-select
                                v-model="series.selectedSeason"
                                label="Select Season"
                                item-title="name"
                                item-value="id"
                                :items="series.seasons || []"
                                variant="outlined"
                                persistent-hint
                                return-object
                                single-line
                                density="compact"
                                rounded
                                @update:modelValue="seasonSelected"
                            ></v-select>
                        </div>
                        <div class="text-sm md:text-base max-md:mt-1 md:mt-2">
                            {{ series.selectedSeason?.episodes?.length || 0 }} Episodes
                        </div>
                    </div>
                </div>
                <div class="px-3 md:px-0 max-md:-mt-2">
                    <Scroller :items="series.selectedSeason?.episodes || []" title="" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <div class="flex flex-col gap-3 mt-2 cursor-pointer wide-card" @click="showEpisode(item)">
                                <div class="text-neutral-400 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4
                                    text-xs md:text-sm -mb-1 flex items-center justify-between mr-1">
                                    <div class="flex gap-2">
                                        Episode {{ item?.episode_number }}
                                        <div v-if="item?.air_date">
                                            -
                                        <NuxtTime :datetime="new Date(item?.air_date)"
                                            year="numeric" month="long" day="numeric" class="ml-1" />
                                        </div>
                                    </div>
                                    <div v-if="(new Date(item?.air_date)).getTime() > Date.now()">
                                        <v-chip rounded size="small">
                                            <span class="text-neutral-200">Upcoming</span>
                                        </v-chip>
                                    </div>
                                </div>
                                <SeoImg :src="`https://image.tmdb.org/t/p/w500${item?.still_path}`"
                                    class="rounded-lg mr-2 wide-image"
                                    :alt="item?.name">
                                    <template #placeholder>
                                        <v-skeleton-loader class="wide-image" type="image" />
                                    </template>
                                    <template #error>
                                        <div class="wide-image bg-neutral-800 rounded-lg"></div>
                                    </template>
                                </SeoImg>
                                <div class="text-neutral-200 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4
                                    text-xs md:text-base">
                                    {{ item?.name }}
                                </div>
                            </div>
                        </template>
                    </Scroller>
                </div>

                <div class="px-3 md:mx-12 overview max-md:mt-5 md:mt-10">
                    <v-card class="px-4 py-4" color="#151515">
                        <h1 class="text-lg font-semibold flex items-center gap-4">
                            {{ series.name }}
                        </h1>
                        <div class="flex items-center gap-5 flex-wrap mt-1">
                            <h2>Overview</h2>
                            <div v-if="series.created_by?.length" class="flex items-center gap-3 text-sm md:text-base">
                                <div class="text-neutral-300">Created by</div>
                                <NuxtLink :to="`/person/${person?.id}/${getUrlSlug(person.name)}`" v-for="person in series.created_by">
                                    <div class="flex items-center gap-1 underline underline-offset-2">
                                        <div>{{person?.name}}</div>
                                    </div>
                                </NuxtLink>
                            </div>
                        </div>
                        <div class="text-sm md:text-base text-neutral-300 mt-1 text">
                            {{ series.overview }}
                        </div>

                        <div class="flex items-center mt-3 gap-2">
                            <NuxtLink v-if="series.origin_country?.length"
                                :to="`/topics/${getTopicKey('country', series.origin_country[0], 'tv')}`"    
                                class="flex items-center gap-2">
                                <div class="bg-neutral-800 px-3 py-2 flex items-center rounded-full cursor-pointer gap-2">
                                    <SeoImg
                                    :src="`https://flagcdn.com/${series.origin_country[0].toLowerCase()}.svg`"
                                    :alt="`Flag of ${series.origin_country[0]}`"
                                    class="w-6 h-4 rounded-md"
                                    ></SeoImg>
                                    <div class="text-xs text-neutral-300">{{ series.origin_country[0] }}</div>
                                </div>
                            </NuxtLink>

                            <NuxtLink v-if="language" :to="languageTopicLink || '/'">
                                <v-chip class="rounded-pill cursor-pointer" color="#ddd"
                                    :size="$vuetify.display.mdAndUp?'small':'x-small'">
                                    <span class="material-symbols-outlined !text-[22px] md:!text-xl text mr-1"
                                        style="font-variation-settings: 'FILL' 1;">language</span>
                                    {{ language }}
                                </v-chip>
                            </NuxtLink>

                            <NuxtLink :key="`${isMounted}`" v-if="series.external_ids.imdb_id" :to="`https://www.imdb.com/title/${series.external_ids.imdb_id}/parentalguide`" target="blank"
                                noreferrer noopener class="block">
                                <v-btn prepend-icon="mdi-exclamation-thick" variant="tonal" :size="$vuetify.display.mdAndUp?'small':'x-small'" color="#aaa">
                                    Content warning
                                </v-btn>
                            </NuxtLink>
                            
                            <v-btn v-if="series.status" :key="`${isMounted}`" :color="seriesStatusColor"
                                :elevation="5" class="px-3 !normal-case"
                                :size="$vuetify.display.mdAndUp?'small':'x-small'">
                                Status <b class="ml-2 font-light">{{ statusText }}</b>
                            </v-btn>
                        </div>
                        <div :key="`${isMounted}`" class="flex flex-wrap gap-2 md:gap-3 mt-2 md:mt-5">
                            <v-chip v-for="keyword in keywords"
                                class="rounded-pill cursor-pointer" :color="'#ddd'"
                                :size="$vuetify.display.mdAndUp?'small':'x-small'" @click="keywordClicked(keyword)">
                                {{ keyword.name }}
                            </v-chip>
                            <v-chip v-if="series?.keywords?.results?.length > 5" @click="isKeywordsExpanded = !isKeywordsExpanded"
                                class="rounded-pill cursor-pointer" :color="'#ddd'" :size="$vuetify.display.mdAndUp?'small':'x-small'"
                                variant="text">
                                <span v-if="isKeywordsExpanded">Collpase</span>
                                <span v-else>+{{ series?.keywords?.results?.length - 5 }} more</span>
                            </v-chip>
                        </div>
                        <div class="mt-4 text-2xs md:text-sm text-neutral-400 flex items-baseline">
                            Last Updated: {{ humanizeDateFull(series.updatedAt || series.shallowUpdatedAt) }}
                            <v-btn @click="updateSeries" :loading="updatingSeries" variant="text" size="x-small"
                                class="ml-3" color="#bbb">
                                Request Update
                            </v-btn>
                        </div>
                    </v-card>
                </div>

                <div v-if="series.credits?.cast?.length" class="px-3 md:px-0 mt-3 md:mt-10">
                    <Scroller :items="series.credits?.cast || []" title="Cast" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="series?.youtubeVideos?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-10 md:hidden">
                    <Scroller :items="series?.youtubeVideos" title="Trailers and Clips" :pending="pending" title-icon="mdi-youtube">
                        <template v-slot:default="{ item }">
                            <VideoCard :item="item" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="series?.youtubeVideos?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-5 max-md:hidden">
                    <VideoGallery :videos="series.youtubeVideos" />
                </div>

                <div v-if="series?.images?.backdrops?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-10">
                    <GalleryScroller :images="series?.images?.backdrops" :pending="pending" />
                </div>


                <div v-if="series.recommendations?.results?.length" class="px-3 md:px-0 max-md:mt-3 md:mt-10">
                    <Scroller :items="series.recommendations?.results || []" title="Recommended" :pending="pending" />
                </div>

                <div v-if="series.similar?.results?.length" class="px-3 md:px-0 max-md:mt-3 md:mt-10">
                    <Scroller :items="series.similar?.results || []" title="Similar" :pending="pending" />
                </div>
            </div>
        </div>
        <div v-else-if="error" class="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <v-icon icon="mdi-alert-circle" size="64" class="text-red-500 mb-4"></v-icon>
            <h2 class="text-xl font-semibold mb-2">Error Loading Series</h2>
            <p class="text-neutral-400 mb-2">{{ error.message || 'An error occurred while loading the series.' }}</p>
            <v-btn @click="refresh()" class="mt-4" variant="outlined" color="primary">
                Try Again
            </v-btn>
        </div>
        <div v-else class="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <v-icon icon="mdi-television-off" size="64" class="text-neutral-500 mb-4"></v-icon>
            <h2 class="text-xl font-semibold mb-2">Series Not Found</h2>
            <p class="text-neutral-400 mb-2">The series you're looking for doesn't exist.</p>
            <p class="text-xs text-neutral-500 mb-4">Series ID: {{ $route.params.seriesId }}</p>
            <v-btn @click="$router.push('/')" class="mt-4" variant="outlined">
                Go Home
            </v-btn>
        </div>
        <Login ref="loginRef" />
        <v-dialog 
            v-model="showEpisodeDialog"
            max-width="800"
            :persistent="false"
            @click:outside="closeEpisodeDialog"
            @keydown.esc="closeEpisodeDialog"
            class="episode-modal"
        >
            <v-card class="episode-modal-card">
                <v-card-text class="pa-0">
                    <Episode :episode="selectedEpisode" :series="series" />
                </v-card-text>
                <v-card-actions class="justify-end pa-2">
                    <v-btn 
                        icon
                        variant="text"
                        @click="closeEpisodeDialog"
                        class="episode-close-btn"
                    >
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <v-snackbar v-model="snackbar" :timeout="10000" color="black" timer="white">
            <span class="text-sm">Updating latest ratings and watch links</span>
            <template v-slot:actions>
                <v-btn
                    color="white"
                    size="small"
                    variant="text"
                    @click="snackbar = false"
                >
                    Close
                </v-btn>
            </template>
        </v-snackbar>
    </div>
</template>

<script setup lang="ts">
import { userStore } from '~/plugins/state';
import { humanizeDateFull } from '~/utils/dateFormatter';
import { createTVSeriesLdSchema } from '~/utils/schema';
import { getTopicKey } from '~/utils/topics/commonUtils';
import _ from 'lodash';

const { status } = useAuth();

const updatingSeries = ref(false);
const isMounted = ref(false);
let isKeywordsExpanded = ref(false);
let isUpdated = false;
let snackbar = ref(false);
let showEpisodeDialog = ref(false);
let selectedEpisode = ref<any>({});
let seriesUpdateKey = ref(0);
const userData = userStore();
let loginRef = null as any;

onMounted(() => {
    isMounted.value = true;
    loginRef = ref(null);
    if (series.value?.canUpdate) {
        checkSeriesUpdate(series.value);
    }
    if (series.value?.id) {
        addToRecents();
    }
    watch(series, () => {
        if (series.value?.canUpdate) {
            checkSeriesUpdate(series.value);
        }
        if (series.value?.id) {
            addToRecents();
        }
    });
});

let language = computed(() => {
    if (series.value?.original_language !== 'en') {
        return LANGAUAGES.find(({iso_639_1}) => iso_639_1 === series.value?.original_language)?.english_name;
    }
    return null;
});

const languageTopicLink = computed(() => {
    if (!language.value) return null;
    return `/topics/${getTopicKey('language', language.value, 'tv')}`;
});

const share = () => {
    if (navigator.share) {
        navigator.share({
            title: series.value.name,
            text: series.value.description,
            url: 'https://themoviebrowser.com/series/' + series.value.id
        })
        .catch(console.error);
    } else {
        navigator.clipboard.writeText('https://themoviebrowser.com/series/' + series.value.id);
    }
}

const checkSeriesUpdate = async (seriesAPI: any) => {
    if (isUpdated) return;
    isUpdated = true;
    snackbar.value = true;
    const updatedSeries = await $fetch(`/api/series/${seriesAPI.id}?checkUpdate=true`)
    series.value = mapSeries(updatedSeries);
    snackbar.value = false;
    seriesUpdateKey.value += 1;
}

const showEpisode = (episode: any) => {
    selectedEpisode.value = episode;
    showEpisodeDialog.value = true;
}

const closeEpisodeDialog = () => {
    showEpisodeDialog.value = false;
}

const keywords = computed(() => {
    if (series.value?.keywords?.results?.length > 5 && !isKeywordsExpanded.value) {
        return series.value?.keywords?.results?.slice(0, 5);
    }
    return series.value?.keywords?.results || [];
});


const mapSeries = (series: any) => {
    series.credits.crew = _.sortBy(series.credits.crew, (person) => {
        if (person.job === 'Director') return 0;
        if (person.department === 'Directing') return 1;
        if (person.department === 'Writing') return 2;
        if (person.department === 'Production') return 3;
        if (person.department === 'Camera') return 4;
        return 100;
    });
    if (series.credits?.crew && series.created_by) {
        series.credits.crew.unshift(...(series.created_by).map(
            (created_by: any) => ({
                ...created_by,
                job: 'Created by'
            })
        ));
    }
    return {
        ...series,
        youtubeVideos: ( series.videos?.results?.filter((result: any) => result.site === 'YouTube') || [])?.sort(
            (a: any, b: any) => {
                const customOrder = ['Trailer', 'Teaser', 'Clip'];
                let indexA = customOrder.indexOf(a.type);
                let indexB = customOrder.indexOf(b.type);

                indexA = indexA === -1 ? customOrder.length : indexA;
                indexB = indexB === -1 ? customOrder.length : indexB;

                return indexA - indexB;
        }) || [],
    };
}
const route = useRoute()
const headers = useRequestHeaders(['cookie']) as HeadersInit

const { data: series, pending, error, refresh: refreshData } = await useFetch(`/api/series/${route.params.seriesId}`, {
    key: `series-${route.params.seriesId}`,
    headers,
    transform: (series: any) => {
        if (!series || typeof series !== 'object') {
            return null;
        }
        return mapSeries(series);
    },
    default: () => null,
    server: true
});

let { data: watchlist }: any = await useFetch(`/api/user/series/${route.params.seriesId}/watchList`, {
    key: `series-${route.params.seriesId}-watchlist`,
    headers,
    default: () => null,
    server: true
});

// Add refresh function to retry loading
const refresh = async () => {
    await refreshData();
};

const addToRecents = () => {
    if (status.value !== 'authenticated' || series.value.adult) return;
    userData.addToRecents(series.value);
}

const seasonSelected = async (season: any) => {
    const seasonData = await $fetch(`/api/series/${series.value.id}/season/${season?.season_number}`).catch((err) => {
        console.log(err);
        return {};
    });
    
    // Trigger reactivity by reassigning the entire series object
    series.value = {
        ...series.value,
        selectedSeason: seasonData
    };
}

const seriesStatusColor = computed(() => {
    switch (series.value?.status) {
        case 'Returning Series':
            return '#333';
        case 'Ended':
            return '#3a983a';
        case 'Canceled':
            return 'red';
    }
});

const statusText = computed(() => {
    if (series.value?.status === 'Returning Series' && series.value?.next_episode_to_air) {
        return 'Ongoing';
    } else if (series.value?.status === 'Ended') {
        return 'Ended';
    } else if (series.value?.status === 'Returning Series') {
        return `Season ${(series.value?.last_episode_to_air?.season_number + 1)} upcoming`;
    } else {
        return series.value?.status;
    }
});

const updateSeries = async () => {
    if (status.value !== 'authenticated') {
        showLogin();
        return;
    }
    updatingSeries.value = true;
    const updatedSeries = await $fetch(`/api/series/${series.value.id}?force=true`);
    series.value = mapSeries(updatedSeries);
    updatingSeries.value = false;
    seriesUpdateKey.value += 1;
}

const showLogin = () => {
    loginRef.value.openDialog();
}

const keywordClicked = (keyword: any) => {
    const discoverQuery = {
        ...baseDiscoverQuery,
        media_type: 'tv',
        with_keywords: [{
            name: keyword.name,
            id: keyword.id
        }]
    };
    useRouter().push({
        name: 'browse',
        query: {
            discover: btoa(encodeURIComponent(JSON.stringify(discoverQuery)))
        }
    });
}

const watchListClicked = () => {
    if (status.value !== 'authenticated') {
        showLogin();
        return;
    }
    watchlist.value = !watchlist.value;
    if (watchlist.value === true) {
        $fetch(`/api/user/series/${series.value.id}/watchList`, {
            method: 'POST',
        })
    } else {
        $fetch(`/api/user/series/${series.value.id}/watchList`, {
            method: 'DELETE',
        })
    }
}

useHead(() => {
    return {
        title: `${series.value?.name} | The Movie Browser`,
        meta: [
            {
                hid: 'description',
                name: 'description',
                content: series.value?.overview
            },
            {
                hid: 'og:title',
                property: 'og:title',
                content: series.value?.name
            },
            {
                hid: 'og:description',
                property: 'og:description',
                content: series.value?.overview
            },
            {
                hid: 'og:image',
                property: 'og:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${series.value?.backdrop_path}`
            },
            {
                hid: 'og:url',
                property: 'og:url',
                content: `https://themoviebrowser.com/series/${series.value?.id}`
            },
            {
                hid: 'og:type',
                property: 'og:type',
                content: 'movie'
            },
            {
                hid: 'og:site_name',
                property: 'og:site_name',
                content: 'Movie Browser'
            },
            {
                hid: 'twitter:card',
                name: 'twitter:card',
                content: 'summary_large_image'
            },
            {
                hid: 'twitter:site',
                name: 'twitter:site',
                content: '@movie-browser'
            },
            {
                hid: 'twitter:title',
                name: 'twitter:title',
                content: series.value?.name
            },
            {
                hid: 'twitter:description',
                name: 'twitter:description',
                content: series.value?.overview
            },
            {
                hid: 'twitter:image',
                name: 'twitter:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${series.value?.backdrop_path}`
            },
            {
                hid: 'twitter:url',
                name: 'twitter:url',
                content: `https://themoviebrowser.com/series/${series.value?.id}`
            }
        ],
        htmlAttrs: {
            lang: 'en'
        },
        link: [
            {
                rel: 'icon',
                type: 'image/x-icon',
                href: '/favicon.ico'
            },
            {
                rel: 'canonical',
                href: `https://themoviebrowser.com/series/${series.value?.id}/${getUrlSlug(series.value?.name || '')}`
            }
        ],
        script: [
            {
                hid: 'ld-json',
                type: 'application/ld+json',
                innerHTML: JSON.stringify(createTVSeriesLdSchema(series.value))
            }
        ]
    };
});
</script>

<style scoped lang="less">
@wide-image-height: 15rem;
:deep(.wide-image) {
    height: @wide-image-height;
    width: calc(@wide-image-height * 16/9);
}
:deep(.wide-card) {
    width: calc(@wide-image-height * 16/9);
}
@media (max-width: 768px) {
    @wide-image-height: 7rem;
    :deep(.wide-image) {
        height: @wide-image-height;
        width: calc(@wide-image-height * 16/9);
    }
    :deep(.wide-card) {
        width: calc(@wide-image-height * 16/9);
    }
}
:deep(.v-skeleton-loader) {
    .v-skeleton-loader__bone {
        &.v-skeleton-loader__image {
            height: 100%;
        }
    }
}
.pending {
    :deep(.v-skeleton-loader) {
        align-items: start;
        .v-skeleton-loader__bone {
            &.v-skeleton-loader__image {
                height: 50vh;
            }
        }
    }
}

@media (max-width: 768px) {
    :deep(.v-field) {
        height: 1.7rem;
        .v-field__field {
            height: 1.7rem;
            margin-top: -5px;
            .v-select__selection-text {
                margin-top: -5px;
                font-size: 14px;
            }
        }
        .v-label {
            font-size: 12px;
        }
        .v-field__input {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }
    }
}

// Episode Modal Styles
.episode-modal {
    :deep(.v-overlay__content) {
        max-width: 90vw !important;
        max-height: 90vh !important;
    }
    
    .episode-modal-card {
        background: linear-gradient(135deg, rgba(38, 38, 38, 0.95), rgba(18, 18, 18, 0.95)) !important;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6) !important;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(20px);
        position: relative;
    }
    
    .episode-close-btn {
        position: absolute !important;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 10;
        background: rgba(0, 0, 0, 0.6) !important;
        color: white !important;
        
        &:hover {
            background: rgba(0, 0, 0, 0.8) !important;
            transform: scale(1.05);
        }
    }
}
</style>