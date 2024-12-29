<template>
    <div class="w-full h-full flex flex-col items-center">
        <div>
            <h1 class="text-3xl font-bold my-10">All Topics</h1>
        </div>
        <div class="flex justify-center w-1/2">
            <v-text-field
                variant="outlined"
                rounded
                prepend-inner-icon="mdi-magnify"
                v-model="search"
                label="Search">
            </v-text-field>
        </div>

        <div class="flex gap-2 flex-wrap justify-center max-md:px-10 md:w-1/2">
            <NuxtLink v-for="topic in filteredTopics" :to="`/topics/${topic.key}`" :key="topic.key">
                <v-chip>
                    {{ topic.name }}
                </v-chip>
            </NuxtLink>
        </div>
    </div>
</template>

<script setup lang="ts">
import { allTopics } from '~/utils/topics';

const search = ref('');

const filteredTopics = computed(() => {
    if (!search.value?.length) return allTopics;

    return allTopics.filter((topic) => {
        return topic.name.toLowerCase().includes(search.value.toLowerCase());
    });
});
</script>