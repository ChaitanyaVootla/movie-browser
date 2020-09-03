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
            <!-- <movie-slider :movies="historyMovies" :configuration="configuration" :heading="'Recently Visited Movies'" :id="'historyMovies'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="historyMovies.length"
                :history="true"></movie-slider> -->
            <!-- <movie-slider :movies="seriesHistory" :configuration="configuration" :heading="'Recently Visited Series'" :id="'historySeries'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo" v-if="seriesHistory.length"
                :history="true" class="pt-3"></movie-slider> -->
            <movie-slider :movies="recommendedMoviesByPopularity" :configuration="configuration"
                :heading="'Suggestions - Trending'" :id="'suggestedMoviesPopular'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
                v-if="recommendedMoviesByPopularity.length"
                :history="true"></movie-slider>
            <movie-slider :movies="recommendedMoviesAllTime" :configuration="configuration"
                :heading="'Suggestions - All Time'" :id="'suggestedMoviesAllTime'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
                v-if="recommendedMoviesAllTime.length"
                :history="true"></movie-slider>
        </el-col>
    </el-row>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import { getRatingColor } from '../../Common/utils';
    import { signIn, firebase, signOut, db } from '../../Common/firebase';
    import { sortBy, groupBy, keyBy, uniqBy } from 'lodash';

    export default {
        name: 'trendingCarousel',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
            'seriesGenres',
            'trendingMovies',
        ],
        data() {
            return {
                getRatingColor,
                trendingListWeek: [],
                currentCarouselItem: {} as any,
                historyLength: 4,
                popularMovies: [],
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
            favoriteGenres() {
                const history = this.$store.getters.history.movies;
                const genresArrayList = history.map(movie => movie.genres);
                return this.getSortedObjects(genresArrayList);
            },
            recommendedMoviesByPopularity() {
                return this.rateMovies(this.trendingMovies, {});
            },
            recommendedMoviesAllTime() {
                return this.rateMovies(this.popularMovies, {ignorePopularity: true});
            }
        },
        methods: {
            getPopularmovies() {

            },
            getSortedObjects(arrayList) {
                let keywords = [];
                arrayList.forEach(
                    array => {
                        keywords = keywords.concat(array);
                    }
                );
                const grouped = groupBy(keywords, 'name');
                const keywordsByName = keyBy(keywords, 'name');
                const names = Object.keys(grouped);
                const sortedNames = sortBy(names, [
                    (name) => grouped[name].length
                ]).reverse();
                return sortedNames.map(name => ({
                    name,
                    id: keywordsByName[name].id,
                    priority: grouped[name].length
                }));
            },
            rateMovies(moviePool, {
                ignorePopularity
            }) {
                moviePool.forEach(
                    movie => {
                        let genreWeight = 0;
                        let genreIds = [];
                        if (movie.genre_ids) {
                            genreIds = movie.genre_ids;
                        }
                        if (movie.genres) {
                            genreIds = movie.genres.map(({id}) => id);
                        }
                        genreIds.forEach(
                            genreId => {
                                const genre = this.favoriteGenres.find(genre => genre.id === genreId);
                                if (genre) {
                                    genreWeight += genre.priority*10;
                                }
                            }
                        );
                        const ratingWeight = movie.vote_average*100;
                        movie.favoriteScore = (ignorePopularity?0:movie.popularity) + genreWeight + ratingWeight;
                        movie.scoreBreakdown = `${(ignorePopularity?0:movie.popularity)} - ${genreWeight} - ${ratingWeight}`;
                    }
                );
                let sortedFavorites = sortBy(moviePool, ['favoriteScore']).reverse();
                sortedFavorites = sortedFavorites.filter(({vote_average}) => vote_average >= 6.5)
                console.log(sortedFavorites.map(movie => ({name: movie.title, favoriteScore: movie.favoriteScore,
                    scoreBreakdown: movie.scoreBreakdown})))
                return uniqBy(sortedFavorites, 'id');
            },
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
            async getTrendingListWeek() {
                const res = await api.getTrendingListWeek();
                this.trendingListWeek = res.results.slice(0, 10);
                this.currentCarouselItem = this.trendingListWeek[0];
            },
            async loadData() {
                await this.getTrendingListWeek();
                const apiData = await api.getDiscoverMoviesFull('&vote_average.gte=7');
                this.popularMovies = apiData.results;
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
        border-radius: 0.2em;
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
    .carousel-card-container {
        position: relative;
        cursor: pointer;
        background-color:rgb(24, 24, 24);
        padding: 0 1em;
    }
</style>
