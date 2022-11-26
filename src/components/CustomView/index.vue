<template>
    <div>
        <mb-slider
            :items="moviesList"
            :configuration="configuration"
            :id="'continueWatching'"
        >
        <div class="custom-heading">
            <h4>{{viewName}}</h4>
            <font-awesome-icon :icon="['fas', 'pen']" class="ml-3 mt-2 edit-icon" @click="showEditModal = true"/>
        </div>
        </mb-slider>
        <el-dialog title="Edit custom view" :visible.sync="showEditModal" custom-class="view-modal">
            <div class="filter-selections">
                <div>
                    <span class="select-label">
                        Name
                    </span>
                    <el-input placeholder="Name" v-model="viewName" @change="updateStorage" class="name-input"/>
                </div>
                <div>
                    <span class="select-label">
                        Watch Provider
                    </span>
                    <el-select class="modal-select" v-model="selectedWatchProviders" filterable multiple clearable collapse-tags
                        placeholder="Select OTT providers" @change="getMovies">
                        <el-option
                            :key="-1"
                            label="Any Watch Provider"
                            :value="allWatchProviders()"
                            class="watchProviders">
                        </el-option>
                        <el-option
                            v-for="item in watchProviders"
                            :key="item.provider_id"
                            :label="item.provider_name"
                            :value="item.provider_id"
                            class="watchProviders">
                            <div class="m-3">
                                <img v-lazy="getWatchImage(item.logo_path)" class="watchProviderImg"/>
                                <span>{{item.provider_name}}</span>
                            </div>
                        </el-option>
                    </el-select>
                </div>
                <div>
                    <span class="select-label">
                        Language
                    </span>
                    <el-select class="modal-select" v-model="selectedLanguage" filterable clearable placeholder="Language" @change="getMovies">
                        <el-option
                            v-for="item in languages"
                            :key="item.iso_639_1"
                            :label="item.english_name"
                            :value="item.iso_639_1">
                        </el-option>
                    </el-select>
                </div>
                <div>
                    <span class="select-label">
                        Sort by
                    </span>
                    <el-select class="modal-select" v-model="selectedSortOrder" filterable clearable placeholder="Sort by" @change="getMovies">
                        <el-option
                            v-for="item in sortOrders"
                            :key="item.id"
                            :label="item.name"
                            :value="item.id">
                        </el-option>
                    </el-select>
                </div>
            </div>
            <div slot="footer">
                <el-button @click="showEditModal = false">Done</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script lang="ts">
import axios from 'axios';
import { appConfig } from '@/API/Constants';
import * as watchProvidersArray from '@/common/watchProviders.json';
import languages from '@/common/languages.json';
import { flatten } from 'lodash';
import Vue from 'vue';

export default Vue.extend({
    name: 'Sandbox',
    data() {
        return {
            moviesList: [],
            selectedWatchProviders: [],
            selectedLanguage: "",
            viewName: 'Available for streaming',
            showEditModal: false,
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
            selectedSortOrder: 'popularity.desc',
        }
    },
    props: {
        configuration: Object,
    },
    created() {
        const customViews = JSON.parse(localStorage.getItem('customViews')) || [];
        const customView = customViews[0];
        if (customView) {
            this.selectedWatchProviders = customView.watchProviders;
            this.selectedLanguage = customView.originalLanguage;
            this.selectedSortOrder = customView.sortOrder;
            this.viewName = customView.name;
        } else {
            this.selectedWatchProviders = this.allWatchProviders();
        }
        this.getMovies();
    },
    computed: {
        watchProviders() {
            return watchProvidersArray.map(item => {
                return {
                    provider_id: item.provider_id,
                    provider_name: item.provider_name.slice(0, 15),
                    logo_path: item.logo_path,
                }
            });
        },
    },
    methods: {
        allWatchProviders() {
            return watchProvidersArray.map(({provider_id}) => provider_id);
        },
        getWatchImage(path: string) {
            return { src: `${this.configuration.images.secure_base_url}/original${path}` };
        },
        async getMovies() {
            const {data: res} = await axios.get(`${appConfig.serverBaseTMDBUrl
                }discover/movie?&watch_region=IN&with_watch_providers=${flatten(this.selectedWatchProviders).join('|')
                }&with_original_language=${this.selectedLanguage}&sort_by=${this.selectedSortOrder}`);
            this.updateStorage();
            this.moviesList = res.results;
        },
        updateStorage() {
            localStorage.setItem('customViews', JSON.stringify([{
                watchProviders: this.selectedWatchProviders,
                originalLanguage: this.selectedLanguage,
                sortOrder: this.selectedSortOrder,
                name: this.viewName,
            }]));
        }
    },
});
</script>

<style lang="less" scoped>
.filter-selections {
    display: column;
    padding: 0 1rem;
    flex-wrap: wrap;
    >div {
        width: 23rem;
        margin-bottom: 2rem;
        display: flex;
        justify-content: space-between;
    }
    .name-input {
        width: 12.7rem;
    }
}
.select-label {
    line-height: 2.5rem;
    margin-left: 2rem;
    margin-right: .5rem;
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
.custom-heading {
    margin-left: 3rem;
    display: flex;
    .edit-icon {
        cursor: pointer;
        color: #ccc;
    }
}
@media (max-width: 767px) {
    .select-label {
        margin: 0;
    }
    /deep/ .view-modal {
        width: 80%;
        .el-dialog__body {
            padding: 0;
            .modal-select {
                width: 15rem !important;
            }
            .name-input {
                width: 15rem !important;
            }
            .el-select-dropdown__list {
                max-width: 15rem !important;
            }
        }
    }
    .custom-heading {
        margin-left: 5px;
        h4 {
            font-size: 1.2em;
        }
        .edit-icon {
            margin-top: 3px !important;
        }
    }
    .filter-selections {
        >div {
            display: flex;
            flex-direction: column;
        }
    }
}
</style>
