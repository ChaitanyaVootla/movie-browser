<template>
    <el-row class="week-trends-container pt-4">
        <el-col :span="historyAbsent()?24:13">
            <el-carousel height="500px" :interval="700000" :type="historyAbsent()?'card':''" @change="carouselChanged">
                <el-carousel-item v-for="movie in trendingMoviesWeek" :key="movie.id">
                    <div style="position:relative; cursor:pointer; background-color:rgb(24, 24, 24); padding: 0 1em;" @click="carouselCardClicked(movie)">
                        <div class="background-images-container justify-center">
                            <img v-lazy="{
                                    src: `${configuration.images.secure_base_url}h632${movie.backdrop_path}`,
                                    error: require('../../Assets/Images/error.svg'),
                                    loading: require('../../Assets/Images/loader-bars.svg'),
                                }" height="550px"
                            />
                        </div>
                        <div class="info-container" v-if="movie.title && currentMovie.id === movie.id">
                            <h3 div="info-heading">
                                {{movie.title}}
                            </h3>
                            <!-- Genres -->
                            <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                                <span v-for="(genreId, index) in movie.genre_ids" :key="genreId">
                                    {{getGenreName(genreId)}}{{index===movie.genre_ids.length-1?'':','}}
                                </span>
                            </h6>

                            <!-- Rating -->
                            <div class="mt-5 pt-5">
                                <span class="rating-info" :style="`border-color: ${getRatingColor(movie.vote_average)}; color: ${getRatingColor(movie.vote_average)}`">
                                    {{movie.vote_average}}
                                </span>
                            </div>

                            <!-- Movie overview -->
                            <div class="movie-overview p-3 mt-10">
                                <span>{{movie.overview.slice(0, 200)}}</span>
                            </div>
                        </div>
                    </div>
                </el-carousel-item>
            </el-carousel>
        </el-col>
        <el-col :span="11" class="pr-5 pl-5" v-if="!historyAbsent()">
            <movie-slider :movies="getMoviesHistory()" :configuration="configuration" :heading="'Recently Visited Movies'" :id="'historyMovies'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="getMoviesHistory().length"
                :history="true"></movie-slider>
            <movie-slider :movies="getSeriesHistory()" :configuration="configuration" :heading="'Recently Visited Series'" :id="'historySeries'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo" v-if="getSeriesHistory().length"
                :history="true"></movie-slider>
        </el-col>
    </el-row>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import _ from 'lodash';
    import { getRatingColor } from '../../Common/utils';

    export default {
        name: 'trending',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
        ],
        data() {
          return {
              getRatingColor,
              trendingMoviesWeek: [],
              currentMovie: {} as any,
          }
        },
        mounted() {
            this.loadData();
        },
        methods: {
            carouselCardClicked(movie: any) {
                if (movie.id === this.currentMovie.id) {
                    this.showFullMovieInfo(movie);
                }
            },
            carouselChanged(currentIndex: number) {
                this.currentMovie = this.trendingMoviesWeek[currentIndex];
            },
            historyAbsent() {
                if (!localStorage.moviesHistory && !localStorage.seriesHistory) {
                    return true
                }
                return false;
            },
            getMoviesHistory() {
                if (localStorage.moviesHistory) {
                    return JSON.parse(localStorage.moviesHistory).reverse();
                } else {
                    return [];
                }
            },
            getSeriesHistory() {
                if (localStorage.seriesHistory) {
                    return JSON.parse(localStorage.seriesHistory).reverse();
                } else {
                    return [];
                }
            },
            getGenreName(id: number) {
                return _.find(this.movieGenres, {id: id}).name;
            },
            async getTrendingMoviesWeek() {
                const res = await api.getTrendingMoviesWeek();
                this.trendingMoviesWeek = res.results.slice(0, 5);
                this.currentMovie = this.trendingMoviesWeek[0];
            },
            async loadData() {
                await this.getTrendingMoviesWeek();
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
        height: 490px;
    }
    .info-container {
        position: absolute;
        top: 2em;
        margin-left: 6em !important;
        overflow: hidden;
        color: #fff;
        width: 80% !important;
    }
    .secondary-info {
        color: rgb(228, 228, 228);
    }
    .rating-info {
        font-size: 1.7em;
        padding: 0.2em;
        border: 0.2em solid #ccc;
        border-radius: 100%;
        font-weight: 500;
        background: rgba(0, 0, 0, 0.2);
        width: 1.9em;
        height: 1.9em;
        text-align: center;
        vertical-align: middle;
        display: inline-table;
        padding: 0.2em;
    }
    .movie-overview {
        background: @translucent-bg;
        width: 80%;
        margin-top: 5em;
    }
    .discover-movies-container {
        padding: 1em 2.5em;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
    }
    /deep/ .el-carousel__button {
        background-color: @link-color-red;
    }
</style>
