<script setup lang="ts">
defineProps({
    items: {
        type: Array<any>,
        required: true,
    },
    heading: {
        type: String,
    },
});
</script>

<template>
    <div class="text-2xl text-black dark:text-white pl-5">
        {{heading}}
    </div>
    <div class="overflow-x-auto">
        <div class="inline-flex">
            <div
                v-for="item of items" :key="item?.id"
                class="m-4 w-48 h-auto hover:scale-105 transition-all duration-150">
                <div>
                    <img
                        class="rounded-md cursor-pointer"
                        :src="`https://image.tmdb.org/t/p/w500${item.poster_path}`"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
