<template>
    <div class="navbar flex justify-between font-semibold text-xl items-center
        shadow-md shadow-neutral-800 pl-20 pr-20 overflow-visible bg-neutral-950">
        <div class="left-actions flex-1 flex gap-20">
            <div class="flex items-center gap-2">
                <UIcon name="i-mdi-home" class="text-3xl" />
                Home
            </div>
            <div class="flex items-center gap-2">
                <UIcon name="i-mdi-movie-search" class="text-3xl" />
                Browse
            </div>
            <div class="flex items-center gap-2">
                <UIcon name="i-fa6-solid-bars-staggered" />
                Watch List
            </div>
        </div>
        <div class="center border-1 border-gray-700 bg-red-900 p-2 pl-3 pr-3 text-black">
            <UIcon name="i-mdi-video-vintage text-4xl" />
        </div>
        <div class="right flex-1 flex justify-end gap-4">
            <div class="search w-3/5">
                <UInput
                    icon="i-heroicons-magnifying-glass-20-solid"
                    size="md"
                    :trailing="false"
                    placeholder="Search..."
                />
            </div>
            <div class="user">
                <UAvatar icon="i-heroicons-photo" size="md" />
            </div>
        </div>
    </div>
</template>