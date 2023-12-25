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
            <div class="top-info px-14 pt-10">
                <div class="flex gap-10">
                    <div class="w-1/12">
                        <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.profile_sizes.h632}${person.profile_path}`"
                            :alt="person.name" />
                    </div>
                    <div class="w-11/12">
                        <div class="text-4xl font-bold flex items-baseline gap-5">
                            {{ person.name }}
                            <div class="text-neutral-400 text-lg">
                                {{ person.known_for_department }}
                            </div>
                        </div>
                        <div class="text-2xl text-neutral-400 flex align-baseline gap-3">
                            Born: 
                            <NuxtTime v-if="person.birthday" class="text-neutral-200 mt-2 block" :datetime="new Date(person.birthday)"
                                year="numeric" month="long" day="numeric" />
                            {{ person.place_of_birth }}
                        </div>
                        <div class="text-md text-neutral-400 mt-5 line-clamp-6">{{ person.biography }}</div>
                    </div>
                </div>
            </div>

            <div class="px-14 mt-10">
                <v-btn-toggle v-model="selectedMediaType">
                    <v-btn>
                        Movies
                    </v-btn>
                    <v-btn>
                        Series
                    </v-btn>
                </v-btn-toggle>
                <v-btn-toggle v-model="selectedCreditType" class="ml-10">
                    <v-btn>
                        Cast
                    </v-btn>
                    <v-btn>
                        Crew
                    </v-btn>
                </v-btn-toggle>

                <Grid :items="filteredItems" title="" :pending="pending" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const selectedMediaType = ref(0);
const selectedCreditType = ref(0);

const { data: person, pending }: any = await useLazyAsyncData(`person-${useRoute().params.personId}`,
    () => $fetch(`/api/person/${useRoute().params.personId}`).catch((err) => {
        console.log(err);
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
                    movie_credits.crew.push(item);
                } else if (item.media_type === 'tv') {
                    series_credits.crew.push(item);
                }
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
    if (selectedMediaType.value === 0) {
        if (selectedCreditType.value === 0) {
            return person.value.movie_credits?.cast || [];
        } else {
            return person.value.movie_credits?.crew || [];
        }
    } else {
        if (selectedCreditType.value === 0) {
            return person.value.series_credits?.cast || [];
        } else {
            return person.value.series_credits?.crew || [];
        }
    }
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