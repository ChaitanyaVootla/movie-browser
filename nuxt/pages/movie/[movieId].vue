<template>
    <div>
        <div v-if="pending" class="pending w-full h-full">
            <v-skeleton-loader
                class="min-w-full h-full"
                max-width="300"
                type="image, article"
            ></v-skeleton-loader>
        </div>
        <div v-else>
            <DetailsTopInfo :item="movie"/>

            <div class="pl-20 pr-20 pt-10">
                <div class="overview">
                    <div class="text-3xl">Overview</div>
                    <div class="text-neutral-300 mt-3 text">
                        {{ movie.overview }}
                    </div>
                    <v-divider class="my-5"></v-divider>
                    <div class="flex">
                        <div v-if="movie.googleData?.allWatchOptions?.length" class="mb-5">
                            <div class="text-2xl">Watch Options</div>
                            <WatchOptions class="mt-4" :googleData="movie.googleData" :tmdbRating="movie.vote_average" :movieId="movie.id"/>
                        </div>
                        <v-divider vertical inset class="mx-10"></v-divider>
                    </div>
                    <v-divider class="my-5"></v-divider>
                    <div class="flex flex-wrap gap-3">
                        <v-chip v-for="keyword in (movie?.keywords?.keywords || [])" class="rounded-pill" :color="'#ddd'">
                            {{ keyword.name }}
                        </v-chip>
                    </div>
                </div>

                <div v-if="movie?.collectionDetails?.parts?.length" class="cast mt-10">
                    <div class="text-2xl">{{ movie.collectionDetails.name }}</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="part in (movie.collectionDetails.parts || [])">
                            <PosterCard :item="part" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div class="cast mt-10">
                    <div class="text-2xl">Cast</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="person in (movie.credits?.cast || [])">
                            <PersonCard :item="person" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div class="cast mt-10">
                    <div class="text-2xl">Crew</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="person in (movie.credits?.crew || [])">
                            <PersonCard :item="person" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div v-if="aiRecommendations?.length" class="cast mt-10">
                    <div class="text-2xl">AI Recommendations</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="item in (aiRecommendations || [])">
                            <PosterCard :item="item" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div v-if="movie.recommendations?.results?.length" class="cast mt-10">
                    <div class="text-2xl">Recommended</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="item in (movie.recommendations.results || [])">
                            <PosterCard :item="item" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div v-if="movie.similar?.results?.length" class="cast mt-10">
                    <div class="text-2xl">Similar</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="item in (movie.similar.results || [])">
                            <PosterCard :item="item" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
let movie = ref({} as any);
let aiRecommendations = ref([] as any);
const headers = useRequestHeaders(['cookie']) as HeadersInit
const { data: movieAPI, pending }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}`, {
        headers
    }).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (movie: any) => {
            // console.log(movie);
            if (!movie) return {};
            if (movie?.release_date) {
                movie.releaseYear = movie?.release_date?.split('-')[0];
                movie.fullReleaseString = movie?.release_date;
            }
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

const { data: aiRecommendationsAPI }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-recommend`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}/recommend`).catch((err) => {
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
                content: `https://image.tmdb.org/t/p/w500${movie.value?.poster_path}`
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
                content: `https://image.tmdb.org/t/p/w500${movie.value?.poster_path}`
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
@info-height: calc(max(50vh, 500px) - 4rem);

.top-info {
    height: @info-height;
    background: rgb(18,18,18);
    background: linear-gradient(0deg, rgba(18,18,18,1) 0%, rgba(0,0,0,0) 100%);
    :deep(.bg-image) {
        height: @info-height;
    }
    :deep(.bg-banner) {
        &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: linear-gradient(to bottom, rgba(255,0,0,0), #2c2c2c);
            opacity: 0.9;
        }
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
                height: 40vh;
            }
        }
    }
}
</style>