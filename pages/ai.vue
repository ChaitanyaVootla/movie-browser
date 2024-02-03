<template>
    <div class="mt-5 mx-16">
        <div>
            <div class="flex gap-5 w-full">
                <v-text-field
                    prependInnerIcon="mdi-magnify"
                    placeholder="What are you looking for?"
                    v-model="queryString"
                    @keyup.enter="recommend"
                    class="flex-1"
                    density="comfortable"
                    variant="solo-filled"
                    rounded
                />
                <v-btn prependIcon="mdi-magnify" size="large" @click="recommend" color="#ccc">Search</v-btn>
            </div>
        </div>

        <div class="flex justify-between">
            <div class="flex gap-16 w-full">
                <div class="">
                    <div class="text-neutral-300 ml-2">Watched Similarity</div>
                    <div>
                        <v-btn-toggle class="mt-1" v-model="watchedQuery" @update:modelValue="recommend()" mandatory
                            density="comfortable">
                            <v-btn value="similar" text="Similar" />
                            <v-btn value="neutral" text="Neutral" />
                            <v-btn value="contrast" text="Contrast" />
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
                            clearable
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
</script>
