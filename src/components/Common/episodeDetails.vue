<template>
    <div class="main-container">
        <div class="heading-container">
            <div class="heading">
                <div>
                    <span class="episode-name">Last aired episode, {{airDate}}</span>
                </div>
                <div>
                    <span class="sub-text">{{details.name}}</span>
                </div>
            </div>
            <div>
                <div class="tmdb-rating" v-if="details.vote_average">
                    <img src="/images/rating/tmdb.svg" />
                    <div class="rating-details">
                        <div>{{ details.vote_average.toFixed(1) }} <font-awesome-icon :icon="['fas', 'star']" /></div>
                        <div class="vote_count">{{ details.vote_count }} votes</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="main-info">
            <div class="carousel-container">
                <el-carousel
                    height="25rem"
                    :interval="7000"
                    arrow="always"
                >
                    <el-carousel-item v-for="image in stills" :key="image.file_path">
                            <img
                                v-lazy="{
                                    src: `${configuration.images.secure_base_url}w780${image.file_path}`,
                                }"
                                :alt="details.name"
                            />
                    </el-carousel-item>
                </el-carousel>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import moment from 'moment';
import Vue from 'vue';

export default Vue.extend({
    name: 'episodeDetails',
    props: {
        details: {
            type: Object,
            required: true,
        },
        configuration: {
            type: Object,
            required: true,
        },
    },
    data() {
        return {

        }
    },
    computed: {
        airDate() {
            return moment(this.details.air_date).fromNow();
        },
        stills() {
            return this.details.images.stills.slice(0, 7);
        },
    }
});
</script>

<style scoped lang="less">
@image-width:40rem;
@image-height:25rem;
.main-container {
    margin-left: 3rem;
    .heading-container {
        display: flex;
        justify-content: space-between;
        width: @image-width;
        align-items: flex-end;
        .heading {
            font-weight: 500;
            padding-bottom: 1rem;
            .episode-name {
                font-size: 1.5rem;
            }
            .sub-text {
                font-size: 1rem;
                color: #bdbdbd;
            }
        }
        .tmdb-rating {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1rem;
            .rating-details {
                display: flex;
                flex-direction: column;
                padding: 5px;
                margin-left: 0.5rem;
                font-weight: 500;
                svg {
                    font-size: 12px;
                    color: gold;
                }
                .vote_count {
                    font-size: 0.8rem;
                    color: #bdbdbd;
                }
            }
            img {
                width: 40px;
            }
        }
    }
    .main-info {
        display: flex;
        .carousel-container {
            width: @image-width;
            img {
                border-radius: 10px;
                object-fit: cover;
                width: @image-width;
                height: @image-height;
            }
        }
    }
}
</style>