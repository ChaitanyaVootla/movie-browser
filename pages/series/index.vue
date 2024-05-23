<template>
    <div v-for="category in TV_CATEGORIES" class="mt-10">
        <IntLoader>
            <ScrollProvider :scrollItem="category" :hideQuickFilter="true">
                <template v-slot:default="{ item }">
                    <PromoCard v-if="category.isPromo" :item="item" class="mr-3" />
                </template>
            </ScrollProvider>
        </IntLoader>
    </div>
</template>

<script setup lang="ts">
import { TV_CATEGORIES } from './categories';

useHead({
    title: 'Series - The Movie Browser',
    meta: [
        {
            name: 'description',
            content: 'Find the best series on The Movie Browser. Browse through the latest series, popular series, and more.',
        },
    ],
});
</script>
