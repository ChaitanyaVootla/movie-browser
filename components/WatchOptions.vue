<template>
    <div v-if="watchOptions.length" class="flex">
        <div class="flex justify-center flex-wrap max-md:gap-3 md:gap-4 bg-neutral-800
            max-md:px-2 md:px-4 max-md:pt-4 max-md:pb-2 md:pt-5 md:pb-2 rounded-2xl relative min-w-28">
            <div class="absolute w-full -top-2 flex max-md:justify-center md:justify-start md:ml-5">
                <div class="left-2 bg-neutral-600 px-2 py-0 rounded-full text-xs
                    md:text-sm text-neutral-200 font-light">
                    Watch Now
                </div>
            </div>
            <div v-for="watchOption in watchOptions">
                <NuxtLink :to="watchOption.link" target="blank" noreferrer noopener @click.prevent="watchLinkClicked(watchOption)">
                    <div class="w-18 flex flex-col items-center justify-between">
                        <v-img :src="watchOption.image" class="max-md:w-6 max-md:h-6 md:w-6 md:h-6" :alt="watchOption.name"></v-img>
                        <div v-if="watchOption?.displayName" class="text-2xs md:text-xs text-neutral-200 text-center mt-1">
                            {{ watchOption.displayName }}
                        </div>
                        <div v-if="watchOption?.price?.length" class="text-2xs text-neutral-400 text-center">
                            {{ watchOption.price }}
                        </div>
                    </div>
                </NuxtLink>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watchOptionImageMapper } from '~/utils/watchOptions';

const props = defineProps(['googleData', 'tmdbRating', 'item'])
let watchOptions = [] as any[]

if (props.googleData?.allWatchOptions) {
    watchOptions = (props.googleData.allWatchOptions || []).map((watchOption: any) => {
        const mappedWatchOption = Object.entries(watchOptionImageMapper).find(([key, value]) => watchOption.name.toLowerCase().includes(key))
        return {
            name: watchOption.name,
            displayName: mappedWatchOption?.[1]?.name,
            link: watchOption.link,
            price: watchOption.price?.replace('Premium', ''),
            image: mappedWatchOption?.[1]?.image,
            key: mappedWatchOption?.[0]
        }
    }).sort((a: any, b: any) => {
        if (a.price?.toLowerCase().includes('subscription')) {
            return -1
        } else if (b.price?.toLowerCase().includes('subscription')) {
            return 1
        } else {
            return 0
        }
    })
    watchOptions = useUniqBy(watchOptions, 'name')
    watchOptions = useUniqBy(watchOptions, 'link')
}

const watchLinkClicked = (watchOption: any) => {
    const englishBackdrop = props.item?.images?.backdrops?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path
    window.open(watchOption.link, '_blank')
    $fetch('/api/user/continueWatching', {
        method: 'POST',
        body: JSON.stringify({
            itemId: props.item.id,
            isMovie: props.item.title ? true : false,
            poster_path: props.item.poster_path,
            backdrop_path: englishBackdrop || props.item.backdrop_path,
            title: props.item.title,
            name: props.item.name,
            watchLink: watchOption.link,
            watchProviderName: watchOption.key,
        })
    })
}
</script>
