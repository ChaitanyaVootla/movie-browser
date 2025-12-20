<template>
    <div v-for="(category, index) in MOVIE_CATEGORIES" class="mt-10">
        <ScrollProvider :scrollItem="category" :hideQuickFilter="true">
            <template v-slot:default="{ item }">
                <PromoCard v-if="category.isPromo" :item="item" class="mr-3" />
            </template>
        </ScrollProvider>
    </div>
</template>

<script setup lang="ts">
import { MOVIE_CATEGORIES } from './categories';

useHead({
    title: 'Movies - The Movie Browser',
    meta: [
        {
            name: 'description',
            content: 'Find the best movies on The Movie Browser. Browse through the latest movies, popular movies, and more.',
        },
    ],
});
</script>
