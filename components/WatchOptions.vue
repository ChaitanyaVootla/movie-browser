<template>
    <div class="flex">
        <div v-if="watchOptions.length" class="flex justify-center gap-8 bg-neutral-800 px-4 pt-5 pb-2 rounded-2xl relative min-w-28">
            <div class="absolute -top-2 left-2 bg-neutral-600 px-2 py-0 rounded-full text-sm text-neutral-200">
                Watch Now
            </div>
            <div v-for="watchOption in watchOptions">
                <NuxtLink :to="watchOption.link" target="blank" event="" noreferrer noopener>
                    <div class="w-18 flex flex-col items-center justify-between">
                        <v-img :src="watchOption.image" class="w-7 h-7" :alt="watchOption.name"></v-img>
                        <div v-if="watchOption?.displayName" class="text-xs text-neutral-200 text-center mt-1">
                            {{ watchOption.displayName }}
                        </div>
                        <div v-if="watchOption?.price?.length" class="text-xs text-neutral-400 text-center">
                            {{ watchOption.price }}
                        </div>
                    </div>
                </NuxtLink>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps(['googleData', 'tmdbRating', 'movieId'])
let watchOptions = [] as any[]

const watchOptionImageMapper = {
    'youtube': {
        image: '/images/ott/youtube.png',
        name: 'YouTube'
    },
    'netflix': {
        image: '/images/ott/netflix.svg',
        name: 'Netflix'
    },
    'apple': {
        image: '/images/ott/apple.png',
        name: 'Apple'
    },
    'google': {
        image: '/images/ott/google.svg',
        name: 'Google'
    },
    'amazon': {
        image: '/images/ott/prime.svg',
        name: 'Amazon'
    },
    'prime': {
        image: '/images/ott/prime.svg',
        name: 'Amazon'
    },
    'hotstar': {
        image: '/images/ott/hotstar.png',
        name: 'Hotstar'
    },
    'sonyliv': {
        image: '/images/ott/sonyliv.png',
        name: 'SonyLIV'
    },
    'voot': {
        image: '/images/ott/voot.png',
        name: 'Voot'
    },
    'zee5': {
        image: '/images/ott/zee.png',
        name: 'Zee5'
    },
    'jio': {
        image: '/images/ott/jiocinema.png',
        name: 'JioCinema'
    },
} as Record<string, any>;

if (props.googleData?.allWatchOptions) {
    watchOptions = (props.googleData.allWatchOptions || []).map((watchOption: any) => {
        const mappedWatchOption = Object.entries(watchOptionImageMapper).find(([key, value]) => watchOption.name.toLowerCase().includes(key))?.[1]
        return {
            name: watchOption.name,
            displayName: mappedWatchOption?.name,
            link: watchOption.link,
            price: watchOption.price,
            image: mappedWatchOption?.image
        }
    })
}
</script>
