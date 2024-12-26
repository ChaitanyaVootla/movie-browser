<template>
    <div class="mx-14 flex items-center gap-4 w-fit rounded-xl border-2 border-neutral-600
        my-6 pl-3 overflow-hidden">
        <div class="font-medium">
            {{ topicMeta.name }}
        </div>
        <div class="text-sm font-medium rounded-r-xl bg-neutral-800 w-fit h-full px-3
            flex items-center py-1 text-neutral-3">
            TOPIC
        </div>
    </div>
    <ScrollProvider v-if="!topicMeta.ignorePromo" :scroll-item="promoMetaItem" class="mt-5">
        <template v-slot:default="{ item }">
            <PromoCard  :item="item" class="mr-3" />
        </template>
    </ScrollProvider>
    <ScrollProvider v-for="scrollItem in topicScrollVariations" :scroll-item="scrollItem" class="mt-10" />
</template>

<script setup lang="ts">
import { topics } from '~/utils/topics';

const topic = useRoute().params.topic as string;
const topicMeta = topics[topic];
const promoMetaItem = {
    ...topicMeta,
    filterParams: {
        ...topicMeta.filterParams,
        sort_by: 'popularity.desc',
    },
    isPromo: true,
};

const topicScrollVariations = topicMeta.scrollVariations.map((variation: any) => {
    return {
        ...topicMeta,
        ...variation,
        filterParams: {
            ...topicMeta.filterParams,
            ...variation.filterParams,
        },
    }
});

useHead({
    title: `${topicMeta.name} (Topic) | The Movie Browser`,
    meta: [
        {
            name: 'description',
            content: 'Discover and add movies and series to your watch list.',
        },
        {
            hid: 'og:title',
            property: 'og:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'og:description',
            property: 'og:description',
            content: 'Discover and add movies and series to your watch list.',
        },
        {
            hid: 'og:image',
            property: 'og:image',
            content: '/backdrop.webp',
        },
        {
            hid: 'og:url',
            property: 'og:url',
            content: 'https://themoviebrowser.vercel.app',
        },
        {
            hid: 'twitter:title',
            name: 'twitter:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'twitter:description',
            name: 'twitter:description',
            content: 'Discover and add movies and series to your watch list.',
        },
        {
            hid: 'twitter:image',
            name: 'twitter:image',
            content: '/backdrop.webp',
        },
        {
            hid: 'twitter:card',
            name: 'twitter:card',
            content: 'summary_large_image',
        },
    ]
});
</script>
