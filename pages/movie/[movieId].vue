<template>
    <div :key="`${movieUpdateKey}`">
        <div v-if="pending" class="pending w-full h-full">
            <v-skeleton-loader
                class="hidden md:block m-5"
                type="card, article"
                color="transparent"
                :elevation="20"
            ></v-skeleton-loader>
        </div>
        <div v-else>
            <DetailsTopInfo :item="movie" :watched="watched" @watch-clicked="watchClicked"/>
            <div class="max-md:pt-3 md:pt-5">
                <div class="px-3 md:mx-12 overview">
                    <div class="flex max-md:justify-center gap-2 md:gap-4 max-md:mb-3 md:mb-5 overflow-x-auto">
                        <UserRating itemType="movie" :itemId="movie.id" @show-login="showLogin"/>
                        <v-btn :key="`${isMounted}`" @click="watchClicked()" :icon="watched?'mdi-check':'mdi-eye-outline'" :color="(watched === true)?'primary':''"
                            :elevation="5" :size="$vuetify.display.mdAndUp?'small':'x-small'" >
                        </v-btn>
                        <v-btn :key="`${isMounted}`" @click="watchListClicked()" icon="mdi-playlist-plus" :color="(watchlist === true)?'primary':''"
                            :elevation="5" :size="$vuetify.display.mdAndUp?'small':'x-small'" >
                        </v-btn>
                        <v-btn :key="`${isMounted}`" @click="share" icon="mdi-share" :elevation="5" :size="$vuetify.display.mdAndUp?'small':'x-small'"
                            :color="''">
                        </v-btn>
                    </div>
                    <v-card class="px-5 py-2" color="#151515">
                        <h1 class="md:text-lg font-semibold flex items-center gap-4">
                            {{ movie.title }}
                        </h1>
                        <h2 class="mt-1">
                            <div class="flex items-baseline justify-start gap-2 md:gap-4 flex-wrap">
                                <div v-if="$vuetify.display.mdAndUp" class="font-semibold text-sm md:text-base">Overview</div>
                                <div class="flex items-center gap-2">
                                    <div v-if="movie.release_date && $vuetify.display.mdAndUp" class="text-sm md:text-tiny">Released</div>
                                    <NuxtTime v-if="movie.release_date" class="text-neutral-200 block text-xs md:text-tiny"
                                        :datetime="new Date(movie.release_date)" year="numeric" month="long" day="numeric" />
                                </div>
                                <div v-if="director" class="flex items-center gap-2 text-sm">
                                    <div class="text-neutral-300 text-xs md:text-sm">Directed by</div>
                                    <NuxtLink :to="`/person/${director?.id}`">
                                        <div class="flex items-center gap-1 underline underline-offset-2">
                                            <div>{{director?.name}}</div>
                                        </div>
                                    </NuxtLink>
                                </div>
                            </div>
                        </h2>
                        <div>
                            <div class="text-neutral-300 mt-1 md:mt-3 text text-xs md:text-sm">
                                {{ movie.overview }}
                            </div>
                        </div>
                        <NuxtLink :key="`${isMounted}`" v-if="movie.imdb_id" :to="`https://www.imdb.com/title/${movie.imdb_id}/parentalguide`" target="blank"
                            noreferrer noopener class="mt-3 block">
                            <v-btn variant="tonal" :size="$vuetify.display.mdAndUp?'small':'x-small'" color="#aaa" prepend-icon="mdi-exclamation-thick">
                                content warning
                            </v-btn>
                        </NuxtLink>
                        <div :key="`${isMounted}`" class="flex flex-wrap gap-2 md:gap-3 mt-2 md:mt-5">
                            <v-chip v-if="language" class="rounded-pill cursor-pointer" color="#ddd"
                                :size="$vuetify.display.mdAndUp?'small':'x-small'" @click="languageClicked()">
                                {{ language }}
                            </v-chip>
                            <v-chip v-for="keyword in keywords"
                                class="rounded-pill cursor-pointer" :color="'#ddd'"
                                :size="$vuetify.display.mdAndUp?'small':'x-small'" @click="keywordClicked(keyword)">
                                {{ keyword.name }}
                            </v-chip>
                            <v-chip v-if="movie?.keywords?.keywords?.length > 5" @click="isKeywordsExpanded = !isKeywordsExpanded"
                                class="rounded-pill cursor-pointer" :color="'#ddd'" :size="$vuetify.display.mdAndUp?'small':'x-small'"
                                variant="text">
                                <span v-if="isKeywordsExpanded">Collpase</span>
                                <span v-else>+{{ movie?.keywords?.keywords?.length - 5 }} more</span>
                            </v-chip>
                        </div>
                        <div class="mt-4 text-2xs md:text-sm text-neutral-400 flex items-baseline">
                            Last Updated: {{ humanizeDateFull(movie.updatedAt) }}
                            <v-btn @click="updateMovie" :loading="updatingMovie" variant="text" size="x-small"
                                class="ml-3" color="#bbb" prepend-icon="mdi-refresh">
                                Request Update
                            </v-btn>
                        </div>
                    </v-card>
                </div>

                <div v-if="movie?.collectionDetails?.parts?.length" class="px-3 md:px-0 cast mt-10">
                    <Scroller :items="collectionParts || []" :title="movie.collectionDetails.name" :pending="pending" />
                </div>

                <div class="px-3 md:px-20 mt-5 md:mt-10">
                    <Scroller :items="movie.credits?.cast || []" title="Cast" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                    <!-- <Scroller :items="movie.credits?.crew || []" title="Crew" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller> -->
                </div>

                <div v-if="movie?.youtubeVideos?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-5 md:hidden">
                    <Scroller :items="movie?.youtubeVideos" title="Trailers and Clips" :pending="pending"
                        title-icon="mdi-youtube">
                        <template v-slot:title="{}">
                            <NuxtImg src="images/youtube.svg" class="h-6 mb-2"></NuxtImg>
                        </template>
                        <template v-slot:default="{ item }">
                            <VideoCard :item="item" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="movie?.youtubeVideos?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-5 max-md:hidden">
                    <VideoGallery :videos="movie.youtubeVideos" />
                </div>

                <!-- <div v-if="movie?.images?.backdrops?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-10">
                    <PhotoGallery :images="movie?.images?.backdrops" :pending="pending" />
                </div> -->

                <div v-if="movie?.images?.backdrops?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-10">
                    <GalleryScroller :images="movie?.images?.backdrops" :pending="pending" />
                </div>

                <div v-if="aiRecommendations?.length" class="px-3 md:px-0 max-md:mt-3 md:mt-10">
                    <Scroller :items="aiRecommendations || []" title="AI Recommendations" :pending="pending" />
                </div>

                <div v-if="!aiRecommendations?.length && movie.recommendations?.results?.length" class="px-3 md:px-0 max-md:mt-3 md:mt-10">
                    <Scroller :items="movie.recommendations.results || []" title="Recommended" :pending="pending" />
                </div>

                <div v-if="movie.similar?.results?.length" class="mt-10">
                    <Scroller :items="movie.similar.results || []" title="Similar" :pending="pending" />
                </div>
            </div>
        </div>
        <Login ref="loginRef" />
        <v-snackbar v-model="snackbar" :timeout="10000" color="black" timer="white">
            <span class="text-xs">Updating latest ratings and watch links</span>
            <template v-slot:actions>
                <v-btn
                    color="white"
                    size="x-small"
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
import { SITE_TITLE_TEXT } from '~/utils/constants';
import { humanizeDateFull } from '~/utils/dateFormatter';

