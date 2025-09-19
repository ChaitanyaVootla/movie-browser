<template>
    <div class="md:px-14">
        <div class="top-action flex max-md:justify-center mt-4 mb-5 gap-4">
            <v-btn-toggle :key="selectedType" v-model="selectedType" mandatory density="compact" @update:model-value="viewUpdated">
                <v-btn size="default">
                    Series
                </v-btn>
                <v-btn size="default">
                    Movies
                </v-btn>
            </v-btn-toggle>
            <v-btn-toggle :key="selectedType" v-model="selectedRatingType" mandatory density="compact" @update:model-value="ratingTypeUpdated">
                <v-btn size="default">
                    Dislikes
                </v-btn>
                <v-btn size="default">
                    Likes
                </v-btn>
            </v-btn-toggle>
        </div>
        <Grid :items="filteredItems || []" :title="`${likes?.movies?.length} items`" />
    </div>
</template>

<script setup lang="ts">
const isMovies = ref(parseInt((useRoute().query.movie || 1) as string));
const isLikes = ref(parseInt((useRoute().query.isLikes || 1) as string));
const selectedType = ref(isMovies?isMovies.value:1);
const selectedRatingType = ref(isLikes?isLikes.value:1);

const { status } = useAuth();

const { data: ratingsData, refresh: refreshRatings } = await useLazyAsyncData('userRatings', 
    () => {
        if (status.value === 'authenticated') {
            return $fetch('/api/user/ratings/all').catch((err) => {
                console.log(err);
                return { likes: { movies: [], series: [] }, dislikes: { movies: [], series: [] } };
            });
        }
        return Promise.resolve({ likes: { movies: [], series: [] }, dislikes: { movies: [], series: [] } });
    },
    {
        default: () => ({ likes: { movies: [], series: [] }, dislikes: { movies: [], series: [] } }),
        server: false, // Keep client-side for user-specific content
        watch: [status], // Re-fetch when authentication status changes
    }
);

// Watch for authentication status changes and refresh data
watch(status, (newStatus, oldStatus) => {
    if (newStatus === 'authenticated' && oldStatus !== 'authenticated') {
        refreshRatings();
    }
});

const likes = computed(() => ratingsData.value?.likes || { movies: [], series: [] });
const dislikes = computed(() => ratingsData.value?.dislikes || { movies: [], series: [] });

const viewUpdated = (val: number) => {
    isMovies.value = val;
    useRouter().replace({ query: {
        ...useRoute().query,
        movie: val
    }});
};

const ratingTypeUpdated = (val: number) => {
    isLikes.value = val;
    useRouter().replace({ query: {
        ...useRoute().query,
        isLikes: val
    }});
};

const filteredItems = computed(() => {
    let filteredItems: any = [];
    if (selectedRatingType.value) {
        filteredItems = likes.value;
    } else {
        filteredItems = dislikes.value;
    }

    if (selectedType.value) {
        return filteredItems?.movies || [];
    } else {
        return filteredItems?.series || [];
    }
});
useHead({
    ...DEFAULT_META,
    title: 'My Ratings - The Movie Browser',
});
</script>