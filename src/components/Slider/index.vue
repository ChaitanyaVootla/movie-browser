<template>
    <div :class="`${id} main-slider-div ${history ? 'history-slider' : ''}`">
        <slot>
            <h1 v-if="heading" class="slider-heading ml-1" :style="{ 'padding-top': history ? '10px' : '1em' }">
                {{ heading }}
                <router-link v-if="externalLink" class="ml-2" :to="externalLink">
                    <span class="external-link-text">see all</span>
                </router-link>
            </h1>
        </slot>
        <div class="slider-container">
            <div class="scroll-item" v-on:click="slideLeft">
                <i class="el-icon-arrow-left"></i>
            </div>
            <div v-if="isPerson" class="slider-bar" :id="`scroll-bar-${uuid}`">
                <person-card
                    v-for="(person, index) in items"
                    :key="`${person.id}-${index}`"
                    :person="person"
                    :configuration="configuration"
                    :imageRes="'w185'"
                    :disableRatingShadow="true"
                    :class="isSliding ? 'no-pointer-events' : ''"
                ></person-card>
            </div>
            <div v-else-if="isEpisode" class="slider-bar" :id="`scroll-bar-${uuid}`">
                <episode-card
                    v-for="(episode, index) in items"
                    :episode="episode"
                    :configuration="configuration"
                    :imageRes="'w500'"
                    :key="`${episode.id}-${index}`"
                    :disableRatingShadow="true"
                    :showHeader="showHeader"
                    :openEpisodeDialog="openEpisodeDialog"
                    :class="isSliding ? 'no-pointer-events' : ''"
                ></episode-card>
            </div>
            <div
                v-else-if="isContinueWatching"
                class="slider-bar wide-card-slider-container"
                :id="`scroll-bar-${uuid}`"
            >
                <continue-watching
                    v-for="(item, index) in items"
                    :item="item"
                    :configuration="configuration"
                    :imageRes="'w500'"
                    :key="`${item.id}-${index}`"
                    :disableRatingShadow="true"
                    :showHeader="showHeader"
                    :class="isSliding ? 'no-pointer-events' : ''"
                ></continue-watching>
            </div>
            <div v-else-if="isWideCard" class="slider-bar wide-card-slider-container" :id="`scroll-bar-${uuid}`">
                <wide-card
                    v-for="(item, index) in items"
                    :item="item"
                    :configuration="configuration"
                    :imageRes="'w500'"
                    :key="`${item.id}-${index}`"
                    :disableRatingShadow="true"
                    :showHeader="showHeader"
                    :class="isSliding ? 'no-pointer-events' : ''"
                ></wide-card>
            </div>
            <div v-else class="slider-bar" :id="`scroll-bar-${uuid}`">
                <movie-card
                    v-for="(movie, index) in items"
                    :movie="movie"
                    :configuration="configuration"
                    :imageRes="'w500'"
                    :onSelected="showMovieInfoModal"
                    :key="`${movie.id}-${index}`"
                    :disableRatingShadow="true"
                    :showFullMovieInfo="showFullMovieInfo"
                    :hideWatched="hideWatched"
                    :hideBadge="hideBadge"
                    :class="isSliding ? 'no-pointer-events' : ''"
                ></movie-card>
            </div>
            <div class="scroll-item scroll-item-right" v-on:click="slideRight">
                <i class="el-icon-arrow-right"></i>
            </div>
        </div>
        <el-dialog :visible.sync="episodeDialogVisible">
            <div class="episode-dialog-heading">
                <h5>{{ dialogEpisode.name }}</h5>
                <div class="tmdb-rating" v-if="dialogEpisode.vote_average">
                    <div>{{ dialogEpisode.vote_average.toFixed(1) }} <i class="fa-solid fa-star"></i></div>
                    <div class="vote_count">{{ dialogEpisode.vote_count }} votes</div>
                </div>
            </div>
            Episode {{ dialogEpisode.episode_number
            }}<span v-if="dialogEpisode.air_date"> - {{ getDateText(dialogEpisode.air_date) }}</span>

            <p>{{ dialogEpisode.overview }}</p>

            <el-carousel height="700px" style="padding: 1em 0">
                <el-carousel-item v-for="image in dialogEpisode.images.stills" :key="image.file_path">
                    <div class="justify-center">
                        <img
                            v-lazy="{
                                src: `${configuration.images.secure_base_url}h632${image.file_path}`,
                            }"
                            height="700px"
                        />
                    </div>
                </el-carousel-item>
            </el-carousel>
        </el-dialog>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { v4 as uuidv4 } from 'uuid';
import { getFullDateText, getDateText } from '@/common/utils';

