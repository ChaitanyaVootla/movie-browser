<template>
    <el-row class="week-trends-container pt-3">
        <el-col :span="historyAbsent?24:15">
            <el-carousel height="550px" :interval="7000" :type="historyAbsent?'card':''" @change="carouselChanged" arrow="always" class="ml-5"
                :key="historyAbsent">
                <el-carousel-item v-for="item in trendingListWeek" :key="item.id">
                    <div class="carousel-card-container" @click="carouselCardClicked(item)">
                        <div class="background-images-container justify-center">
                            <img v-lazy="{
                                    src: `${configuration.images.secure_base_url}h632${item.backdrop_path}`,
                                    error: require('../../Assets/Images/error.svg'),
                                    loading: require('../../Assets/Images/loader-bars.svg'),
                                }" height="640px"
                            />
                        </div>
                        <div class="info-container" v-if="currentCarouselItem.id === item.id">
                            <h3 div="info-heading">
                                {{item.title || item.name}}
                            </h3>
                            <!-- Genres -->
                            <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                                <span v-for="(genreId, index) in item.genre_ids" :key="genreId">
                                    {{getGenreName(genreId)}}{{index===item.genre_ids.length-1?'':','}}
                                </span>
                                 - {{item.media_type}}
                            </h6>

                            <!-- Rating -->
                            <div class="mt-5 pt-5">
                                <span class="rating-info" :style="`border-color: ${getRatingColor(item.vote_average)}; color: ${getRatingColor(item.vote_average)}`">
                                    {{item.vote_average}}
                                </span>
                            </div>

                            <!-- Item overview -->
                            <div class="movie-overview p-3 mt-10">
                                <span>{{item.overview.slice(0, 200)}}</span>
                            </div>
                        </div>
                    </div>
                </el-carousel-item>
            </el-carousel>
        </el-col>
        <el-col :span="9" class="pr-2 pl-1" v-if="!historyAbsent">
            <movie-slider :movies="historyMovies" :configuration="configuration" :heading="'Recently Visited Movies'" :id="'historyMovies'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="historyMovies.length"
                :history="true"></movie-slider>
            <movie-slider :movies="seriesHistory" :configuration="configuration" :heading="'Recently Visited Series'" :id="'historySeries'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo" v-if="seriesHistory.length"
                :history="true" class="pt-3"></movie-slider>
        </el-col>
    </el-row>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import { getRatingColor } from '../../Common/utils';
    import { signIn, firebase, signOut, db } from '../../Common/firebase';
    import { sortBy } from 'lodash';

    export default {
        name: 'trending',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
            'seriesGenres',
        ],
        data() {
          return {
              getRatingColor,
              trendingListWeek: [],
              currentCarouselItem: {} as any,
              historyLength: 4,
          }
        },
        mounted() {
            this.loadData();
        },
        computed: {
            historyAbsent() {
                return this.historyMovies.length === 0 && this.seriesHistory.length === 0;
            },
            historyMovies() {
                return this.$store.getters.history.movies.slice(0, 4);
            },
            seriesHistory() {
                return this.$store.getters.history.series.slice(0, 4);
            },
        },
        methods: {
            carouselCardClicked(movie: any) {
                if (movie.id === this.currentCarouselItem.id) {
                    this.showFullMovieInfo(movie);
                }
            },
            carouselChanged(currentIndex: number) {
                this.currentCarouselItem = this.trendingListWeek[currentIndex];
            },
            getGenreName(id: any) {
                let genre = this.movieGenres.find(genre => genre.id === id);
                if (!genre) {
                    genre = this.seriesGenres.find(genre => genre.id === id);
                }
                if (genre)
                    return genre.name;
            },
            async gettrendingListWeek() {
                const res = await api.getTrendingListWeek();
                this.trendingListWeek = res.results.slice(0, 10);
                this.currentCarouselItem = this.trendingListWeek[0];
            },
            async loadData() {
                await this.gettrendingListWeek();
            }
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';

    .justify-center {
        display:flex;
        justify-content:center;
    }
    .week-trends-container {
        background-color: rgb(24, 24, 24);
    }
    .background-images-container {
        filter: opacity(0.4);
        height: 30em;
        overflow: hidden;
        height: 540px;
        border-radius: 0.5em;
    }
    .info-container {
        position: absolute;
        top: 2em;
        margin-left: 6em !important;
        overflow: hidden;
        color: #fff;
        width: 80% !important;
        height: 30em;
    }
    .secondary-info {
        color: rgb(228, 228, 228);
    }
    .movie-overview {
        background: @translucent-bg;
        width: 80%;
        margin-top: 5em;
        position: absolute;
        bottom: 0;
    }
    .discover-movies-container {
        padding: 1em 2.5em;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
    }
    .carousel-card-container {
        position: relative;
        cursor: pointer;
        background-color:rgb(24, 24, 24);
        padding: 0 1em;
    }
</style>
