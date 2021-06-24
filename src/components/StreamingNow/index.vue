<template>
    <div>
        <div class="network-browse-container">
            <el-row>
                <el-col :span="4" :offset="20" class="mt-1">
                    <el-button type="primary" icon="el-icon-plus" class="mr-2" @click="addUserNetwork"></el-button>
                    <el-select v-model="selectedNetwork" filterable placeholder="Select">
                        <el-option
                            v-for="item in allNetworks"
                            :key="item.id"
                            :label="item.name"
                            :value="item.id">
                        </el-option>
                    </el-select>
                </el-col>
            </el-row>
        </div>
        <!-- On Air -->
        <mb-slider :items="currentStreaming" :configuration="configuration" :id="'currentStreaming'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="currentStreaming.length>0">
            <div class="slot-text">
                <font-awesome-icon :icon="['fas', 'play-circle']" class="mr-2"/> Popular - Currently On Air
            </div>
        </mb-slider>
        <!-- User networks -->
        <div  v-if="userNetworksData.length>0">
            <div v-for="network in userNetworksData" :key="network.id">
                <mb-slider :items="network.seriesList" :configuration="configuration" :id="network.id"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo">
                    <el-row>
                        <el-col :span="12">
                            <img :src="`${configuration.images.secure_base_url}w500${network.image}`" class="slot-logo" v-if="network.image"/>
                            <div v-if="!network.image" class="slot-logo">{{network.name}}</div>
                        </el-col>
                        <el-col :span="12">
                            <el-button type="primary" icon="el-icon-minus" class="mr-2 float-right mt-3" @click="removeNetwork(network)"
                                size="mini">

                            </el-button>
                        </el-col>
                    </el-row>
                </mb-slider>
            </div>
        </div>
        <!-- Default networks -->
        <mb-slider :items="topNetflixSeries" :configuration="configuration" :id="'netflixShows'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="topNetflixSeries.length>0">
            <img :src="`${configuration.images.secure_base_url}w500${NETWORKS.NETFLIX.image}`" class="slot-logo"/>
        </mb-slider>
        <mb-slider :items="topHBOSeries" :configuration="configuration" :heading="'Top Shows on HBO'" :id="'amazonShows'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="topHBOSeries.length>0">
            <img :src="`${configuration.images.secure_base_url}w500${NETWORKS.AMAZON.image}`" class="slot-logo"/>
        </mb-slider>
        <mb-slider :items="topAmazonSeries" :configuration="configuration" :heading="'Top Shows on Amazon'" :id="'amazonShows'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo" v-if="topAmazonSeries.length>0">
            <img :src="`${configuration.images.secure_base_url}w500${NETWORKS.HBO.image}`" class="slot-logo invert-logo"/>
        </mb-slider>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import _ from 'lodash';
    import { NETWORKS } from '../../Common/networks';
    import allNetworks from '../../Common/allNetworks';
    import * as localStorageAdapter from '../../Common/localStorageAdapter';
    import { LOCAL_STORAGE_NAMES, COMPANIES } from '../../Common/constants';

    export default {
        name: 'StreamingNow',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
            'seriesGenres',
        ],
        data: function () {
            return {
                currentStreaming: [],
                topNetflixSeries: [],
                topAmazonSeries: [],
                topHBOSeries: [],
                NETWORKS,
                COMPANIES,
                allNetworks,
                userNetworks: [] as any[],
                selectedNetwork: null,
                userNetworksData: [] as any[],
            }
        },
        created() {
            this.getUserNetworks();
            this.getCurrentStreamingSeries();
            // this.getTopNetflixSeries();
            // this.getTopAmazonSeries();
            // this.getTopHBOSeries();
        },
        methods: {
            async addUserNetwork() {
                const userSelectedNetwork = _.find(allNetworks, {id: parseInt(`${this.selectedNetwork}`)}) as  any;
                if (!userSelectedNetwork){
                    return;
                }

                const networkImages = await api.getNetworkImages(userSelectedNetwork.id);
                const image = networkImages.logos && networkImages.logos[0] && networkImages.logos[0].file_path;
                localStorageAdapter.pushItemByName(LOCAL_STORAGE_NAMES.USER_NETWORKS,
                    {
                        ...userSelectedNetwork,
                        image,
                    }
                );
                this.getUserNetworks();
            },
            removeNetwork(network: any) {
                localStorageAdapter.removeItemByName(LOCAL_STORAGE_NAMES.USER_NETWORKS, network);
                this.getUserNetworks();
            },
            async getCurrentStreamingSeries() {
                const res = await api.getCurrentStreamingSeries();
                this.currentStreaming = res.results;
            },
            async getTopNetflixSeries() {
                const res = await api.getTopSeriesByNetwork(NETWORKS.NETFLIX.id);
                this.topNetflixSeries = res.results;
            },
            async getTopAmazonSeries() {
                const res = await api.getTopSeriesByNetwork(NETWORKS.AMAZON.id);
                this.topAmazonSeries = res.results;
            },
            async getTopHBOSeries() {
                const res = await api.getTopSeriesByNetwork(NETWORKS.HBO.id);
                this.topHBOSeries = res.results;
            },
            async getUserNetworks() {
                this.userNetworks = localStorageAdapter.getItemByName(LOCAL_STORAGE_NAMES.USER_NETWORKS);
                this.userNetworksData = [] as any[];
                const promisesArray: any[] = [];
                this.userNetworks.forEach(
                    ({id}) => {
                        promisesArray.push(api.getTopSeriesByNetwork(id));
                    }
                );
                const results: any[] = await Promise.all(promisesArray);
                results.forEach(
                    (result, index) => {
                        this.userNetworksData.push({
                            id: this.userNetworks[index].id,
                            name: this.userNetworks[index].name,
                            image: this.userNetworks[index].image,
                            seriesList: result.results,
                        })
                    }
                );
            }
        }
    }
</script>

<style lang="less" scoped>
    @import '../../Assets/Styles/main.less';

    .network-browse-container {
        height: 3em;
        background-color: rgb(24, 24, 24);
    }
    .network-logo-image {
        display: block;
        margin: 0.5em 0 0 3em;
        padding: 0.3em;
        width: auto;
        height: 2em;
        background-color: rgba(121, 121, 121, 0.514);
        border-radius: 3px;
    }
    .float-right {
        float: right;
    }
    /deep/ .slot-logo {
        display: block;
        margin: 1em 0 1em 3em;
        width: auto;
        height: 1.5em;
    }
    /deep/ .slot-text {
        margin: 1em 0 1em 2em;
        font-size: 1.2em;
    }
    .invert-logo {
        filter: invert(80%)
    }
</style>