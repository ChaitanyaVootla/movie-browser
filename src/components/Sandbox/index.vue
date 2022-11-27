<template>
    <div class="mt-5 pt-5">
        <div class="filter-selections">
            <div class="select-label"> Watch Provider </div>
            <el-select
                v-model="selectedWatchProviders"
                filterable
                multiple
                clearable
                collapse-tags
                placeholder="Select"
                @change="getMovies"
            >
                <el-option
                    v-for="item in watchProviders"
                    :key="item.provider_id"
                    :label="item.provider_name"
                    :value="item.provider_id"
                    class="watchProviders"
                >
                    <div class="m-3">
                        <img v-lazy="getWatchImage(item.logo_path)" class="watchProviderImg" />
                        <span>{{ item.provider_name }}</span>
                    </div>
                </el-option>
            </el-select>
            <div class="select-label"> Language </div>
            <el-select v-model="selectedLanguage" filterable clearable placeholder="Select" @change="getMovies">
                <el-option
                    v-for="item in languages"
                    :key="item.iso_639_1"
                    :label="item.english_name"
                    :value="item.iso_639_1"
                >
                </el-option>
            </el-select>
            <div class="select-label"> Sort by </div>
            <el-select v-model="selectedSortOrder" filterable clearable placeholder="Select" @change="getMovies">
                <el-option v-for="item in sortOrders" :key="item.id" :label="item.name" :value="item.id"> </el-option>
            </el-select>
        </div>
        <mb-slider
            :items="moviesList"
            :configuration="configuration"
            :id="'continueWatching'"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo"
        ></mb-slider>
    </div>
</template>

<script lang="ts">
import axios from 'axios';
import { appConfig } from '@/API/Constants';
import watchProviders from '@/common/watchProviders.json';
import languages from '@/common/languages.json';
import Vue from 'vue';

export default Vue.extend({
    name: 'Sandbox',
    data() {
        return {
            moviesList: [],
            selectedWatchProviders: [8],
            selectedLanguage: 'en',
            watchProviders,
            languages,
            sortOrders: [
                {
                    name: 'Popularity',
                    id: 'popularity.desc',
                },
                {
                    name: 'Rating',
                    id: 'vote_average.desc',
                },
                {
                    name: 'Newest',
                    id: 'primary_release_date.desc',
                },
                {
                    name: 'Oldest',
                    id: 'primary_release_date.asc',
                },
                {
                    name: 'Revenue',
                    id: 'revenue.desc',
                },
            ],
            selectedSortOrder: 'primary_release_date.desc',
        };
    },
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    created() {
        this.getMovies();
    },
    methods: {
        getWatchImage(path: string) {
            return { src: `${this.configuration.images.secure_base_url}/original${path}` };
        },
        async getMovies() {
            const { data: res } = await axios.get(
                `${
                    appConfig.serverBaseTMDBUrl
                }discover/movie?&watch_region=IN&with_watch_providers=${this.selectedWatchProviders.join(
                    '|',
                )}&with_original_language=${this.selectedLanguage}&sort_by=${this.selectedSortOrder}`,
            );
            this.moviesList = res.results;
        },
    },
});
</script>

<style lang="less" scoped>
.filter-selections {
    display: flex;
    padding: 0 1rem;
}
.select-label {
    line-height: 2.5rem;
    margin-left: 2rem;
    margin-right: 0.5rem;
    color: #ccc;
    font-size: 0.9em;
}
.watchProviders {
    &.el-select-dropdown__item {
        height: 4rem;
        .watchProviderImg {
            height: 30px;
        }
        span {
            margin-left: 1rem;
            font-size: 1rem;
        }
    }
}
</style>
