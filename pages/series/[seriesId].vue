<template>
    <div>
        <div v-if="pending" class="pending w-full h-full">
            <v-skeleton-loader
                class="min-w-full h-full"
                max-width="300"
                type="image"
            ></v-skeleton-loader>
        </div>
        <div v-else>
            <DetailsTopInfo :item="series" :watched="false"/>
            <div>
                <div class="px-3 md:mx-12 mt-3">
                    <div class="flex w-full items-center gap-4">
                        <div v-if="series.status">
                            <v-chip rounded :color="seriesStatusColor" density="comfortable"
                                size="x-large" variant="elevated">
                                Status <b class="ml-2">{{ statusText }}</b> 
                            </v-chip>
                        </div>
                        <div class="mt-5">
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
                        <div>
                            {{ series.selectedSeason?.episodes?.length || 0 }} Episodes
                        </div>
                        <div>
                            <NuxtTime v-if="series.selectedSeason?.air_date" :datetime="new Date(series.selectedSeason?.air_date)"
                                year="numeric" month="long" day="numeric" />
                        </div>
                    </div>
                </div>
                <div class="px-3 md:px-0">
                    <Scroller :items="series.selectedSeason?.episodes || []" title="" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <div class="flex flex-col gap-3 mt-2 w-96">
                                <div class="text-neutral-400 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4 text-sm -mb-1
                                    flex items-center justify-between mr-1">
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
                                    class="rounded-lg mr-5"
                                    :alt="item.name">
                                    <template v-slot:placeholder>
                                        <v-skeleton-loader
                                            class="min-w-full h-full"
                                            max-width="300"
                                            type="image"
                                        ></v-skeleton-loader>
                                    </template>
                                    <template v-slot:error>
                                        <v-skeleton-loader
                                            class="min-w-full h-full"
                                            max-width="300"
                                            type="image"
                                        >
                                            <div></div>
                                        </v-skeleton-loader>
                                    </template>
                                </v-img>
                                <div class="text-neutral-200 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4">
                                    {{ item.name }}
                                </div>
                            </div>
                        </template>
                    </Scroller>
                </div>

                <div class="px-3 md:mx-12 overview mt-10">
                    <v-card class="px-5 py-5" color="#151515">
                        <div class="text-2xl">Overview</div>
                        <div class="text-neutral-300 mt-3 text">
                            {{ series.overview }}
                        </div>

                        <div class="flex flex-wrap gap-3 mt-5">
                            <v-chip v-for="keyword in (series?.keywords?.results || [])" class="rounded-pill" :color="'#ddd'">
                                {{ keyword.name }}
                            </v-chip>
                        </div>
                    </v-card>
                </div>

                <div class="px-3 md:px-0 mt-10">
                    <Scroller :items="series.credits?.cast || []" title="Cast" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div class="px-3 md:px-0 mt-10">
                    <Scroller :items="series.credits?.crew || []" title="Crew" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="series.recommendations?.results?.length" class="px-3 md:px-0cast mt-10">
                    <Scroller :items="series.recommendations?.results || []" title="Recommended" :pending="pending" />
                </div>

                <div v-if="series.similar?.results?.length" class="px-3 md:px-0cast mt-10">
                    <Scroller :items="series.similar?.results || []" title="Similar" :pending="pending" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const { data: series, pending } = await useLazyAsyncData(`seriesDetails-${useRoute().params.seriesId}`,
    () => $fetch(`/api/series/${useRoute().params.seriesId}`).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: ((series: any) => {
            series.credits.crew = useSortBy(series.credits.crew, (person) => {
                if (person.job === 'Director') return 0;
                if (person.department === 'Directing') return 1;
                if (person.department === 'Writing') return 2;
                if (person.department === 'Production') return 3;
                if (person.department === 'Camera') return 4;
                return 100;
            });
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

const seasonSelected = async (season: any) => {
    series.value.selectedSeason = await $fetch(`/api/series/${series.value.id}/season/${season?.season_number}`).catch((err) => {
        console.log(err);
        return {};
    });
}

const seriesStatusColor = computed(() => {
    switch (series.value?.status) {
        case 'Returning Series':
            return '#ddd';
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