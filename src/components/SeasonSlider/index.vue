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
                <font-awesome-icon :icon="['fas', 'chevron-left']" />
            </div>
            <div class="slider-bar" id="scroll-bar">
                <episode-card v-for="(movie, index) in movies" :episode="movie" :configuration="configuration" :imageRes="'w500'"
                    :onSelected="showMovieInfoModal" :key="movie.id + index" :disableRatingShadow="true" :showFullMovieInfo="showFullMovieInfo"></episode-card>
            </div>
            <div class="scroll-item scroll-item-right" v-on:click="slideRight">
                <font-awesome-icon :icon="['fas', 'chevron-right']" />
            </div>
        </div>
        <!-- <movie-info v-show="showInfo" :movie="selectedMovie" :configuration="configuration" :imageRes="'w500'"
            :closeInfo="closeInfo"></movie-info> -->
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
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
        ],
        data() {
          return {
              scrollValue: 500,
              selectedMovie: {},
              showInfo: false,
          }  
        },
        methods: {
            slideLeft: function () {
                $(`.${this.id} .slider-bar`)[0].scrollLeft -=  $(`.${this.id} .slider-bar`)[0].clientWidth;
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
            closeInfo: function() {
                this.showInfo = false;
            },
        },
    }
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
        background: linear-gradient(to right, #111 0%,#1b1b1b 100%);
        padding: 0 0.5em;
        cursor: pointer;
    }
    .scroll-item-right {
        background: linear-gradient(to right, #1b1b1b 0%,#111 100%);
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
