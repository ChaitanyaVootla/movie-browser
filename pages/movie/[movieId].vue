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
                    <div class="identify flex max-md:justify-center lg:justify-start gap-6 max-md:mb-3 md:mb-5">
                        <v-btn :key="`${isMounted}`" @click="watchClicked()" :prepend-icon="watched?'mdi-check':'mdi-circle-outline'" :color="(watched === true)?'primary':''"
                            :elevation="5" class="px-5" :size="$vuetify.display.mdAndUp?'default':'small'" >
                            {{ watched?'Watched':'Watched ?' }}
                        </v-btn>
                        <v-btn :key="`${isMounted}`" @click="watchListClicked()" prepend-icon="mdi-playlist-plus" :color="(watchlist === true)?'primary':''"
                            :elevation="5" class="px-5" :size="$vuetify.display.mdAndUp?'default':'small'" >
                            {{ watchlist?'In Watch List':'Add to list' }}
                        </v-btn>
                    </div>
                    <v-card class="px-5 py-2" color="#151515">
                        <div class="flex items-baseline justify-start gap-2">
                            <div v-if="movie.release_date" class="text-sm md:text-lg">Released</div>
                            <NuxtTime v-if="movie.release_date" class="text-neutral-200 mt-2 block text-xs md:text-base"
                                :datetime="new Date(movie.release_date)" year="numeric" month="long" day="numeric" />
                        </div>
                        <div class="text-neutral-300 mt-1 md:mt-3 text text-xs md:text-base">
                            {{ movie.overview }}
                        </div>
                        <NuxtLink :key="`${isMounted}`" v-if="movie.imdb_id" :to="`https://www.imdb.com/title/${movie.imdb_id}/parentalguide`" target="blank"
                            noreferrer noopener class="mt-3 block">
                            <v-btn prepend-icon="mdi-eye-outline" variant="tonal" :size="$vuetify.display.mdAndUp?'small':'x-small'" color="#aaa">
                                Parental Guide
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
                                class="ml-3" color="#bbb">
                                Request Update
                            </v-btn>
                        </div>
                    </v-card>
                </div>

                <div v-if="movie?.collectionDetails?.parts?.length" class="px-3 md:px-0 cast mt-10">
                    <Scroller :items="movie.collectionDetails.parts || []" :title="movie.collectionDetails.name" :pending="pending" />
                </div>

                <div class="px-3 md:px-20 mt-3 md:mt-10">
                    <Scroller :items="movie.credits?.cast || []" title="Cast" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div class="px-3 md:px-20 mt-3 md:mt-10">
                    <Scroller :items="movie.credits?.crew || []" title="Crew" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="movie?.youtubeVideos?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-5">
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

                <div v-if="movie?.images?.backdrops?.length" class="px-3 md:px-20 max-md:mt-3 md:mt-10">
                    <Scroller :items="movie?.images?.backdrops" title="Image Gallery" :pending="pending"
                        title-icon="mdi-image-multiple-outline">
                        <template v-slot:default="{ item }">
                            <GalleryImageCard :item="item" />
                        </template>
                    </Scroller>
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
            Updating latest ratings and watch links
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
    if (isRecentsUpdated) return;
    const englishBackdrop = movie?.value?.images?.backdrops?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path
    isRecentsUpdated = true;
    $fetch(`/api/user/recents`,
        {
            headers,
            method: 'POST',
            body: JSON.stringify({
                itemId: useRoute().params.movieId,
                isMovie: true,
                poster_path: movie.value?.poster_path,
                backdrop_path: englishBackdrop || movie.value?.backdrop_path,
                title: movie.value?.title,
            })
        }
    );
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

let { data: watched }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-watched`,
    () => $fetch(`/api/user/movie/${useRoute().params.movieId}/watched`, { headers }).catch((err) => {
        console.log(err);
        return {};
    })
);

let { data: watchlist }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-watchList`,
    () => $fetch(`/api/user/movie/${useRoute().params.movieId}/watchList`, { headers }).catch((err) => {
        console.log(err);
        return {};
    })
);

const watchClicked = () => {
    if (status.value !== 'authenticated') {
        loginRef.value.openDialog();
        return;
    }
    watched.value = !watched.value;
    if (watched.value === true) {
        $fetch(`/api/user/movie/${movie.value.id}/watched`, {
            method: 'POST',
        })
    } else {
        $fetch(`/api/user/movie/${movie.value.id}/watched`, {
            method: 'DELETE',
        })
    }
}

const watchListClicked = () => {
    if (status.value !== 'authenticated') {
        loginRef.value.openDialog();
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

const updateMovie = async () => {
    if (status.value !== 'authenticated') {
        loginRef.value.openDialog();
        return;
    }
    updatingMovie.value = true;
    const updatedMovie = await $fetch(`/api/movie/${movie.value.id}?force=true`);
    movie.value = mapMovie(updatedMovie);
    updatingMovie.value = false;
    movieUpdateKey.value += 1;
}

const { data: aiRecommendationsAPI }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-recommend`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}/recommend`, { headers }).catch((err) => {
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
    useRouter().push({
        name: 'browse',
        query: {
            media_type: 'movie',
            with_keywords: keyword.id
        }
    });
}

const languageClicked = () => {
    useRouter().push({
        name: 'browse',
        query: {
            media_type: 'movie',
            with_original_language: movie.value.original_language
        }
    });
}

useHead(() => {
    return {
        title: movie.value?.title,
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
</style>