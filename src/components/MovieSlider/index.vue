<template>
    <div :class="`${id} main-slider-div ${history?'history-slider':''}`">
        <slot>
            <div class="slider-heading ml-1" :style="{'padding-top': history?'10px':'1em'}">
                <!-- <font-awesome-icon :icon="['fas', 'history']" v-if="history"/> -->
                {{heading}}
                <router-link v-if="showDiscoverLink" class="ml-2" :to="{
                    name: 'discover',
                    query:
                        {
                            with_people: personId,
                            people: name,
                        }
                    }">
                    <font-awesome-icon :icon="['fas', 'external-link-alt']"/>
                </router-link>
            </div>
        </slot>
        <div class="slider-container">
            <div class="scroll-item" v-on:click="slideLeft" v-show="isBarFull">
                <!-- <font-awesome-icon :icon="['fas', 'chevron-left']" /> -->
                <i class="el-icon-arrow-left"></i>
            </div>
            <div v-show="!isBarFull" class="ml-4"></div>
            <div class="slider-bar" :id="`scroll-bar-${uuid}`">
                <movie-card v-for="(movie, index) in movies" :movie="movie" :configuration="configuration" :imageRes="'w500'"
                    :onSelected="showMovieInfoModal" :key="movie.id + index" :disableRatingShadow="true" :showFullMovieInfo="showFullMovieInfo"
                    :hideBadge="hideBadge" :class="isSliding?'no-pointer-events':''"></movie-card>
            </div>
            <div class="scroll-item scroll-item-right" v-on:click="slideRight" v-show="isBarFull">
                <!-- <font-awesome-icon :icon="['fas', 'chevron-right']" /> -->
                <i class="el-icon-arrow-right"></i>
            </div>
        </div>
        <!-- <movie-info v-show="showInfo" :movie="selectedMovie" :configuration="configuration" :imageRes="'w500'"
            :closeInfo="closeInfo"></movie-info> -->
    </div>
</template>

<script lang="ts">
    import { v4 as uuidv4 } from 'uuid';

    export default {
        name: 'movieSlider',
        props: [
            'movies',
            'configuration',
            'id',
            'name',
            'personId',
            'heading',
            'showMovieInfoModal',
            'showFullMovieInfo',
            'showDiscoverLink',
            'history',
            'hideBadge',
        ],
        data() {
          return {
              scrollValue: 500,
              selectedMovie: {},
              showInfo: false,
              isBarFull: true,
              uuid: 0,
              isSliding: false,
          }  
        },
        mounted() {
            this.uuid = uuidv4();
            this.isBarFull = this.checkIsBarFull();
            setTimeout(
                () => {
                    const slider = document.querySelector(`#scroll-bar-${this.uuid}`);
                    let isDown = false;
                    let startX;
                    let scrollLeft;

                    slider.addEventListener('mousedown', (e) => {
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
                        if(!isDown) return;
                        this.isSliding = true;
                        const x = e.pageX - slider.offsetLeft;
                        const walk = (x - startX);
                        slider.scrollLeft = scrollLeft - walk;
                    });
                }
            )
        },
        methods: {
            slideLeft: function () {
                $(`.${this.id} .slider-bar`).css('scroll-behavior', 'smooth')
                $(`.${this.id} .slider-bar`)[0].scrollLeft -=  $(`.${this.id} .slider-bar`)[0].clientWidth;
                $(`.${this.id} .slider-bar`).css('scroll-behavior', '')
            },
            slideRight: function () {
                $(`.${this.id} .slider-bar`).css('scroll-behavior', 'smooth')
                $(`.${this.id} .slider-bar`)[0].scrollLeft += $(`.${this.id} .slider-bar`)[0].clientWidth;
                $(`.${this.id} .slider-bar`).css('scroll-behavior', '')
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
            checkIsBarFull() {
                // if ($(`.${this.id} .slider-bar`)[0] && $(`.${this.id} .slider-heading`)[0]) {
                //     return $(`.${this.id} .slider-bar`)[0].scrollWidth > $(`.${this.id} .slider-heading`)[0].clientWidth;
                // }
                return true;
            },
        },
    }
</script>

<style lang="less" scoped>
    @import '../../Assets/Styles/main.less';
    .slider-bar {
        display: flex;
        overflow-x: auto;
        overflow-y: visible !important;
        // scroll-behavior: smooth;
        justify-content: end;
        position: relative;
        padding: 0 0.5em;
        margin-right: 0.5em;
        padding-top: 1em;
        padding-bottom: 1em;
        width: 100%;
    }
    .no-pointer-events {
        pointer-events: none;
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
    .history-slider .slider-heading {
        padding-top: 0.2em !important;
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
    .main-slider-div {
        padding-bottom: 0;
    }
    /deep/ .img-container {
        margin: 0 0.2em;
        min-width: 8em;
    }
    /deep/ .movie-item {
        margin-right: 1.5em !important;
    }
    .history-slider /deep/.movie-card-image {
        height: 15em;
    }
    .history-slider /deep/ .el-badge__content {
        display: none;
    }
    @media (max-width: 767px) {
        .scroll-item {
            background: transparent;
            padding: 0.3em;
            display: none;
        }
        .slider-bar {
            padding: 0;
        }
        .slider-heading {
            padding-left: 1em;
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
        /deep/ .img-container {
            width: @mobile-card-width !important;
            height: auto !important;
        }
    }
</style>
