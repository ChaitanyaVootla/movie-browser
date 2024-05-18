<template>
    <div v-for="category in TV_CATEGORIES" class="mt-10">
        <ScrollProvider :scrollItem="category" :hideQuickFilter="true" />
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
