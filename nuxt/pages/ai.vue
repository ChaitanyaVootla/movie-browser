<template>
    <div class="mt-5 md:mx-16 max-md:mx-3">
        <div>
            <div class="flex gap-5 w-full">
                <v-text-field
                    prependInnerIcon="mdi-magnify"
                    placeholder="What are you looking for?"
                    v-model="queryString"
                    @keyup.enter="recommend"
                    class="flex-1"
                    v-bind:density="$vuetify.display.mobile?'compact':'comfortable'"
                    variant="solo-filled"
                    rounded
                />
                <v-btn prependIcon="mdi-magnify" v-bind:size="$vuetify.display.mobile?'default':'large'" @click="recommend" color="#ccc">Search</v-btn>
            </div>
        </div>

        <div class="flex flex-wrap md:justify-between">
            <div class="flex flex-wrap max-md:gap-2 md:gap-16 w-full">
                <div class="">
                    <div class="text-neutral-300 ml-2">Watched Similarity</div>
                    <div>
                        <v-btn-toggle class="mt-1" v-model="watchedQuery" @update:modelValue="recommend()" mandatory
                            v-bind:density="$vuetify.display.mobile?'compact':'comfortable'">
                            <v-btn value="similar" text="Similar" v-bind:size="$vuetify.display.mobile?'x-small':'default'" />
                            <v-btn value="neutral" text="Neutral" v-bind:size="$vuetify.display.mobile?'x-small':'default'" />
                            <v-btn value="contrast" text="Contrast" v-bind:size="$vuetify.display.mobile?'x-small':'default'" />
                        </v-btn-toggle>
                    </div>
                </div>
                <div class="">
                    <div class="text-neutral-300 ml-2">Rating</div>
                    <div class="mt-1 rating-slider">
                        <v-select
                            rounded
                            v-model="ratingCutoff"
                            :items="ratingOptions"
                            single-line
                            label="Rating"
                            variant="solo"
                            density="compact"
                            item-title="text"
                            item-value="value"
                            @update:model-value="recommend()"
                        ></v-select>
                    </div>
                </div>
            </div>
            <div class="flex items-center">
                <div v-show="similarityMovie?.id" class="w-56 flex items-center gap-2">
                    <div class="text-lg font-bold underline">{{ similarityMovie?.title }}</div>
                    <v-btn @click="clearSimilarityMovie" text="Clear" size="small" color="#555"/>
                </div>
                <div class="w-44">
                    <v-checkbox v-model="hideWatched" label="Hide Watched" @change="recommend" color="#ccc"
                        hide-details/>
                </div>
            </div>
        </div>

        <Grid :items="results" :addToFilter="addToFilter" :pending="pending" title="" />
        <div v-if="!pending && !results?.length" class="mt-2 text-xl text-neutral-400">No results</div>
    </div>
</template>

<script setup lang="ts">
const queryString = ref('');
const watchedQuery = ref('similar');
const hideWatched = ref(false);
const ratingCutoff = ref(0);
const similarityMovie = ref(null as any);

const addToFilter = (item: any) => {
    similarityMovie.value = item;
    recommend();
}

const clearSimilarityMovie = () => {
    similarityMovie.value = null;
    recommend();
}

const {data: results, execute: recommend, pending } = await useLazyAsyncData('results', () =>
    {
        results.value = [];
        return $fetch(`/api/movie/recommend`, {
        method: 'POST',
        body: {
            watched: watchedQuery.value,
            query: queryString.value,
            hideWatched: hideWatched.value,
            ratingCutoff: ratingCutoff.value,
            similarityMovieId: similarityMovie.value?.id,
        }})
    }
);

const ratingOptions = new Array(10).fill({}).map((item, index) => ({
    value: index,
    text: `${index}+`,
})).reverse();

useHead({
    title: 'AI Search - The Movie Browser',
    meta: [
        {
            hid: 'description',
            name: 'description',
            content: 'AI powered movie search engine. Find movies with ease.',
        },
        {
            hid: 'og:image',
            property: 'og:image',
            content: '/backdrop.webp',
        },
        {
            hid: 'twitter:image',
            name: 'twitter:image',
            content: '/backdrop.webp',
        },
        {
            hid: 'twitter:url',
            name: 'twitter:url',
            content: `https://themoviebrowser.com/ai`,
        },
    ],
});
</script>