export default {
    name: 'mbSlider',
    props: [
        'items',
        'isPerson',
        'isEpisode',
        'isContinueWatching',
        'isWideCard',
        'configuration',
        'id',
        'heading',
        'hideWatched',
        'showMovieInfoModal',
        'showFullMovieInfo',
        'externalLink',
        'history',
        'hideBadge',
        'showHeader',
        'seriesInfo',
        'seasonInfo',
    ],
    data() {
        return {
            scrollValue: 500,
            selectedMovie: {},
            showInfo: false,
            uuid: 0,
            isSliding: false,
            episodeDialogVisible: false,
            dialogEpisode: {
                images: {
                    still: [],
                },
            } as any,
            getFullDateText,
            getDateText,
        };
    },
    mounted() {
        this.uuid = uuidv4();
        setTimeout(() => {
            const slider = document.querySelector(`#scroll-bar-${this.uuid}`) as any;
            let isDown = false;
            let startX;
            let scrollLeft;

            slider.addEventListener('mousedown', (e: any) => {
                isDown = true;
                startX = e.pageX - slider.offsetLeft;
                scrollLeft = slider.scrollLeft;
            });
            slider.addEventListener('mouseleave', () => {
                isDown = false;
                this.isSliding = false;
            });
            slider.addEventListener('mouseup', () => {
                isDown = false;
                this.isSliding = false;
            });
            slider.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                this.isSliding = true;
                const x = e.pageX - slider.offsetLeft;
                const walk = x - startX;
                slider.scrollLeft = scrollLeft - walk;
            });
        });
    },
    methods: {
        slideLeft: function () {
            $(`.${this.id} .slider-bar`).css('scroll-behavior', 'smooth');
            $(`.${this.id} .slider-bar`)[0].scrollLeft -= $(`.${this.id} .slider-bar`)[0].clientWidth;
            $(`.${this.id} .slider-bar`).css('scroll-behavior', '');
        },
        slideRight: function () {
            $(`.${this.id} .slider-bar`).css('scroll-behavior', 'smooth');
            $(`.${this.id} .slider-bar`)[0].scrollLeft += $(`.${this.id} .slider-bar`)[0].clientWidth;
            $(`.${this.id} .slider-bar`).css('scroll-behavior', '');
        },
        async openEpisodeDialog(episode) {
            this.dialogEpisode = Object.assign(episode, { images: { stills: [] } });
            this.dialogEpisode.images = await api.getEpisodeImages(
                this.seriesInfo.id,
                this.seasonInfo.season_number,
                this.dialogEpisode.episode_number,
            );
            this.episodeDialogVisible = true;
        },
    },
};
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';
.slider-bar {
    display: flex;
    overflow-x: auto;
    overflow-y: visible !important;
    position: relative;
    padding: 0 0.5em;
    margin-right: 0.5em;
    padding-top: 1em;
    padding-bottom: 1em;
    width: 100%;
}
.episode-dialog-heading {
    display: flex;
    align-items: center;
}
.tmdb-rating {
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: 500;
    margin-left: 0.5rem;
    svg {
        font-size: 12px;
        color: gold;
    }
    .vote_count {
        margin-left: 0.5rem;
        font-size: 0.8rem;
        color: #bdbdbd;
    }
}
.external-link-text {
    text-decoration: underline;
    font-size: 80%;
    font-weight: 400;
    &:hover {
        color: @link-color-red;
    }
}
.no-pointer-events {
    pointer-events: none;
}
.slider-bar::-webkit-scrollbar {
    display: none;
}
.slider-heading {
    font-size: 1.4em;
    font-weight: 500;
    padding-left: 2.2em;
    padding-top: 1em;
    margin-bottom: 0;
}
.history-slider .slider-heading {
    padding-top: 0.2em !important;
    font-size: 1.2em;
}
.scroll-item {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 0 0.5em;
    cursor: pointer;
    i {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        // background: @translucent-bg;
        height: 2em;
        // width: 2em;
        border-radius: 5px;
    }
}
// .scroll-item-right {
//     i {
//         background: linear-gradient(to right, #1b1b1b 0%,#111 100%);
//     }
// }
.slider-container {
    display: flex;
}
.slider-container:hover {
    .scroll-item {
        transition-duration: 150ms;
        transform: scale(1.8);
        color: white !important;
    }
}
.main-slider-div {
    padding-bottom: 1em;
}
/deep/ .img-container {
    margin: 0 0.2em;
    min-width: 8em;
}
/deep/ .movie-item {
    margin-right: 1.5em !important;
}
/deep/ .person-card-image {
    height: 11em !important;
    margin: 0 0.2em;
}
.history-slider /deep/ .el-badge__content {
    display: none;
}
.wide-card-slider-container {
    margin-top: 0.5rem;
}
@media (max-width: 767px) {
    .scroll-item {
        background: transparent;
        padding: 0.3em;
        display: none;
    }
    .wide-card-slider-container {
        overflow-y: hidden !important;
    }
    .slider-bar {
        padding: 0;
    }
    .slider-heading {
        padding-left: 0;
        padding-bottom: 5px;
    }
    /deep/ .movie-item {
        width: @mobile-card-width !important;
        height: auto !important;
        margin-right: 0.5em !important;
    }
    /deep/ .movie-card-image {
        width: @mobile-card-width !important;
        height: auto !important;
    }
}
</style>
