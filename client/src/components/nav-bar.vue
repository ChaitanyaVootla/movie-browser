<script setup lang="ts">
defineProps({
    toggleTheme: {
        type: Function,
        required: true,
    },
});
</script>

<template>
    <div>
        <div class="flex p-3 justify-between fixed w-screen
            bg-neutral-50 border-b-2 shadow-sm text-neutral-800
            dark:bg-black dark:text-white dark:border-0">
            <div class="flex gap-12 flex-1 pl-4">
                <div class="hover:text-red-600 cursor-pointer leading-10">
                    <i class="fa-solid fa-house text-xl mr-2"></i>
                    <span class="text-base">Home</span>
                </div>
                <div class="hover:text-red-600 cursor-pointer leading-10">
                    <i class="fa-solid fa-clapperboard text-xl mr-2"></i>
                    <span class="text-base">Browse</span>
                </div>
                <div class="hover:text-red-600 cursor-pointer leading-10">
                    <i class="fa-solid fa-bars-staggered text-xl mr-2"></i>
                    <span class="text-base">Watch List</span>
                </div>
            </div>
            <div class="flex-1 flex justify-center">
                <input
                    class="w-full dark:bg-neutral-900 pl-2 pr-2 rounded-sm border-2 dark:border-neutral-800
                        focus:outline-none focus:ring-1 focus:ring-neutral-800"
                    placeholder="Search"
                />
            </div>
            <div class="flex-1">
                <div @click="toggleTheme(null, true)" class="float-right leading-10 pr-2 cursor-pointer">
                    <i class="fa-solid fa-circle-half-stroke"></i>
                </div>
            </div>
        </div>
    </div>
</template>
