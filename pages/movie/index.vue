<template>
    <div v-for="(category, index) in MOVIE_CATEGORIES" class="mt-10">
        <IntLoader>
            <!-- <LazyScroller :category="category" :title="category.title" /> -->
            <ScrollProvider :scrollItem="category" :hideQuickFilter="true" />
        </IntLoader>
    </div>
</template>

<script setup lang="ts">
import { MOVIE_CATEGORIES } from './categories';

useHead({
    title: 'TV Shows',
    meta: [
        {
            name: 'description',
            content: 'TV Shows',
        },
    ],
});
</script>
