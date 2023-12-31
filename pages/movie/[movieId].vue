<template>
    <div>
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
            <div class="pt-5">
                <div class="px-3 md:mx-12 overview">
                    <div class="identify flex max-md:justify-center lg:justify-start gap-6 mb-5">
                        <v-btn @click="watchClicked()" :prepend-icon="watched?'mdi-check':'mdi-circle-outline'" :color="(watched === true)?'primary':''"
                            :elevation="5" class="px-5" >
                            {{ watched?'Watched':'Watched ?' }}
                        </v-btn>
                        <v-btn @click="watchListClicked()" prepend-icon="mdi-playlist-plus" :color="(watchlist === true)?'primary':''"
                            :elevation="5" class="px-5" >
                            {{ watchlist?'In Watch List':'Add to list' }}
                        </v-btn>
                    </div>
                    <v-card class="px-5 py-2" color="#151515">
                        <div class="flex items-baseline justify-start gap-2">
                            <div class="text-sm md:text-xl">Released</div>
                            <NuxtTime v-if="movie.release_date" class="text-neutral-200 mt-2 block text-xs md:text-base"
                                :datetime="new Date(movie.release_date)" year="numeric" month="long" day="numeric" />
                        </div>
                        <div class="text-neutral-300 mt-1 md:mt-3 text text-xs md:text-base">
                            {{ movie.overview }}
                        </div>
                        <div class="flex flex-wrap gap-1 md:gap-3 mt-2 md:mt-5">
                            <v-chip v-for="keyword in (movie?.keywords?.keywords || [])" class="rounded-pill cursor-pointer" :color="'#ddd'"
                                :size="$vuetify.display.mobile?'x-small':'default'" @click="keywordClicked(keyword)">
                                {{ keyword.name }}
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

                <div v-if="aiRecommendations?.length" class="px-3 md:px-0 mt-3 md:mt-10">
                    <Scroller :items="aiRecommendations || []" title="AI Recommendations" :pending="pending" />
                </div>

                <div v-if="!aiRecommendations?.length && movie.recommendations?.results?.length" class="px-3 md:px-0 mt-3 md:mt-10">
                    <Scroller :items="movie.recommendations.results || []" title="Recommended" :pending="pending" />
                </div>

                <!-- <div v-if="movie.similar?.results?.length" class="mt-10">
                    <Scroller :items="movie.similar.results || []" title="Similar" :pending="pending" />
                </div> -->
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useAuth } from '#imports'
import { humanizeDateFull } from '~/utils/dateFormatter';
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const { status } = useAuth();

let movie = ref({} as any);
let updatingMovie = ref(false);
let aiRecommendations = ref([] as any);
const headers = useRequestHeaders(['cookie']) as HeadersInit
const { data: movieAPI, pending } = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}`, {
        headers
    }).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (movie: any) => {
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

const addToRecents = () => {
    $fetch(`/api/user/recents`,
        {
            headers,
            method: 'POST',
            body: JSON.stringify({
                itemId: useRoute().params.movieId,
                isMovie: true,
                poster_path: movie.value?.poster_path,
                backdrop_path: movie.value?.backdrop_path,
                title: movie.value?.title,
            })
        }
    );
}

// add to recents when movie is loaded
if (movie.value?.id) {
    addToRecents();
}

watch(movie, () => {
    if (movie.value?.id) {
        addToRecents();
    }
});

const watchClicked = () => {
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
    updatingMovie.value = true;
    await $fetch(`/api/movie/${movie.value.id}?force=true`);
    updatingMovie.value = false;
    window.location.reload();
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
                content: `https://movie-browser.vercel.app/movie/${movie.value?.id}`
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
                content: `https://movie-browser.vercel.app/movie/${movie.value?.id}`
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