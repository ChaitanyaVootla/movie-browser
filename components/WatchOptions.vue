<template>
    <div v-if="watchOptions.length" class="flex">
        <div class="flex justify-center flex-wrap max-md:gap-3 md:gap-4 bg-neutral-900 border-[1px] border-neutral-700
            max-md:px-2 md:px-4 max-md:pt-4 max-md:pb-2 md:pt-6 md:pb-2 rounded-2xl relative min-w-32">
            <div class="absolute w-full max-md:-top-2 -top-4 flex max-md:justify-center md:justify-start md:ml-5">
                <div class="bg-neutral-700 pl-1 pr-2 py-0 rounded-full text-xs 
                    font-light flex items-center text-nowrap">
                    <span class="material-symbols-outlined !text-[22px] md:!text-4xl text -m-1"
                        style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                    Watch Now
                    <v-menu v-if="false" v-model="isOpen" :close-on-content-click="false">
                        <template v-slot:activator="{ props }">
                            <div v-bind="props" class="px-2 py-1 flex items-center rounded-full cursor-pointer gap-2">
                                <v-img
                                    :src="`https://flagcdn.com/${selectedCountry.code.toLowerCase()}.svg`"
                                    :alt="`Flag of ${selectedCountry.name}`"
                                    class="w-6 h-4 rounded-md"
                                ></v-img>
                                <div class="text-xs text-neutral-100">{{ selectedCountry.code }}</div>
                            </div>
                        </template>
                        <v-card min-width="300">
                            <v-card-text>
                                <v-text-field
                                v-model="search"
                                label="Search countries"
                                prepend-inner-icon="mdi-magnify"
                                variant="outlined"
                                focused
                                hide-details
                                ></v-text-field>
                            </v-card-text>
                            <v-list height="300" class="overflow-y-auto">
                                <v-list-item
                                    v-for="country in filteredCountries"
                                    :key="country"
                                    @click="selectCountry(country)"
                                    >
                                    <v-list-item-title>
                                        {{ country }}
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-card>
                    </v-menu>
                </div>
            </div>
            <div v-for="watchOption in watchOptions">
                <NuxtLink :to="watchOption.link" target="blank" noreferrer noopener
                    @click.prevent="watchLinkClicked(watchOption)">
                    <div class="w-18 flex flex-col items-center justify-between">
                        <v-img :src="watchOption.image" class="max-md:w-6 max-md:h-6 md:w-6 md:h-6 rounded-sm"
                            :alt="watchOption.name"></v-img>
                        <div v-if="watchOption?.displayName"
                            class="text-2xs md:text-xs text-neutral-200 text-center mt-1">
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
import { getCode, getName } from 'country-list';
import { userStore } from '~/plugins/state';
import { getBaseUrl } from '~/utils/url';
import { watchOptionImageMapper } from '~/utils/watchOptions';

interface Country {
  code: string;
  name: string;
}

const props = defineProps(['googleData', 'tmdbRating', 'item'])
let watchOptions = [] as any[]
const watchOptionsByCountry: any = {};
let isOpen = ref(false);
const userData = userStore();
const selectedCountry = ref<Country>({ code: 'IN', name: getName('IN') as string })
const search = ref('')

if (props.item.watchProviders) {
    Object.entries(props.item.watchProviders).forEach(([country, value]: [string, any]) => {
        const mappedProviders: any[] = [];
        Object.entries({
            buy: value.buy,
            rent: value.rent,
            flatrate: value.flatrate,
        }).forEach(([type, providers]) => {
            (providers || []).forEach((provider: any) => {
                if (!mappedProviders.find((item: any) => item.key === provider.provider_id)) {
                    mappedProviders.push({
                        name: provider.provider_name,
                        displayName: provider.provider_name,
                        image: `https://image.tmdb.org/t/p/w154${provider.logo_path}`,
                        price: type,
                        link: provider.link,
                        key: provider.provider_id,
                        isJustWatch: true
                    })
                } else {
                    const existingProvider = mappedProviders.find((item: any) => item.key === provider.provider_id)
                    existingProvider.price = `${existingProvider.price}, ${type}`
                }
            })
        })
        if (mappedProviders.length) {
            watchOptionsByCountry[country] = mappedProviders;
        }
    })
}

if (props.googleData?.allWatchOptions?.length > 0) {
    watchOptions = (props.googleData.allWatchOptions || []).map((watchOption: any) => {
        const mappedWatchOption = Object.entries(watchOptionImageMapper).find(([key, value]) =>
            (watchOption.name || getBaseUrl(watchOption.link)).toLowerCase().includes(key))
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
    watchOptions = watchOptions.filter((watchOption: any) => watchOption.name)
    watchOptions = useUniqBy(watchOptions, 'name')
    watchOptions = useUniqBy(watchOptions, 'link')
    watchOptionsByCountry['IN'] = watchOptions
} else {
    if (props.item.homepage) {
        const homepageOption = Object.entries(watchOptionImageMapper).find(([key, value]) =>
                (getBaseUrl(props.item.homepage)).toLowerCase().includes(key))
        if (homepageOption) {
            const watchOption = {
                displayName: homepageOption?.[1]?.name,
                link: homepageOption?.[1]?.linkMorph? homepageOption?.[1]?.linkMorph(props.item.homepage): props.item.homepage,
                image: homepageOption?.[1]?.image,
                key: homepageOption?.[0]
            }
            watchOptions.push(watchOption)
        }
    }
}

const countries = Object.keys(watchOptionsByCountry).map((country) => getName(country) || 'Unknown')
const filteredCountries = computed(() => {
  if (!search.value) return countries;
  const searchLower = search.value.toLowerCase()
  return countries.filter(country => country.toLowerCase().includes(searchLower))
})

const selectCountry = (country: string) => {
    selectedCountry.value = {
        code: getCode(country) || 'Unknown',
        name: country
    }
    isOpen.value = false
}

if (!watchOptionsByCountry[selectedCountry.value.code]) {
    selectedCountry.value = {
        code: 'US',
        name: getName('US') as string
    }
    if (!watchOptionsByCountry[selectedCountry.value.code] && Object.keys(watchOptionsByCountry).length) {
        selectedCountry.value = {
            code: Object.keys(watchOptionsByCountry)[0],
            name: getName(Object.keys(watchOptionsByCountry)[0]) as string
        }
    }
}

const watchLinkClicked = (watchOption: any) => {
    if (watchOption.isJustWatch) {
        return
    }
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
