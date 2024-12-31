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
            <div class="top-info max-md:px-3 md:px-14 pt-10">
                <div class="flex gap-10">
                    <div class="w-1/12 min-w-32">
                        <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.profile_path}`"
                            :alt="person.name" class="rounded-lg" />
                    </div>
                    <div class="w-11/12">
                        <div class="max-md:text-xl md:text-4xl font-bold flex items-baseline gap-5">
                            <h1>{{ person.name }}</h1>
                            <div class="text-neutral-400 text-lg">
                                {{ person.known_for_department }}
                            </div>
                        </div>
                        <div class="max-md:text-sm md:text-2xl text-neutral-400 flex align-baseline gap-3">
                            Born: 
                            <NuxtTime v-if="person.birthday" class="text-neutral-200 mt-2 block" :datetime="new Date(person.birthday)"
                                year="numeric" month="long" day="numeric" />
                            {{ person.place_of_birth }}
                        </div>
                        <div class="max-md:text-sm md:text-base text-neutral-400 mt-5 line-clamp-6">{{ person.biography }}</div>
                    </div>
                </div>
            </div>

            <div class="max-md:px-3 md:px-14 max-md:mt-3 md:mt-10">
                <v-btn-toggle v-model="selectedMediaType" mandatory density="compact">
                    <v-btn value="movies">
                        Movies
                    </v-btn>
                    <v-btn value="series">
                        Series
                    </v-btn>
                </v-btn-toggle>
                <v-btn-toggle v-model="selectedCreditType" mandatory density="compact" class="max-md:ml-0 md:ml-10">
                    <v-btn value="cast">
                        Cast
                    </v-btn>
                    <v-btn value="crew">
                        Crew
                    </v-btn>
                </v-btn-toggle>

                <Grid :items="filteredItems" title="" :pending="pending" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { createPersonLdSchema } from '~/utils/schema';

const selectedMediaType = ref("movies");
const selectedCreditType = ref("cast");

const { data: person, pending }: any = await useLazyAsyncData(`person-${useRoute().params.personId}`,
    () => $fetch(`/api/person/${useRoute().params.personId}`).catch((err) => {
        console.error(err);
        return {};
    }),
    {
        transform: (person: any) => {
            person.combined_credits?.cast.sort((a: any, b: any) => {
                return b.popularity - a.popularity;
            });
            person.combined_credits?.crew.sort((a: any, b: any) => {
                return b.popularity - a.popularity;
            });
            const movie_credits = {
                cast: [],
                crew: [],
            } as any;
            const series_credits = {
                cast: [],
                crew: [],
            } as any;
            for (const item of (person.combined_credits?.cast || [])) {
                if (item.media_type === 'movie') {
                    movie_credits.cast.push(item);
                } else if (item.media_type === 'tv') {
                    series_credits.cast.push(item);
                }
            }
            for (const item of (person.combined_credits?.crew || [])) {
                if (item.media_type === 'movie') {
                    const existng = movie_credits.crew.find((i: any) => i.id === item.id);
                    if (existng) {
                        existng.job += `, ${item.job}`;
                        continue;
                    }
                    movie_credits.crew.push(item);
                } else if (item.media_type === 'tv') {
                    const existng = series_credits.crew.find((i: any) => i.id === item.id);
                    if (existng) {
                        existng.job += `, ${item.job}`;
                        continue;
                    }
                    series_credits.crew.push(item);
                }
            }
            if (person.known_for_department !== 'Acting') {
                selectedCreditType.value = 'crew';
            }
            return {
                ...person,
                movie_credits,
                series_credits,
            }
        }
    }
);

const filteredItems = computed(() => {
    if (selectedMediaType.value === 'movies') {
        if (selectedCreditType.value === 'cast') {
            return person.value.movie_credits?.cast || [];
        } else {
            return person.value.movie_credits?.crew || [];
        }
    } else {
        if (selectedCreditType.value === 'cast') {
            return person.value.series_credits?.cast || [];
        } else {
            return person.value.series_credits?.crew || [];
        }
    }
});

useHead({
    title: `${person.value?.name} | The Movie Browser`,
    meta: [
        {
            hid: 'description',
            name: 'description',
            content: person.value?.biography,
        },
        {
            hid: 'og:title',
            property: 'og:title',
            content: `${person.value?.name}`,
        },
        {
            hid: 'og:description',
            property: 'og:description',
            content: person.value?.biography,
        },
        {
            hid: 'og:image',
            property: 'og:image',
            content: `https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.value?.profile_path}`,
        },
        {
            hid: 'og:url',
            property: 'og:url',
            content: `https://www.themoviedb.org/person/${person.value?.id}`,
        },
        {
            hid: 'twitter:title',
            name: 'twitter:title',
            content: `${person.value?.name}`,
        },
        {
            hid: 'twitter:description',
            name: 'twitter:description',
            content: person.value?.biography,
        },
        {
            hid: 'twitter:image',
            name: 'twitter:image',
            content: `https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.value?.profile_path}`,
        },
        {
            hid: 'twitter:card',
            name: 'twitter:card',
            content: 'summary_large_image',
        },
    ],
    script: [
        {
            hid: 'ld-json',
            type: 'application/ld+json',
            innerHTML: JSON.stringify(createPersonLdSchema(person.value))
        }
    ]
});
</script>

<style scoped lang="less">
.pending {
    :deep(.v-skeleton-loader) {
        align-items: start;
        .v-skeleton-loader__bone {
            &.v-skeleton-loader__image {
                height: 30vh;
            }
        }
    }
}
</style>