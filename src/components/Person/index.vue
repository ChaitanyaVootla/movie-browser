<template>
    <div style="position: relative">
        <img v-lazy="mainImgObj" class="main-img" v-if="!detailsLoading" />
        <div class="background-images-container" v-loading="detailsLoading">
            <el-row class="background-images-row" v-if="carrerList[0]">
                <el-col :span="6" class="mobile-hide">
                    <img
                        v-if="carrerList[0].items[1]"
                        v-lazy="creditImageBasePath + carrerList[0].items[1].backdrop_path"
                        class="background-image"
                    />
                </el-col>
                <el-col :span="isMobile() ? 24 : 12">
                    <img
                        v-if="carrerList[0].items[0]"
                        v-lazy="creditImageBasePath + carrerList[0].items[0].backdrop_path"
                        class="background-image"
                    />
                </el-col>
                <el-col :span="6" class="mobile-hide">
                    <img
                        v-if="carrerList[0].items[2]"
                        v-lazy="creditImageBasePath + carrerList[0].items[2].backdrop_path"
                        class="background-image"
                    />
                </el-col>
            </el-row>
        </div>
        <div class="description-container frosted normal-bio p-4 ml-2" v-if="!detailsLoading">
            <span class="main-name">{{ details.name }}</span>
            <br class="desk-hide" />
            <span class="secondary-info ml-3 text-muted">{{ details.known_for_department }}</span>
            <span class="ml-3 info-tagline cursor-pointer" @click="dialogVisible = true">
                <font-awesome-icon :icon="['fas', 'images']" />
            </span>
            <br class="desk-hide" />
            <a
                :href="`https://google.com/search?q=${details.name}`"
                target="_blank"
                class="secondary-info ml-4 external-link-icon"
            >
                <font-awesome-icon :icon="['fab', 'google']" />
            </a>
            <a
                v-if="details.external_ids && details.external_ids.imdb_id"
                :href="`https://www.imdb.com/name/${details.external_ids && details.external_ids.imdb_id}`"
                target="_blank"
                class="ml-3 external-link-icon"
            >
                <font-awesome-icon :icon="['fab', 'imdb']" />
            </a>
            <a
                v-if="details.external_ids && details.external_ids.twitter_id"
                :href="`https://twitter.com/${details.external_ids && details.external_ids.twitter_id}`"
                target="_blank"
                class="ml-3 external-link-icon"
            >
                <font-awesome-icon :icon="['fab', 'twitter']" />
            </a>
            <a
                v-if="details.external_ids && details.external_ids.facebook_id"
                :href="`https://www.facebook.com/${details.external_ids && details.external_ids.facebook_id}`"
                target="_blank"
                class="ml-3 external-link-icon"
            >
                <font-awesome-icon :icon="['fab', 'facebook']" />
            </a>
            <el-row class="mt-3 mobile-hide" v-if="details.birthday">
                <el-col :span="1">
                    <span class="info-header"> Born </span>
                </el-col>
                <el-col :span="23">
                    <span class="info-content">
                        {{ getBirthDate(details.birthday) }} <span>{{ details.place_of_birth }}</span>
                    </span>
                </el-col>
            </el-row>
            <el-row class="mt-3 mobile-hide" v-if="details.biography">
                <el-col :span="1">
                    <span class="info-header"> Bio </span>
                </el-col>
                <el-col :span="23">
                    <div class="info-content" :class="showFullBio ? 'full-bio' : ''">
                        <span v-if="showFullBio">{{ details.biography }}</span>
                        <span v-if="!showFullBio">{{ details.biography.slice(0, 400) }}</span>
                        <span
                            v-if="details.biography.length > 400"
                            class="expand-ellipsis ml-3"
                            @click="showFullBio = !showFullBio"
                            >...</span
                        >
                    </div>
                </el-col>
            </el-row>
        </div>
        <div class="sliders-container" v-for="(careerObj, index) in carrerList" :key="index">
            <mb-slider
                v-if="careerObj.items.length"
                :items="careerObj.items"
                :configuration="configuration"
                :heading="careerObj.name"
                :id="careerObj.id"
                :showMovieInfoModal="showMovieInfo"
                :showFullMovieInfo="showFullMovieInfo"
                :externalLink="careerObj.externalLink"
            >
            </mb-slider>
        </div>
        <el-dialog :visible.sync="dialogVisible">
            <el-carousel type="card" height="500px">
                <el-carousel-item v-for="image in details.images.profiles" :key="image.file_path">
                    <div class="justify-center">
                        <img
                            v-lazy="{
                                src: `${configuration.images.secure_base_url}h632${image.file_path}`,
                            }"
                            height="500px"
                        />
                    </div>
                </el-carousel-item>
            </el-carousel>
        </el-dialog>
        <div class="mb-5"></div>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { filter, sortBy, groupBy, each, first } from 'lodash';
import { isMobile } from '@/common/utils';
import Vue from 'vue';

