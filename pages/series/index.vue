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
    title: 'TV Shows',
    meta: [
        {
            name: 'description',
            content: 'TV Shows',
        },
    ],
});
</script>
