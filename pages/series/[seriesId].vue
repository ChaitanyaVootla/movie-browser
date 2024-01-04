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
        <div v-else>
            <DetailsTopInfo :item="series" :watched="false"/>
            <div>
                <div class="px-3 md:mx-12 mt-3">
                    <div class="identify flex max-md:justify-center lg:justify-start gap-6 mb-0 md:mb-5">
                        <div v-if="series.status">
                            <v-chip :key="`${isMounted}`" rounded :color="seriesStatusColor" density="default"
                                :size="$vuetify.display.mdAndUp?'large':'small'" variant="elevated" >
                                Status <b class="ml-2 font-medium">{{ statusText }}</b>
                            </v-chip>
                        </div>
                        <v-chip :key="`${isMounted}`" rounded @click="watchListClicked()" prepend-icon="mdi-playlist-plus"
                            :color="(watchlist === true)?'primary':'#333'" variant="flat" :size="$vuetify.display.mdAndUp?'large':'small'"
                            class="px-5" >
                            {{ watchlist?'In Watch List':'Add to list' }}
                        </v-chip>
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
                            <div class="flex flex-col gap-3 mt-2 cursor-pointer" @click="showEpisode(item)">
                                <div class="text-neutral-400 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4
                                    text-xs md:text-sm -mb-1 flex items-center justify-between mr-1">
                                    <div class="flex gap-2">
                                        Episode {{ item.episode_number }}
                                        <div v-if="item.air_date">
                                            -
                                        <NuxtTime :datetime="new Date(item.air_date)"
                                            year="numeric" month="long" day="numeric" class="ml-1" />
                                        </div>
                                    </div>
                                    <div v-if="(new Date(item.air_date)).getTime() > Date.now()">
                                        <v-chip rounded size="small">
                                            <span class="text-neutral-200">Upcoming</span>
                                        </v-chip>
                                    </div>
                                </div>
                                <v-img :src="`https://image.tmdb.org/t/p/w500${item.still_path}`"
                                    class="rounded-lg mr-2 wide-image"
                                    :alt="item.name">
                                    <template v-slot:placeholder>
                                        <v-skeleton-loader class="wide-image" type="image" />
                                    </template>
                                    <template v-slot:error>
                                        <v-skeleton-loader class="wide-image" type="image" >
                                            <div></div>
                                        </v-skeleton-loader>
                                    </template>
                                </v-img>
                                <div class="text-neutral-200 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4
                                    text-xs md:text-base">
                                    {{ item.name }}
                                </div>
                            </div>
                        </template>
                    </Scroller>
                </div>

                <div class="px-3 md:mx-12 overview max-md:mt-5 md:mt-10">
                    <v-card class="px-4 py-4" color="#151515">
                        <div class="text-md md:text-lg">Overview</div>
                        <div class="text-sm md:text-base text-neutral-300 mt-2 text">
                            {{ series.overview }}
                        </div>

                        <NuxtLink :key="`${isMounted}`" v-if="series.external_ids.imdb_id" :to="`https://www.imdb.com/title/${series.external_ids.imdb_id}/parentalguide`" target="blank"
                            noreferrer noopener class="mt-3 block">
                            <v-btn prepend-icon="mdi-eye-outline" variant="tonal" :size="$vuetify.display.mdAndUp?'small':'x-small'" color="#aaa">
                                Parental Guide
                            </v-btn>
                        </NuxtLink>
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
                            Last Updated: {{ humanizeDateFull(series.updatedAt || 0) }}
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

                <div v-if="series.credits?.crew?.length" class="px-3 md:px-0 mt-3 md:mt-10">
                    <Scroller :items="series.credits?.crew" title="Crew" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="series.recommendations?.results?.length" class="px-3 md:px-0 mt-3 md:mt-10">
                    <Scroller :items="series.recommendations?.results || []" title="Recommended" :pending="pending" />
                </div>

                <div v-if="series.similar?.results?.length" class="px-3 md:px-0 mt-3 md:mt-10">
                    <Scroller :items="series.similar?.results || []" title="Similar" :pending="pending" />
                </div>
            </div>
        </div>
        <Login ref="loginRef" />
        <v-dialog v-model="showEpisodeDialog">
            <Episode :episode="selectedEpisode" />
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
import { humanizeDateFull } from '~/utils/dateFormatter';

