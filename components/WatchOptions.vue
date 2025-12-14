<template>
    <div v-if="currentWatchOptions.length" class="flex">
        <div class="flex items-center justify-center flex-wrap max-md:gap-3 md:gap-4 bg-neutral-900 border-[1px] border-neutral-700
            max-md:pl-2 max-md:pr-7 md:pl-4 md:pr-8 max-md:pt-4 max-md:pb-2 md:pt-6 md:pb-2 rounded-2xl relative min-w-32">
            <div class="absolute w-full max-md:-top-2 -top-4 flex max-md:justify-center md:justify-start md:ml-5">
                <div class="bg-neutral-700 pl-1 pr-2 py-0 rounded-full text-xs 
                    font-light flex items-center text-nowrap">
                    <span class="material-symbols-outlined !text-[22px] md:!text-4xl text -m-1"
                        style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                    <div>
                        Watch Now
                        <div v-if="sourceCountry && sourceCountry !== selectedCountry.code" class="text-[10px] text-neutral-400 mt-1 leading-none">
                            Available in {{ getName(sourceCountry) }}
                        </div>
                    </div>
                    <v-menu v-if="false" v-model="isOpen" :close-on-content-click="false">
                        <template v-slot:activator="{ props }">
                            <div v-bind="props" class="px-2 py-1 flex items-center rounded-full cursor-pointer gap-2">
                                <SeoImg
                                    :src="`https://flagcdn.com/${selectedCountry.code.toLowerCase()}.svg`"
                                    :alt="`Flag of ${selectedCountry.name}`"
                                    class="w-6 h-4 rounded-md"
                                ></SeoImg>
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
            <div v-for="watchOption in visibleWatchOptions">
                <NuxtLink :to="watchOption.link" target="blank" noreferrer noopener
                    @click.prevent="watchLinkClicked(watchOption)" class="cursor-pointer">
                    <div class="w-18 flex flex-col items-center justify-between">
                        <SeoImg :src="watchOption.image" class="max-md:w-6 max-md:h-6 md:w-6 md:h-6 rounded-sm"
                            :alt="watchOption.name"></SeoImg>
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
            <div v-if="currentWatchOptions.length > 5" 
                class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center cursor-pointer text-neutral-500 hover:text-white transition-colors"
                @click="expanded = !expanded">
                <span class="material-symbols-outlined text-2xl">{{ expanded ? 'chevron_left' : 'chevron_right' }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { getCode, getName } from 'country-list';
import { userStore } from '~/plugins/state';
import { getBaseUrl } from '~/utils/url';
import { watchOptionImageMapper } from '~/utils/watchOptions';
import _ from 'lodash';

interface Country {
  code: string;
  name: string;
}

const props = defineProps(['googleData', 'tmdbRating', 'item'])
let watchOptions = [] as any[]
let watchOptionsByCountry: any = {};
let isOpen = ref(false);
const userData = userStore();
const selectedCountry = ref<Country>({ code: 'IN', name: getName('IN') as string })
const search = ref('')

// Parse TMDB Watch Providers
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

// Parse Scraped Watch Options (assumed to be for India)
let scrapedWatchOptions: any[] = [];
if (props.item.watch_options) {
    scrapedWatchOptions = props.item.watch_options;
} else if (props.googleData?.allWatchOptions?.length > 0) {
    scrapedWatchOptions = (props.googleData.allWatchOptions || []).map((watchOption: any) => {
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
    scrapedWatchOptions = scrapedWatchOptions.filter((watchOption: any) => watchOption.name)
    scrapedWatchOptions = _.uniqBy(scrapedWatchOptions, 'name')
    scrapedWatchOptions = _.uniqBy(scrapedWatchOptions, 'link')
} else {
     if (props.item.homepage) {
        const homepageOption = Object.entries(watchOptionImageMapper).find(([key, value]) =>
                (getBaseUrl(props.item.homepage)).toLowerCase().includes(key))
        if (homepageOption) {
            const watchOption = {
                displayName: homepageOption?.[1]?.name,
                link: (homepageOption?.[1] as any)?.linkMorph ? (homepageOption?.[1] as any).linkMorph(props.item.homepage) : props.item.homepage,
                image: homepageOption?.[1]?.image,
                key: homepageOption?.[0]
            }
            scrapedWatchOptions.push(watchOption)
        }
    }
}

const getOptionsForCode = (code: string) => {
    if (code === 'IN') {
        if (scrapedWatchOptions.length > 0) return scrapedWatchOptions;
        return watchOptionsByCountry[code] || [];
    }
    return watchOptionsByCountry[code] || [];
}

const sourceCountry = ref('');
const expanded = ref(false);

const currentWatchOptions = computed(() => {
    const targetCode = selectedCountry.value.code;
    const fallbackPriority = ['US', 'GB', 'FR', 'DE', 'IN', 'JP', 'KR'];
    let options = [];
    
    // Try selected country
    options = getOptionsForCode(targetCode);
    sourceCountry.value = targetCode;

    // Fallback if no options
    if (options.length === 0) {
        for (const fallbackCode of fallbackPriority) {
            // Avoid re-checking the target code if it's in the fallback list
            if (fallbackCode === targetCode) continue;

            const fallbackOpts = getOptionsForCode(fallbackCode);
            if (fallbackOpts.length > 0) {
                options = fallbackOpts;
                sourceCountry.value = fallbackCode;
                break;
            }
        }
    }
    
    return options;
});

const visibleWatchOptions = computed(() => {
    if (expanded.value || currentWatchOptions.value.length <= 5) {
        return currentWatchOptions.value;
    }
    return currentWatchOptions.value.slice(0, 5);
});

// Watch user store for country changes
watch(() => userData.loadInfo.countryCode, (newCode) => {
    if (newCode) {
        selectedCountry.value = {
            code: newCode,
            name: getName(newCode) || newCode
        };
    }
}, { immediate: true });


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
    // Update global store if needed, mostly just local override
    isOpen.value = false
}

// Initial Logic handled by computed


const watchLinkClicked = (watchOption: any) => {
    if (watchOption.isJustWatch) {
        const title = props.item.title || props.item.name;
        const encodedTitle = encodeURIComponent(title);
        const providerName = watchOption.displayName || watchOption.name;
        const url = `https://www.google.com/search?q=${encodedTitle} watch on ${providerName}`;
        window.open(url, '_blank');
        return;
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
