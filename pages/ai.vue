<template>
    <div class="mt-5 ml-20 mr-20">
        <div>
            <div class="font-bold text-xl">Free text search</div>
            <div class="flex gap-5 w-1/3 mt-5">
                <v-text-field
                    prependInnerIcon="mdi-magnify"
                    placeholder="Search..."
                    v-model="queryString"
                    @keyup.enter="recommend"
                    class="flex-1"
                    variant="solo-filled"
                    rounded
                />
                <v-btn prependIcon="mdi-magnify" size="x-large" @click="recommend" color="#ccc">Search</v-btn>
            </div>
        </div>

        <div class="mt-10 flex gap-16 w-3/4">
            <div class="flex-1">
                <div class="font-bold text-xl">Watched Similarity</div>
                <div>
                    <v-btn-toggle class="mt-5" v-model="watchedQuery" @update:modelValue="recommend()" mandatory>
                        <v-btn value="similar" text="Similar" />
                        <v-btn value="neutral" text="Neutral" />
                        <v-btn value="contrast" text="Contrast" />
                    </v-btn-toggle>
                </div>
            </div>
            <div class="flex-1">
                <div class="font-bold text-xl">Hide Watched</div>
                <div class="mt-5">
                    <v-checkbox v-model="hideWatched" label="Hide" @change="recommend" color="#ccc"/>
                </div>
            </div>
            <div class="flex-1">
                <div class="font-bold text-xl">Rating</div>
                <div class="mt-5 rating-slider">
                    <v-slider :min="0" :max="10" :step="1" v-model="ratingCutoff" @update:modelValue="recommend" color="#ccc"/>
                    {{ ratingCutoff }}+
                </div>
            </div>
            <div v-show="similarityMovie?.id" class="flex-1">
                <div class="font-bold text-xl">Similarity Movie</div>
                <div class="mt-5 rating-slider">
                    <span class="text-lg font-bold underline">{{ similarityMovie?.title }}</span>
                    <v-btn @click="clearSimilarityMovie" text="Clear" class="ml-5"/>
                </div>
            </div>
        </div>

        <div v-if="isLoading" class="mt-10 text-4xl text-neutral-600">
            Loading...
        </div>
        <Grid v-else-if="results?.length" :items="results" :addToFilter="addToFilter" title="Results" class="mt-10" />
        <div v-else class="mt-10 text-2xl">No results</div>
    </div>
</template>

<script lang="ts">
export default {
    data() {
        return {
            queryString: '',
            watchedQuery: 'neutral',
            results: [] as any[],
            isLoading: true,
            queryById: false,
            hideWatched: false,
            ratingCutoff: 0,
            similarityMovie: null as any,
        };
    },
    created() {
        this.recommend();
    },
    methods: {
        addToFilter(item: any) {
            this.similarityMovie = item;
            this.recommend();
        },
        clearSimilarityMovie() {
            this.similarityMovie = null;
            this.recommend();
        },
        async recommend() {
            this.isLoading = true;
            const { data: movies } = await useAsyncData('results', () =>
                $fetch(`/api/movie/recommend`, {
                    method: 'POST',
                    body: {
                        watched: this.watchedQuery,
                        query: this.queryString,
                        hideWatched: this.hideWatched,
                        ratingCutoff: this.ratingCutoff,
                        similarityMovieId: this.similarityMovie?.id,
                    }
                })
            );
            this.results = (movies as any) || [];
            this.isLoading = false;
        },
    }
}
</script>
