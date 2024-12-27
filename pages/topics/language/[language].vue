<template>
    <div class="mx-14 flex items-center gap-4 w-fit rounded-xl border-2 border-neutral-600
        my-6 pl-3 overflow-hidden">
        <div class="font-medium">
            {{ languageMeta.name }}
        </div>
        <div class="text-sm font-medium rounded-r-xl bg-neutral-800 w-fit h-full px-3
            flex items-center py-1 text-neutral-3">
            TOPIC
        </div>
    </div>
    <ScrollProvider :scroll-item="promoMetaItem" class="mt-5">
        <template v-slot:default="{ item }">
            <PromoCard  :item="item" class="mr-3" />
        </template>
    </ScrollProvider>
    <ScrollProvider v-for="scrollItem in topicScrollVariations" :scroll-item="scrollItem" class="mt-10" />
</template>

<script setup lang="ts">
import { getLanguageMeta } from '~/utils/topics/utils';

const language = useRoute().params.language as string;

const languageMeta = getLanguageMeta(language);
const promoMetaItem = {
    ...languageMeta,
    filterParams: {
        ...languageMeta.filterParams,
        sort_by: 'popularity.desc',
    },
    isPromo: true,
};

const topicScrollVariations = languageMeta.scrollVariations.map((variation: any) => {
    return {
        ...languageMeta,
        ...variation,
        filterParams: {
            ...languageMeta.filterParams,
            ...variation.filterParams,
        },
    }
});
</script>
