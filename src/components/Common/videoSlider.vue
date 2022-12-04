<template>
    <div v-if="videos.length" class="main-container">
        <div class="heading">
            <img src="/images/branding/ytLogo.png" class="ytLogo" />
            <el-button-group class="ml-3">
                <el-button
                    v-for="videoType in videoTypes"
                    :key="videoType"
                    @click="setVideoType(videoType)"
                    :type="selectedVideoType === videoType ? `danger` : `secondary`"
                >
                    {{ videoType }}
                </el-button>
            </el-button-group>
        </div>
        <div class="videos-container mt-3">
            <iframe
                v-for="video in filteredVideos"
                :id="`ytplayer-${video.id}`"
                title="YouTube video player"
                width="550px"
                height="300px"
                class="youtube-player"
                :src="`https://www.youtube.com/embed/${video.key}`"
                frameborder="0"
                controls="1"
                modestbranding="1"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                referrerpolicy="no-referrer"
            ></iframe>
        </div>
    </div>
</template>

<script lang="ts">
export default {
    name: 'videoSlider',
    props: {
        videos: Array,
    },
    data() {
        return {
            selectedVideoType: '',
        };
    },
    methods: {
        setVideoType(videoType: string) {
            if (videoType === this.selectedVideoType) {
                return (this.selectedVideoType = '');
            }
            this.selectedVideoType = videoType;
        },
    },
    computed: {
        videoTypes() {
            return Array.from(new Set(this.videos.map(({ type }) => type))) as string[];
        },
        filteredVideos() {
            return this.videos
                .filter(({ type }) => !this.selectedVideoType || type === this.selectedVideoType)
                .slice(0, 5);
        },
    },
};
</script>

<style scoped lang="less">
.main-container {
    .heading {
        font-size: 1.5rem;
        font-weight: 500;
        .ytLogo {
            height: 1.5rem;
        }
    }
    .videos-container {
        overflow-x: auto;
        overflow-y: visible !important;
        position: relative;
        padding: 0 0.5em;
        margin-right: 0.5em;
        padding-top: 1em;
        padding-bottom: 1em;
        width: 100%;
        gap: 20px;
        display: grid;
        iframe {
            grid-row: 1 / span 2;
            border-radius: 1rem;
        }
    }
    .videos-container::-webkit-scrollbar {
        display: none;
    }
    .el-button-group > .el-button:first-child {
        border-top-left-radius: 10px;
        border-bottom-left-radius: 10px;
    }
    .el-button-group > .el-button:last-child {
        border-top-right-radius: 10px;
        border-bottom-right-radius: 10px;
    }
}
@media (max-width: 767px) {
    .main-container {
        display: none;
    }
}
</style>
