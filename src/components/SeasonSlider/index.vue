<template>
    <div :class="`${id} main-slider-div`">
        <div class="slider-heading">
            <!-- {{heading}}
            <span class="small-text pl-2">
                {{airDate}}
            </span> -->
        </div>
        <div class="slider-container">
            <div class="scroll-item" v-on:click="slideLeft">
                <!-- <font-awesome-icon :icon="['fas', 'chevron-left']" /> -->
                <i class="el-icon-arrow-left"></i>
            </div>
            <div class="slider-bar" id="scroll-bar">
                <episode-card
                    v-for="(movie, index) in movies"
                    :episode="movie"
                    :configuration="configuration"
                    :imageRes="'w500'"
                    :onSelected="showMovieInfoModal"
                    :key="movie.id + index"
                    :disableRatingShadow="true"
                    :showFullMovieInfo="showFullMovieInfo"
                    :showHeader="showHeader"
                    :openEpisodeDialog="openEpisodeDialog"
                ></episode-card>
            </div>
            <div class="scroll-item scroll-item-right" v-on:click="slideRight">
                <!-- <font-awesome-icon :icon="['fas', 'chevron-right']" /> -->
                <i class="el-icon-arrow-right"></i>
            </div>
        </div>
        <!-- <movie-info v-show="showInfo" :movie="selectedMovie" :configuration="configuration" :imageRes="'w500'"
            :closeInfo="closeInfo"></movie-info> -->
        <el-dialog :visible.sync="episodeDialogVisible">
            <h5>{{ dialogEpisode.name }}</h5>
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
import { api } from '../../API/api';
import { getFullDateText, getDateText } from '../../Common/utils';

export default {
    name: 'seasonSlider',
    props: [
        'movies',
        'configuration',
        'id',
        'heading',
        'airDate',
        'showMovieInfoModal',
        'showFullMovieInfo',
        'seriesInfo',
        'seasonInfo',
        'showHeader',
    ],
    data() {
        return {
            scrollValue: 500,
            selectedMovie: {},
            dialogEpisode: {
                images: {
                    still: [],
                },
            },
            showInfo: false,
            getFullDateText,
            getDateText,
            episodeDialogVisible: false,
        };
    },
    methods: {
        async openEpisodeDialog(episode) {
            this.dialogEpisode = Object.assign(episode, { images: { stills: [] } });
            this.dialogEpisode.images = await api.getEpisodeImages(
                this.seriesInfo.id,
                this.seasonInfo.season_number,
                this.dialogEpisode.episode_number,
            );
            this.episodeDialogVisible = true;
        },
        slideLeft: function () {
            $(`.${this.id} .slider-bar`)[0].scrollLeft -= $(`.${this.id} .slider-bar`)[0].clientWidth;
        },
        slideRight: function () {
            $(`.${this.id} .slider-bar`)[0].scrollLeft += $(`.${this.id} .slider-bar`)[0].clientWidth;
        },
        showMovieInfo: async function (movie: any) {
            this.showMovieInfoModal(movie);
            // const self = this;
            // this.selectedMovie = movie;
            // this.showInfo = true;
            // setTimeout(
            //     function() {
            //         $(`.${self.id} .info-container`)[0].scrollIntoView({behavior: "smooth"});
            //     }
            // );
        },
        closeInfo: function () {
            this.showInfo = false;
        },
    },
};
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';
.slider-bar {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    justify-content: space-between;
    position: relative;
    padding: 0 0.5em;
    margin-right: 0.5em;
}
.slider-bar::-webkit-scrollbar {
    display: none;
}
.justify-center {
    display: flex;
    justify-content: center;
}
.slider-heading {
    font-size: 17px;
    font-weight: 500;
    padding-left: 2.2em;
    padding-top: 1em;
    padding-bottom: 0.4em;
}
.scroll-item {
    background: #333;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: linear-gradient(to right, #111 0%, #1b1b1b 100%);
    padding: 0 0.5em;
    cursor: pointer;
}
.scroll-item-right {
    background: linear-gradient(to right, #1b1b1b 0%, #111 100%);
    margin-left: auto;
}
.slider-container {
    display: flex;
    width: 100%;
}
.main-slider-div {
    padding-bottom: 0;
}
.small-text {
    font-size: 0.8em;
}
@media (max-width: 767px) {
    .scroll-item {
        background: transparent;
        padding: 0.3em;
        display: none;
    }
    .slider-bar {
        padding: 0;
        height: 10em;
    }
    .slider-heading {
        padding-left: 1.3em;
    }
    /deep/ .episode-card-image {
        width: @mobile-wide-card-width !important;
        height: auto !important;
    }
}
</style>