let movie = ref({} as any);
let updatingMovie = ref(false);
let aiRecommendations = ref([] as any);
let isMounted = ref(false);
let isKeywordsExpanded = ref(false);
let snackbar = ref(false);
const { status } = useAuth();
let loginRef = null as any;
let movieUpdateKey = ref(0);
let isUpdated = false;
let isRecentsUpdated = false;
const userData = userStore();
let language = computed(() => {
    if (movie.value?.original_language !== 'en') {
        return LANGAUAGES.find(({iso_639_1}) => iso_639_1 === movie.value?.original_language)?.english_name;
    }
    return null;
});

const keywords = computed(() => {
    if (movie.value?.keywords?.keywords?.length > 5 && !isKeywordsExpanded.value) {
        return movie.value?.keywords?.keywords?.slice(0, 5);
    }
    return movie.value?.keywords?.keywords || [];
});

const share = () => {
    if (navigator.share) {
        navigator.share({
            title: movie.value.title,
            text: movie.value.description,
            url: 'https://themoviebrowser.com/movie/' + movie.value.id
        })
        .catch((error) => console.log('Error sharing:', error));
    } else {
        console.log('Web Share API not supported');
        navigator.clipboard.writeText('https://themoviebrowser.com/movie/' + movie.value.id);
    }
}

