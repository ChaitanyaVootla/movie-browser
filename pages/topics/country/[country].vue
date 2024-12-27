<template>
    <div class="mx-14 flex items-center gap-4 w-fit rounded-xl border-2 border-neutral-600
        my-6 pl-3 overflow-hidden">
        <div class="font-medium">
            {{ countryMeta.name }}
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
import { getCountryMeta } from '~/utils/topics/utils';

const country = useRoute().params.country as string;

const countryMeta = getCountryMeta(country);
const promoMetaItem = {
    ...countryMeta,
    filterParams: {
        ...countryMeta.filterParams,
        sort_by: 'popularity.desc',
    },
    isPromo: true,
};

const topicScrollVariations = countryMeta.scrollVariations.map((variation: any) => {
    return {
        ...countryMeta,
        ...variation,
        filterParams: {
            ...countryMeta.filterParams,
            ...variation.filterParams,
        },
    }
});
</script>