const { status } = useAuth();

const updatingSeries = ref(false);
const isMounted = ref(false);
let isKeywordsExpanded = ref(false);
let showEpisodeDialog = ref(false);
let selectedEpisode = ref<any>({});
let seriesUpdateKey = ref(0);
let loginRef = null as any;

onMounted(() => {
    isMounted.value = true;
    loginRef = ref(null);
});

const showEpisode = (episode: any) => {
    selectedEpisode.value = episode;
    showEpisodeDialog.value = true;
}

const keywords = computed(() => {
    if (series.value?.keywords?.results?.length > 5 && !isKeywordsExpanded.value) {
        return series.value?.keywords?.results?.slice(0, 5);
    }
    return series.value?.keywords?.results || [];
});


const mapSeries = (series: any) => {
    series.credits.crew = useSortBy(series.credits.crew, (person) => {
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
            if (a.type === 'Trailer' && b.type !== 'Trailer') {
                return -1;
            }
            if (a.type !== 'Trailer' && b.type === 'Trailer') {
                return 1;
            }
            if (a.type === 'Teaser' && b.type !== 'Teaser') {
                return -1;
            }
            if (a.type !== 'Teaser' && b.type === 'Teaser') {
                return 1;
            }
            return 0;
        }) || [],
    };
}
const { data: series, pending } = await useLazyAsyncData(`seriesDetails-${useRoute().params.seriesId}`,
    () => $fetch(`/api/series/${useRoute().params.seriesId}`).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (series: any) => mapSeries(series),
        default: () => ({})
    }
);

const headers = useRequestHeaders(['cookie']) as HeadersInit
let { data: watchlist }: any = await useLazyAsyncData(`seriesDetails-${useRoute().params.seriesId}-watchList`,
    () => $fetch(`/api/user/series/${useRoute().params.seriesId}/watchList`, { headers }).catch((err) => {
        console.log(err);
        return {};
    })
);

const addToRecents = () => {
    $fetch(`/api/user/recents`,
        {
            headers,
            method: 'POST',
            body: JSON.stringify({
                itemId: useRoute().params.seriesId,
                isMovie: false,
                poster_path: series.value?.poster_path,
                backdrop_path: series.value?.backdrop_path,
                name: series.value?.name,
            })
        }
    );
}

// add to recents when movie is loaded
if (series.value?.id) {
    addToRecents();
}

watch(series, () => {
    if (series.value?.id) {
        addToRecents();
    }
});

const seasonSelected = async (season: any) => {
    series.value.selectedSeason = await $fetch(`/api/series/${series.value.id}/season/${season?.season_number}`).catch((err) => {
        console.log(err);
        return {};
    });
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
        loginRef.value.openDialog();
        return;
    }
    updatingSeries.value = true;
    const updatedSeries = await $fetch(`/api/series/${series.value.id}?force=true`);
    series.value = mapSeries(updatedSeries);
    updatingSeries.value = false;
    seriesUpdateKey.value += 1;
}

const keywordClicked = (keyword: any) => {
    useRouter().push({
        name: 'browse',
        query: {
            media_type: 'tv',
            with_keywords: keyword.id
        }
    });
}

const watchListClicked = () => {
    if (status.value !== 'authenticated') {
        loginRef.value.openDialog();
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
        title: series.value?.name,
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
                content: `https://movie-browser.vercel.app/series/${series.value?.id}`
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
                content: `https://movie-browser.vercel.app/series/${series.value?.id}`
            }
        ]
    };
});
</script>

<style scoped lang="less">
@wide-image-height: 12rem;
:deep(.wide-image) {
    height: @wide-image-height;
    width: calc(@wide-image-height * 16/9);
}
@media (max-width: 768px) {
    @wide-image-height: 7rem;
    :deep(.wide-image) {
        height: @wide-image-height;
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
</style>