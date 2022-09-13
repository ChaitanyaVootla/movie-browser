<template>
    <div>
        <div class="watch-options-container">
            <div v-if="this.watchOptions.length || googleData.watchLink" class="ott-links-container mt-3">
                <a
                    v-for="watchOption in this.watchOptions"
                    :key="watchOption.name"
                    :href="watchOption.link"
                    target="_blank"
                    rel="noreferrer noopener"
                    @click="watchNowClicked(watchOption)"
                >
                    <div class="ott-container mr-3">
                        <div class="icon-container">
                            <img :src="watchOption.imagePath" class="ott-icon" />
                        </div>
                        <div class="watch-price pt-1">{{ watchOption.price }}</div>
                    </div>
                </a>
                <div v-if="canShowMoreWatchOptions" class="more-options" @click="toggleExpandWatchOptions">
                    <div v-if="watchOptionsExpanded" class="ott-container mr-3 more-options">
                        <font-awesome-icon :icon="['fas', 'angle-left']" />
                    </div>
                    <div v-if="!watchOptionsExpanded" class="ott-container mr-3 more-options">
                        <font-awesome-icon :icon="['fas', 'angle-right']" />
                    </div>
                </div>
            </div>
        </div>
        <br/>
        <div class="frosted mt-3 mb-3">
            <div class="rating-container tmdb-rating" v-if="item.vote_average">
                <a href="" target="_blank"
                    rel="noreferrer noopener">
                    <img src="/images/rating/tmdb.svg" /><br />
                    <span>{{ item.vote_average.toFixed(1) }}</span>
                </a>
            </div>
            <div class="rating-container" v-for="rating in googleData.ratings" :key="rating[1]">
                <a :href="rating.link" target="_blank"
                    rel="noreferrer noopener">
                    <img :src="rating.imagePath" /><br />
                    <span>{{ rating.rating }}</span>
                </a>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { mapGoogleData } from '@/Common/utils';
import { mapActions } from 'vuex';

export default {
    name: 'GoogleData',
    props: {
        item: {
            type: Object,
            required: true,
        },
        rawGoogleData: {
            type: Object,
            default: {
                allWatchOptions: [],
            }
        }
    },
    data() {
        return {
            isGoogleDataLoading: false,
            watchOptionsExpanded: false,
            watchOptions: [],
        };
    },
    methods: {
        ...mapActions({
            addContinueWatching: 'addContinueWatching',
        }),
        toggleExpandWatchOptions() {
            this.watchOptionsExpanded = !this.watchOptionsExpanded;
            if (this.watchOptionsExpanded) {
                this.watchOptions = this.googleData.allWatchOptions;
            } else {
                this.watchOptions = this.googleData.allWatchOptions.slice(0, 3);
            }
        },
        watchNowClicked(watchOption) {
            this.addContinueWatching({
                watchLink: watchOption.link,
                itemId: this.item.id,
                isMovie: this.item.release_date?true:false,
                item: {
                    ...this.item,
                    watchOption,
                },
            })
        },
    },
    computed: {
        canShowMoreWatchOptions() {
            return this.googleData.allWatchOptions.length > 3;
        },
        googleData() {
            const googleData = mapGoogleData(this.rawGoogleData);
            this.watchOptions = googleData.allWatchOptions.slice(0, 3);
            return googleData;
        },
        user() {
            return this.$store.getters.user;
        },
    },
};
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';
.watch-options-container {
    position: relative;
    padding-left: 1rem;
    display: inline-flex;
    background: rgba(28, 28, 28, 0.43);
    box-shadow: inset 0 0 7px rgb(104, 104, 104);
    backdrop-filter: blur(10px);
    flex-direction: column;
    border-radius: 3rem;
    @media (max-width: @mobile-width) {
        padding-left: 0.7rem;
    }
    .watch-options-heading {
        position: absolute;
        top: -1rem;
        border: 2px @link-color-red solid;
        color: @link-color-red;
        padding: 0.3rem 1rem;
        border-radius: 1rem;
        background: rgb(15, 15, 15);
    }
    .more-options {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-size: 10px;
        color: whitesmoke;
        padding-left: 5px;
        cursor: pointer;
        width: 2rem;
        svg {
            font-size: 1.5rem;
            @media (max-width: @mobile-width) {
                font-size: 1.2rem;
            }
        }
    }
}
.frosted {
    box-shadow: inset 0 0 7px rgb(104, 104, 104);
    display: inline-flex;
    padding: 0.7rem;
    border-radius: 3rem;
    @media (max-width: @mobile-width) {
        padding: 0.7rem;
    }
}
.rating-container {
    text-align: center;
    img {
        width: 1.8rem;
        @media (max-width: @mobile-width) {
            width: 1.7rem;
        }
    }
    span {
        font-size: 0.8em;
        font-weight: 600;
        color: #ddd;
        @media (max-width: @mobile-width) {
            font-size: 0.8em;
        }
    }
    img {
        height: 2rem;
    }
}
.ott-links-container {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
}
.ott-container {
    width: 4.5em;
    margin-bottom: 1rem;
    text-align: center;
    // background: rgba(39, 39, 39, 0.436);
    border-radius: @default-radius;
    // padding: 0.4rem 0.3rem;
    float: left;
    // box-shadow: inset 0 0 20px rgb(56, 56, 56);
    // backdrop-filter: blur(3px);
    .icon-container {
        height: 2.5rem;
        .ott-icon {
            width: 2.5rem;
            &[src='/images/ott/zee.png'] {
                height: 2rem;
                width: auto;
            }
            @media (max-width: @mobile-width) {
                width: 2.3rem;
            }
        }
    }
    .watch-price {
        font-size: 0.65rem;
        color: rgb(207, 207, 207);
        text-shadow: none;
        @media (max-width: @mobile-width) {
            font-size: 0.5rem;
        }
    }
}
</style>
