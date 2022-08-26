<template>
    <div>
        <div class="watch-options-container">
            <div v-if="this.watchOptions.length || googleData.watchLink" class="ott-links-container mt-3">
                <a
                    v-for="watchOption in this.watchOptions"
                    :key="watchOption.name"
                    :href="watchOption.link"
                    target="_blank"
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
                <a href="" target="_blank">
                    <img src="/images/rating/tmdb.svg" /><br />
                    <span>{{ item.vote_average.toFixed(1) }}</span>
                </a>
            </div>
            <div class="rating-container" v-for="rating in googleData.ratings" :key="rating[1]">
                <a :href="rating.link" target="_blank">
                    <img :src="rating.imagePath" /><br />
                    <span>{{ rating.rating }}</span>
                </a>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { db } from '@/Common/firebase';
import { mapGoogleData } from '@/Common/utils';
import Vue from 'vue';
import { doc, setDoc } from 'firebase/firestore';

export default Vue.extend({
    name: 'GoogleData',
    props: {
        item: {
            type: Object,
            required: true,
        },
    },
    created() {
        this.getGoogleData();
    },
    data() {
        return {
            googleData: {
                allWatchOptions: [],
            } as any,
            isGoogleDataLoading: false,
            watchOptionsExpanded: false,
            watchOptions: [],
        };
    },
    methods: {
        toggleExpandWatchOptions() {
            this.watchOptionsExpanded = !this.watchOptionsExpanded;
            if (this.watchOptionsExpanded) {
                this.watchOptions = this.googleData.allWatchOptions;
            } else {
                this.watchOptions = this.googleData.allWatchOptions.slice(0, 3);
            }
        },
        async getGoogleData() {
            this.isGoogleDataLoading = true;
            const googleData = await api.getOTTLink(encodeURIComponent(this.googleLink.replace('&', '')));
            this.googleData = mapGoogleData(googleData);
            this.watchOptions = this.googleData.allWatchOptions.slice(0, 3);
            this.isGoogleDataLoading = false;
        },
        getYear(movieDate: any) {
            return new Date(movieDate).getFullYear();
        },
        watchNowClicked(watchOption) {
            if (!this.user.displayName) {
                return;
            }
            setDoc(doc(db, `users/${this.user.uid}/continueWatching/${this.item.id}`),  {
                watchOption,
                ...this.item,
                updatedAt: Date.now(),
            });
            // const userDbRef = db.collection('users').doc(this.user.uid);
            // userDbRef
            //     .collection('continueWatching')
            //     .doc(`${this.item.id}`)
            //     .set({
            //         watchOption,
            //         ...this.item,
            //         updatedAt: Date.now(),
            //     });
        },
    },
    computed: {
        canShowMoreWatchOptions() {
            return this.googleData.allWatchOptions.length > 3;
        },
        googleLink() {
            return `https://google.com/search?q=${this.item.name || this.item.title} ${
                this.item.first_air_date ? 'tv series' : this.getYear(this.item.release_date) + ' movie'
            }`;
        },
        user() {
            return this.$store.getters.user;
        },
    },
});
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
        }
    }
}
.frosted {
    box-shadow: inset 0 0 7px rgb(104, 104, 104);
    display: inline-flex;
    padding: 1rem;
    border-radius: 3rem;
}
.rating-container {
    text-align: center;
    img {
        width: 2rem;
    }
    span {
        font-size: 0.9em;
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
        }
    }
    .watch-price {
        font-size: 0.65rem;
        color: rgb(207, 207, 207);
        text-shadow: none;
    }
}
</style>
