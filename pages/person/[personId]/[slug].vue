<template>
    <div>
        <div v-if="pending" class="pending w-full h-full">
            <v-skeleton-loader
                class="min-w-full h-full"
                max-width="300"
                type="image"
            ></v-skeleton-loader>
        </div>
        <div v-else-if="person?.id">
            <div class="top-info max-md:px-3 md:px-14 pt-10">
                <div class="flex gap-10">
                    <div class="w-1/12 min-w-32">
                        <SeoImg :src="`https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.profile_path}`"
                            :alt="person.name" 
                            class="rounded-lg"
                            cover>
                            <template #placeholder>
                                <v-skeleton-loader type="image" class="w-full h-full" />
                            </template>
                            <template #error>
                                <div class="w-full h-full bg-neutral-700 rounded-lg"></div>
                            </template>
                        </SeoImg>
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
        <div v-else-if="error" class="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <v-icon icon="mdi-alert-circle" size="64" class="text-red-500 mb-4"></v-icon>
            <h2 class="text-xl font-semibold mb-2">Error Loading Person</h2>
            <p class="text-neutral-400 mb-2">{{ error.message || 'An error occurred while loading the person.' }}</p>
            <v-btn @click="refresh()" class="mt-4" variant="outlined" color="primary">
                Try Again
            </v-btn>
        </div>
        <div v-else class="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <v-icon icon="mdi-account-off" size="64" class="text-neutral-500 mb-4"></v-icon>
            <h2 class="text-xl font-semibold mb-2">Person Not Found</h2>
            <p class="text-neutral-400 mb-2">The person you're looking for doesn't exist.</p>
            <p class="text-xs text-neutral-500 mb-4">Person ID: {{ $route.params.personId }}</p>
            <v-btn @click="$router.push('/')" class="mt-4" variant="outlined">
                Go Home
            </v-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
import { createPersonLdSchema } from '~/utils/schema';
import { getUrlSlug } from '~/utils/slug';

const selectedMediaType = ref("movies");
const selectedCreditType = ref("cast");

const mapPerson = (person: any) => {
    if (!person || typeof person !== 'object') {
        return null;
    }
    
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

const route = useRoute()
const headers = useRequestHeaders(['cookie']) as HeadersInit

const { data: person, pending, error, refresh: refreshData }: any = await useFetch(`/api/person/${route.params.personId}`, {
    key: `person-${route.params.personId}`,
    headers,
    transform: mapPerson,
    default: () => null,
    server: true
});

// Add refresh function to retry loading
const refresh = async () => {
    await refreshData();
};

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

useHead(() => {
    return {
        title: `${person.value?.name} | The Movie Browser`,
        meta: [
            {
                name: 'description',
                content: person.value?.biography,
            },
            {
                property: 'og:title',
                content: `${person.value?.name}`,
            },
            {
                property: 'og:description',
                content: person.value?.biography,
            },
            {
                property: 'og:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.value?.profile_path}`,
            },
            {
                property: 'og:url',
                content: `https://themoviebrowser.com/person/${person.value?.id}/${getUrlSlug(person.value?.name || '')}`,
            },
            {
                property: 'og:type',
                content: 'profile'
            },
            {
                property: 'og:site_name',
                content: 'The Movie Browser'
            },
            {
                name: 'twitter:title',
                content: `${person.value?.name}`,
            },
            {
                name: 'twitter:description',
                content: person.value?.biography,
            },
            {
                name: 'twitter:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.value?.profile_path}`,
            },
            {
                name: 'twitter:card',
                content: 'summary_large_image',
            },
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
                href: `https://themoviebrowser.com/person/${person.value?.id}/${getUrlSlug(person.value?.name || '')}`
            }
        ],
        script: [
            {
                type: 'application/ld+json',
                innerHTML: JSON.stringify(createPersonLdSchema(person.value))
            }
        ]
    };
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