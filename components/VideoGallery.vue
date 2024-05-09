<template>
    <div class="px-14 pb-10">
        <NuxtImg src="images/youtube.svg" class="h-6 mb-4"></NuxtImg>
        <div class="flex justify-between">
            <div class="video" :key="currentVideo.key">
                <iframe id="ytplayer" type="text/html" width="100%" height="100%"
                :src="`https://www.youtube.com/embed/${currentVideo.key}?playlist=${currentVideo.key}&loop=1`"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                title="YouTube video player"
                frameborder="0"></iframe>
                <div class="flex gap-5 mt-4 justify-between px-2">
                    <div class="text-neutral-200 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4">
                        {{ currentVideo.name }}
                        <div>
                            <span class="font-semibold mr-2">{{ formatNumber(videoStats?.viewCount || 0) }} views</span>
                            <span v-if="videoStats?.dateCreated" class="text-sm">
                                {{ humanizeDateFull(currentVideo.published_at) }}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div class="flex items-center bg-neutral-800 rounded-full py-1 px-6 text-sm">
                            <div class="mr-2">
                                <v-icon icon="mdi-thumb-up" class="mr-2"></v-icon>
                                <b>{{ formatNumber(videoStats?.likes || 0) }}</b>
                            </div>
                            <div class="border-r-2 border-neutral-700 h-5 w-2 mr-2"></div>
                            <div>
                                <v-icon icon="mdi-thumb-down" class="mr-2"></v-icon>
                                <b>{{ formatNumber(videoStats?.dislikes || 0) }}</b>
                            </div>
                        </div>
                        <div class="px-1">
                            <v-progress-linear :model-value="getVideoLikePercentage()" class="mt-2" :height="2" bg-opacity="0.3"></v-progress-linear>
                        </div>
                    </div>
                </div>
            </div>
            <div class="px-10 flex flex-col gap-4 grow overflow-auto video-scroller">
                <div v-for="video in videos">
                    <div class="flex">
                        <v-img :src="`https://img.youtube.com/vi/${video.key}/sddefault.jpg`"
                            class="rounded-lg mr-2 video-image cursor-pointer hover:mb-1 hover:-mt-1 transition-all duration-200 border-transparent border-2 hover:border-neutral-600
                                grow"
                            cover
                            :alt="video.name"
                            @click="updateCurrentVideo(video)">
                            <template v-slot:placeholder>
                                <v-skeleton-loader class="video-image" type="image" />
                            </template>
                            <template v-slot:error>
                                <v-skeleton-loader class="video-image" type="image" >
                                    <div></div>
                                </v-skeleton-loader>
                            </template>
                        </v-img>
                        <div class="w-1/3">
                            <div class="text-neutral-200 overflow-ellipsis overflow-hidden pr-4">
                                <div class="line-clamp-2">{{ video.name }}</div>
                                <div class="mt-4">
                                    <div class="font-semibold mr-2">{{ video.snippet?.channelTitle }}</div>
                                    <div class="mt-2">
                                        <span class="font-semibold mr-2">{{ formatNumber(video.statistics?.viewCount || 0) }} views</span>
                                        <span class="text-sm">{{ humanizeDateFull(video.published_at || 0) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const { videos } = defineProps<{
    videos: any[]
}>()
let currentVideo = ref(videos[0])
let videoStats = ref(null) as any;

const updateVideoStatistics = async () => {
    videoStats.value = await $fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${currentVideo.value.key}`)
}
const getVideoLikePercentage = () => {
    if (!videoStats.value) return 0;
    const total = videoStats.value.likes + videoStats.value.dislikes;
    return (videoStats.value.likes / total) * 100;
}
onMounted(() => {
    updateVideoStatistics();
    getVideoDetails();
});
const getVideoDetails = async () => {
    const videoDetails: any[] = await $fetch('/api/youtube/videoDetails', {
        method: 'GET',
        params: {
            videoIds: videos.map(video => video.key).join(',')
        }
    });
    videos.forEach(video => {
        const details = videoDetails.find((vid: any) => vid.id === video.key);
        video.published_at = details.snippet.publishedAt;
        video.name = details.snippet.title;
        video.statistics = details.statistics;
        video.snippet = details.snippet;
    });
}
const updateCurrentVideo = (video: any) => {
    currentVideo.value = video;
    updateVideoStatistics()
}
</script>

<style scoped lang="less">
@video-width: 70vw;
@video-height: calc(@video-width * 9/16 - 100px);
:deep(.video) {
    height: @video-height;
    width: @video-width;
}
:deep(.video-scroller) {
    max-height: calc(@video-height + 2rem);
}

@video-image-height: 18rem;
:deep(.video-image) {
    height: @video-image-height;
    width: calc(@video-image-height * 4/3);
}
:deep(.wide-card) {
    width: calc(@video-image-height * 4/3);
}
@media (max-width: 768px) {
    @video-image-height: 7rem;
    :deep(.video-image) {
        height: @video-image-height;
        width: calc(@video-image-height * 4/3);
    }
    :deep(.wide-card) {
        width: calc(@video-image-height * 4/3);
    }
}
</style>