export default Vue.extend({
    name: 'person',
    props: ['person', 'configuration', 'showMovieInfo', 'showFullMovieInfo'],
    data() {
        return {
            details: {} as any,
            creditImageBasePath: this.configuration.images.secure_base_url + 'h632',
            mainImgObj: {
                src: '',
            },
            detailsLoading: true,
            showFullBio: false,
            dialogVisible: false,
            carrerList: [] as any[],
            isMobile,
        };
    },
    created() {
        this.getDetails();
    },
    methods: {
        async getDetails() {
            this.carrerList = [] as any[];
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            this.detailsLoading = true;
            this.details = await api.getPersonDetails(parseInt(this.$route.params.id));
            this.mainImgObj.src = this.creditImageBasePath + this.details.profile_path;

            const movieCredits = filter(this.details.combined_credits.cast, { media_type: 'movie' });
            this.carrerList.push(this.getMappedList(movieCredits, 'Movies', 'movies'));

            const seriesCredits = filter(this.details.combined_credits.cast, { media_type: 'tv' });
            this.carrerList.push(this.getMappedList(seriesCredits, 'Series', 'series'));

            const movieCrew = filter(this.details.combined_credits.crew, { media_type: 'movie' });
            this.carrerList.push(this.getMappedList(movieCrew, 'Movies (as crew)', 'moviesCrew'));

            const seriesCrew = filter(this.details.combined_credits.crew, { media_type: 'tv' });
            this.carrerList.push(this.getMappedList(seriesCrew, 'Series (as crew)', 'seriesCrew'));

            this.carrerList = sortBy(this.carrerList, 'totalPopularity').reverse();
            this.detailsLoading = false;
        },
        getBirthDate(birthday: Date) {
            const monthNames = [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
            ];
            const date = new Date(birthday);
            const ageDate = Date.now() - date.getTime();
            const age = Math.abs(new Date(ageDate).getFullYear() - 1970);
            return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()} (${age} Years), `;
        },
        getMappedList(list: Array<any>, name: string, id: string) {
            const mappedList = {
                totalPopularity: 0,
                items: [] as any[],
                name,
                id,
                showDiscoverLink: false,
                personName: '',
                personId: 0,
                externalLink: null,
            };
            if (name === 'Movies') {
                mappedList.externalLink = {
                    name: 'discover',
                    query: {
                        with_people: this.details.id,
                        people: this.details.name,
                    },
                };
            }
            const groupedItems = groupBy(list, 'id');
            const uniqueItems = [] as any[];
            each(groupedItems, (items, id) => {
                let jobs = '';
                let characters = '';
                each(items, (item) => {
                    if (item.job) {
                        jobs += `${item.job}, `;
                    }
                    if (item.character) {
                        characters += `${item.character}, `;
                    }
                });
                const groupedItem = first(items);
                if (jobs) {
                    groupedItem.job = jobs.slice(0, jobs.length - 2);
                }
                if (characters) {
                    groupedItem.character = characters.slice(0, characters.length - 2);
                }
                uniqueItems.push(groupedItem);
            });
            mappedList.items = sortBy(uniqueItems, (item) => {
                mappedList.totalPopularity += item.popularity;
                return -item.popularity;
            });
            return mappedList;
        },
    },
    watch: {
        person: function () {
            this.getDetails();
        },
        '$route.params.id': function () {
            this.getDetails();
        },
    },
});
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
.description-container {
    position: absolute;
    width: 75%;
    top: 15em;
    left: 18em;
    z-index: 10;
}
.background-images-container {
    filter: opacity(0.3);
    height: 27em;
    overflow: hidden;
}
.background-images-row {
    height: 27em;
}
.background-images-row .el-col {
    height: 27em;
}
.background-image {
    background-size: contain;
    height: 27em;
    object-fit: cover;
    object-position: 50% 0%;
    width: 100%;
    box-shadow: 0px 0px 200px 100px rgba(0, 0, 0, 1);
}
.main-img {
    position: absolute;
    margin-top: 11.3em;
    margin-left: 6em;
    height: 15em;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: 50% 50%;
    z-index: 50;
    box-shadow: 0px 0px 60px 20px rgba(0, 0, 0, 0.95);
    border-radius: 0.5em;
}
.main-img[lazy='error'] {
    background-size: 4em;
    padding: 1em;
    width: 8em;
}
.main-img[lazy='loading'] {
    background-size: 2em;
    width: 8em;
}
.info-header {
    font-weight: 500;
    font-size: 1.1em;
}
.info-content {
    font-size: 0.9em;
}
.movies-grid-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
}
.main-name {
    font-size: 1.3em;
    font-weight: 500;
    color: @text-color;
}
.full-bio {
    background: #000;
}
.external-link-icon {
    font-size: 1.1em;
    color: @link-color-red;
}
/deep/ .movie-item {
    margin-right: 3.5em !important;
}
@media (max-width: 767px) {
    .background-images-container {
        height: 15em;
    }
    .main-img {
        top: 1em;
        margin: 1em;
        width: 8em;
        height: auto;
        box-shadow: 0px 0px 10px 2px rgba(0, 0, 0, 0.95);
    }
    .sliders-container {
        margin: 0.6em !important;
    }
    .description-container {
        top: 2em;
        left: 10em;
        width: 50%;
    }
    .normal-bio {
        background: none;
    }
    .secondary-info {
        margin-left: 0 !important;
    }
}
</style>
