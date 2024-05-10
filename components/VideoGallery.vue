<template>
    <div class="px-14 pb-20">
        <NuxtImg src="images/youtube.svg" class="h-6 mb-4"></NuxtImg>
        <div class="flex justify-between grow video-scroller">
            <div class="video w-2/3" :key="currentVideo.key">
                <iframe id="ytplayer" type="text/html" width="100%" height="100%"
                :src="`https://www.youtube.com/embed/${currentVideo.key}?playlist=${currentVideo.key}&loop=1`"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                title="YouTube video player"
                frameborder="0"></iframe>
                <div class="flex gap-5 mt-4 justify-between px-2">
                    <div class="text-neutral-200 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4">
                        <div class="font-semibold">{{ currentVideo.name }}</div>
                        <div class="text-neutral-300">
                            <span class="font-semibold mr-2">{{ formatNumber(videoStats?.viewCount || 0) }} views</span>
                            <span v-if="videoStats?.dateCreated" class="text-sm">
                                {{ humanizeDateFull(currentVideo.published_at) }}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div class="flex items-center bg-neutral-800 rounded-full py-1 px-6 text-sm">
                            <div class="mr-2">
                                <v-icon icon="mdi-thumb-up-outline" class="mr-2"></v-icon>
                                <b>{{ formatNumber(videoStats?.likes || 0) }}</b>
                            </div>
                            <div class="border-r-2 border-neutral-700 h-5 w-2 mr-2"></div>
                            <div>
                                <v-icon icon="mdi-thumb-down-outline" class="mr-2"></v-icon>
                                <b>{{ formatNumber(videoStats?.dislikes || 0) }}</b>
                            </div>
                        </div>
                        <div class="pt-1">
                            <v-progress-linear :model-value="getVideoLikePercentage()" class="mt-2" :height="2" bg-opacity="0.3"></v-progress-linear>
                        </div>
                    </div>
                </div>
            </div>
            <div class="px-10 flex w-1/3 flex-col overflow-auto">
                <div class="flex gap-3 pb-5">
                    <v-btn rounded="lg" size="small" v-for="type in videoTypes" @click="videoFilter = type" :key="type"
                        :class="videoFilter === type?'!bg-neutral-100':'!bg-neutral-800 !text-neutral-100'"
                        class="!font-bold">
                        {{ type }}
                    </v-btn>
                </div>
                <div v-for="video in filteredVideos">
                    <div class="flex py-2 pl-2 cursor-pointer hover:bg-neutral-900" :class="{currentVideo: video.key === currentVideo.key}" :key="video.key"
                        @click="updateCurrentVideo(video)">
                        <div class="w-1/3 mr-2 rounded-lg border-2 border-neutral-900">
                            <v-img :src="`https://img.youtube.com/vi/${video.key}/sddefault.jpg`"
                                class="w-full h-full"
                                cover
                                :alt="video.name">
                                <template v-slot:placeholder>
                                    <v-skeleton-loader class="video-image" type="image" />
                                </template>
                                <template v-slot:error>
                                    <v-skeleton-loader class="video-image" type="image" >
                                        <div></div>
                                    </v-skeleton-loader>
                                </template>
                            </v-img>
                        </div>
                        <div class="w-2/3 pt-4">
                            <div class="text-neutral-200 overflow-ellipsis overflow-hidden pr-4 text-tiny">
                                <div class="line-clamp-2 font-semibold">{{ video.name }}</div>
                                <div class="mt-3 text-neutral-400">
                                    <div class="font-semibold mr-2">{{ video.snippet?.channelTitle }}</div>
                                    <div class="mt-1 text-sm">
                                        <span class="font-semibold mr-2">{{ formatNumber(video.statistics?.viewCount || 0) }} views</span>
                                        <span>{{ humanizeDateFull(video.published_at || 0) }}</span>
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
const filteredVideos = ref(videos);
let currentVideo = ref(videos[0])
let videoStats = ref(null) as any;
let videoTypes = ['All'].concat(useUniq(videos.map(video => video.type)));
let videoFilter = ref('All');

watch(videoFilter, () => {
    if (videoFilter.value === 'All') {
        filteredVideos.value = videos;
    } else {
        filteredVideos.value = videos.filter(video => video.type === videoFilter.value);
    }
})

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
@video-width: 60vw;
@video-height: calc(@video-width * 0.55);
:deep(.video-scroller) {
    height: @video-height;
    .currentVideo {
        background-color: #1f1f1f;
    }
}

@video-image-height: 18rem;
@video-image-width: (@video-image-height);
:deep(.video-image) {
    height: @video-image-height;
    width: calc(@video-image-height * 4/3);
}
</style>