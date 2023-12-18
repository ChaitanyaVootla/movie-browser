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
            <DetailsTopInfo :item="series"/>
            <div class="pl-20 pr-20 pt-10">
                <div class="overview">
                    <div class="text-3xl">Overview</div>
                    <div class="text-neutral-300 mt-3 text">
                        {{ series.overview }}
                    </div>

                    <div class="flex flex-wrap gap-3 mt-5">
                        <v-chip v-for="keyword in (series?.keywords?.results || [])" class="rounded-pill" :color="'#ddd'">
                            {{ keyword.name }}
                        </v-chip>
                    </div>
                </div>

                <div v-if="series?.collectionDetails?.parts?.length" class="cast mt-10">
                    <div class="text-2xl">{{ series.collectionDetails.name }}</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="part in (series.collectionDetails.parts || [])">
                            <PosterCard :item="part" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div class="cast mt-10">
                    <div class="text-2xl">Cast</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="person in (series.credits?.cast || [])">
                            <PersonCard :item="person" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div class="cast mt-10">
                    <div class="text-2xl">Crew</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="person in (series.credits?.crew || [])">
                            <PersonCard :item="person" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div v-if="series.recommendations?.results?.length" class="cast mt-10">
                    <div class="text-2xl">Recommended</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="item in (series.recommendations.results || [])">
                            <PosterCard :item="item" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>

                <div v-if="series.similar?.results?.length" class="cast mt-10">
                    <div class="text-2xl">Similar</div>
                    <v-slide-group show-arrows="desktop" class="-ml-14 -mr-14 mt-3">
                        <v-slide-group-item v-for="item in (series.similar.results || [])">
                            <PosterCard :item="item" :pending="pending" class="mr-3" />
                        </v-slide-group-item>
                    </v-slide-group>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
let series = ref({} as any);

const { data: seriesAPI, pending }: any = await useLazyAsyncData(`seriesDetails-${useRoute().params.seriesId}`,
    () => $fetch(`/api/series/${useRoute().params.seriesId}`).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: ((series: any) => {
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
        })
    }
);
series = seriesAPI;

useHead(() => {
    return {
        title: series.value?.title,
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
                content: `https://image.tmdb.org/t/p/w500${series.value?.poster_path}`
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
                content: `https://image.tmdb.org/t/p/w500${series.value?.poster_path}`
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