const checkMovieUpdate = async (APImovie: any) => {
    if (isUpdated) return;
    isUpdated = true;
    updatingMovie.value = true;
    snackbar.value = true;
    const updatedMovie = await $fetch(`/api/movie/${APImovie.id}?checkUpdate=true`)
    movie.value = mapMovie(updatedMovie);
    updatingMovie.value = false;
    snackbar.value = false;
    movieUpdateKey.value += 1;
}

onMounted(() => {
    isMounted.value = true;
    loginRef = ref(null);
    if (movie.value?.canUpdate) {
        checkMovieUpdate(movie.value);
    }
    if (movie.value?.id) {
        addToRecents();
    }
    watch(movie, () => {
        if (movie.value?.canUpdate) {
            checkMovieUpdate(movie.value);
        }
        if (movie.value?.id) {
            addToRecents();
        }
    });
});

const addToRecents = () => {
    if (isRecentsUpdated || movie?.value?.adult) return;
    userData.addToRecents(movie.value);
    isRecentsUpdated = true;
}

const mapMovie = (movie: any) => {
    if (!movie) return {};
    if (movie?.release_date) {
        movie.releaseYear = movie?.release_date?.split('-')[0];
        movie.fullReleaseString = movie?.release_date;
    }
    movie.credits.crew = useSortBy(movie.credits.crew, (person) => {
        if (person.job === 'Director') return 0;
        if (person.department === 'Directing') return 1;
        if (person.department === 'Writing') return 2;
        if (person.department === 'Production') return 3;
        if (person.department === 'Camera') return 4;
        return 100;
    });
    return {
        ...movie,
        youtubeVideos: ( movie.videos?.results?.filter((result: any) => result.site === 'YouTube') || [])?.sort(
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

const headers = useRequestHeaders(['cookie']) as HeadersInit
const { data: movieAPI, pending } = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}`, {
        headers
    }).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (movie: any) => mapMovie(movie)
    }
);
movie = movieAPI;

let watched = computed(() => {
    if (status.value !== 'authenticated' || !movie?.value?.id) return false;
    return userData.isMovieWatched(movie.value.id) ? true : false;
});

let director = computed(() => {
    return movie.value?.credits?.crew?.find((person: any) => person.job === 'Director');
});
let collectionParts = computed(() => {
    if (!movie?.value?.collectionDetails?.parts) return [];
    return movie.value.collectionDetails.parts.map((part: any) => ({
        ...part,
        infoText: part.release_date ? new Date(part.release_date).getFullYear() : ''
    }));
});

let watchlist = ref(false);
let computedWatchlist = computed(() => {
    if (status.value !== 'authenticated' || !movie?.value?.id) return false;
    return userData.isMovieInWatchList(movie.value.id) ? true : false;
});

watchlist.value = computedWatchlist.value;
watch(computedWatchlist, (newValue) => {
    watchlist.value = newValue;
});

const watchClicked = () => {
    if (status.value !== 'authenticated') {
        showLogin();
        return;
    }
    userData.toggleWatchMovie(movie.value.id);
}

const watchListClicked = () => {
    if (status.value !== 'authenticated') {
        showLogin();
        return;
    }
    watchlist.value = !watchlist.value;
    if (watchlist.value === true) {
        $fetch(`/api/user/movie/${movie.value.id}/watchList`, {
            method: 'POST',
        })
    } else {
        $fetch(`/api/user/movie/${movie.value.id}/watchList`, {
            method: 'DELETE',
        })
    }
}

const showLogin = () => {
    loginRef.value.openDialog();
}

const updateMovie = async () => {
    if (status.value !== 'authenticated') {
        showLogin();
        return;
    }
    updatingMovie.value = true;
    const updatedMovie = await $fetch(`/api/movie/${movie.value.id}?force=true`);
    movie.value = mapMovie(updatedMovie);
    updatingMovie.value = false;
    movieUpdateKey.value += 1;
}

const { data: aiRecommendationsAPI }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-recommend`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}/recommend?ratingGte=6`, { headers }).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (movies: any) => {
            return movies;
        }
    }
);
aiRecommendations = aiRecommendationsAPI;

const keywordClicked = (keyword: any) => {
    const discoverQuery = {
        ...baseDiscoverQuery,
        media_type: 'movie',
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

const languageClicked = () => {
    const discoverQuery = {
        ...baseDiscoverQuery,
        media_type: 'movie',
        with_original_language: movie.value.original_language
    }
    useRouter().push({
        name: 'browse',
        query: {
            discover: btoa(encodeURIComponent(JSON.stringify(discoverQuery)))
        }
    });
}

useHead(() => {
    return {
        title: `${movie.value?.title} | ${movie.value?.releaseYear} Movie | The Movie Browser`,
        meta: [
            {
                hid: 'description',
                name: 'description',
                content: movie.value?.overview
            },
            {
                hid: 'og:title',
                property: 'og:title',
                content: movie.value?.title
            },
            {
                hid: 'og:description',
                property: 'og:description',
                content: movie.value?.overview
            },
            {
                hid: 'og:image',
                property: 'og:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${movie.value?.backdrop_path}`
            },
            {
                hid: 'og:url',
                property: 'og:url',
                content: `https://themoviebrowser.com/movie/${movie.value?.id}`
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
                content: movie.value?.title
            },
            {
                hid: 'twitter:description',
                name: 'twitter:description',
                content: movie.value?.overview
            },
            {
                hid: 'twitter:image',
                name: 'twitter:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${movie.value?.backdrop_path}`
            },
            {
                hid: 'twitter:url',
                name: 'twitter:url',
                content: `https://themoviebrowser.com/movie/${movie.value?.id}`
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
            }
        ],
        script: [
            {
                hid: 'ld-json',
                type: 'application/ld+json',
                innerHTML: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'Movie',
                    url: `https://themoviebrowser.com/movie/${movie.value?.id}`,
                    name: movie.value?.title,
                    description: movie.value?.overview,
                    image: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${movie.value?.poster_path}`,
                    genre: movie.value?.genres?.map((genre: any) => genre.name),
                    datePublished: movie.value?.release_date,
                    dateCreated: movie.value?.release_date,
                    director: {
                        '@type': 'Person',
                        name: movie.value?.credits?.crew?.find((person: any) => person.job === 'Director')?.name,
                    },
                    actor: movie.value?.credits?.cast?.slice(0, 5).map((person: any) => ({
                        '@type': 'Person',
                        name: person.name
                    })),
                    aggregateRating: {
                        '@type': 'AggregateRating',
                        ratingValue: movie.value?.vote_average,
                        bestRating: 10,
                        worstRating: 1,
                        ratingCount: movie.value?.vote_count,
                    }
                })
            }
        ]
    };
});
</script>

<style scoped lang="less">
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
.overview {
    ::-webkit-scrollbar {
        display: none;
    }
}
</style>