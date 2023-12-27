<template>
    <div class="hidden md:block">
        <v-carousel height="55vh" color="white" :cycle="true" :interval="10000" hideDelimiterBackground
            delimiterIcon="mdi-minus" class="carousel" :key="trending?.allItems?.length">
            <template v-slot:prev="{ props }">
                <v-icon icon="mdi-chevron-left" @click="props.onClick"></v-icon>
            </template>
            <template v-slot:next="{ props }">
                <v-icon icon="mdi-chevron-right" @click="props.onClick"></v-icon>
            </template>
            <v-carousel-item v-for="item in (trending?.allItems || [])">
                <NuxtLink :to="`/${item.release_date ? 'movie': 'series'}/${item.id}`">
                    <DetailsTopInfo :item="item" :watched="false" :minimal="true" />
                </NuxtLink>
            </v-carousel-item>
        </v-carousel>
    </div>
    <div class="mt-5 md:mt-0 p-3">
        <Scroller :items="trending?.movies" :pending="pending" title="Trending Movies" class="" />
        <Scroller :items="trending?.tv" :pending="pending" title="Trending Series" class="mt-12" />
    </div>
</template>
<script setup lang="ts">
useHead({
    title: 'The Movie Browser',
    meta: [
        {
            hid: 'description',
            name: 'description',
            content: 'Track, discover and find where to watch TV shows and movies.',
        },
        {
            hid: 'og:title',
            property: 'og:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'og:description',
            property: 'og:description',
            content: 'Track, discover and find where to watch TV shows and movies.',
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
            content: 'Track, discover and find where to watch TV shows and movies.',
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
    ],
});
const { pending, data: trending }: any = await useLazyAsyncData('trending',
    () => $fetch('/api/trending').catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (trending: any) => {
            return {
                ...trending,
                allItems: trending.allItems.map(
                    (item: any) => {
                        if (item.media_type === 'movie') {
                            return {
                                ...item,
                                genres: item.genre_ids.map((genreId: number) => movieGenres[genreId]),
                            }
                        } else if (item.media_type === 'tv') {
                            return {
                                ...item,
                                genres: item.genre_ids.map((genreId: number) => seriesGenres[genreId]),
                            }
                        }
                    }
                )
            }
        },
    }
);
</script>

<style scoped lang="less">
:deep(.carousel) {
    .v-carousel__controls {
        display: none;
    }
    &:hover {
        .v-carousel__controls {
            display: flex;
        }
    }
}
:deep(.trending-image-container) {
    &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 11%,
            rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.1) 100%);
    }
}
</style>
