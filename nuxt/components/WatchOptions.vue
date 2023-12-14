<template>
    <div class="flex">
        <div v-if="watchOptions.length" class="flex gap-8">
            <div v-for="watchOption in watchOptions" class="">
                <NuxtLink :to="watchOption.link" target="blank" noreferrer noopener>
                    <div class="w-18 flex flex-col items-center justify-between gap-2">
                        <v-img :src="watchOption.image" class="w-10 h-10"></v-img>
                        <div v-if="watchOption?.price?.length" class="text-sm text-neutral-300 text-center">
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
    'youtube': '/images/ott/youtube.png',
    'netflix': '/images/ott/netflix.svg',
    'apple': '/images/ott/apple.png',
    'google': '/images/ott/google.svg',
    'amazon': '/images/ott/prime.svg',
    'prime': '/images/ott/prime.svg',
    'hotstar': '/images/ott/hotstar.png',
    'sonyliv': '/images/ott/sonyliv.png',
    'voot': '/images/ott/voot.png',
    'zee5': '/images/ott/zee.png',
} as Record<string, string>;

if (props.googleData?.allWatchOptions) {
    watchOptions = (props.googleData.allWatchOptions || []).map((watchOption: any) => {
        return {
            name: watchOption.name,
            link: watchOption.link,
            price: watchOption.price,
            image: Object.entries(watchOptionImageMapper).find(([key, value]) => watchOption.name.toLowerCase().includes(key))?.[1]
        }
    })
}
</script>
