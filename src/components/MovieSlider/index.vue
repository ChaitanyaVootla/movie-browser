<template>
    <div :class="`${id} main-slider-div`">
        <div class="slider-heading">{{heading}}</div>
        <div class="slider-container">
            <div class="scroll-item" v-on:click="slideLeft">
                <font-awesome-icon :icon="['fas', 'chevron-left']" />
            </div>
            <div class="slider-bar" id="scroll-bar">
                <movie-card v-for="movie in movies" :movie="movie" :configuration="configuration" :imageRes="'w500'"
                    :onSelected="showMovieInfo" :key="movie.id" :disableRatingShadow="true"></movie-card>
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
        name: 'movieSlider',
        props: ['movies', 'configuration', 'id', 'heading', 'showMovieInfoModal'],
        data() {
          return {
              scrollValue: 500,
              selectedMovie: {},
              showInfo: false
          }  
        },
        mounted() {
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
            }
        }
    }
</script>

<style scoped>
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
    }
    .slider-container {
        display: flex;
    }
    .main-slider-div {
        padding-bottom: 0;
    }
    ::v-deep .movie-card-image {
        height: 14em !important;
        margin: 0 0.2em;
    }
</style>
