<template>
    <div class="flex">
        <div v-if="watchOptions.length"
            class="flex gap-8">
            <div v-for="watchOption in watchOptions">
                <NuxtLink :to="watchOption.link" target="blank" noreferrer noopener>
                    <div class="w-18 flex flex-col items-center justify-between">
                        <v-img :src="watchOption.image" class="w-8 h-8" :alt="watchOption.name"></v-img>
                        <div v-if="watchOption?.displayName" class="text-sm text-neutral-300 text-center mt-2">
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
