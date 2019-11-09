<script setup lang="ts">
import { movieGenres } from '@/constants';
import { computed } from 'vue';
defineProps<{
  trending: Array<any>
}>();
const getGenres = ({genre_ids}) => {
    return genre_ids.map((genreId: number) => movieGenres.find(({id}) => genreId === id)?.name).filter(Boolean);
};
</script>

<template>
    <div class="overflow-x-auto">
        <div class="inline-flex">
            <div class="flex flex-col h-96 w-56 m-4" v-for="item in trending" :key="item.id">
                <img class="object-contain rounded-md hover:scale-105 hover:shadow-2xl duration-150 cursor-pointer
                    hover:ring-2 hover:ring-neutral-800 hover:ring-offset-4 hover:ring-offset-neutral-600"
                    :src="`https://image.tmdb.org/t/p/original${item.poster_path}`" />
                <div class="flex flex-col justify-between p-1">
                    <div class="text-sm font-thin">
                        <!-- {{item?.title || item?.name}} -->
                        {{getGenres(item).join(', ')}}
                    </div>
                    <!-- <div class="text-sm bg-neutral-600 bg-opacity-40 rounded-lg">
                        {{item?.overview}}
                    </div> -->
                </div>
            </div>
        </div>
    </div>
</template>
