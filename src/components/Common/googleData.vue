<template>
    <div>
        <div style="display: flex" class="mt-3 mb-3">
            <div class="rating-container tmdb-rating" v-if="item.vote_average">
                <a href="" target="_blank">
                    <img src="/images/rating/tmdb.svg" /><br />
                    <span>{{ item.vote_average }}</span>
                </a>
            </div>
            <div class="rating-container" v-for="rating in googleData.ratings" :key="rating[1]">
                <a :href="rating.link" target="_blank">
                    <img :src="rating.imagePath" /><br />
                    <span>{{ rating.rating }}</span>
                </a>
            </div>
        </div>
        <!-- <div v-if="googleData.allWatchOptions.length || googleData.watchLink" class="ott-links-container mt-4">
            <a
                v-for="watchOption in googleData.allWatchOptions"
                :key="watchOption.name"
                :href="watchOption.link"
                target="_blank"
                @click="watchNowClicked(watchOption)"
            >
                <div class="ott-container mr-3">
                    <img :src="watchOption.imagePath" class="ott-icon" />
                    <div class="watch-price pt-1">{{ watchOption.price }}</div>
                </div>
            </a>
        </div> -->
        <div class="watch-options-container">
            <!-- <div class="watch-options-heading">
                <font-awesome-icon :icon="['fas', 'play']" class="mr-2" /> Watch options
            </div> -->
            <div v-if="googleData.allWatchOptions.length || googleData.watchLink" class="ott-links-container mt-3">
                <a
                    v-for="watchOption in googleData.allWatchOptions"
                    :key="watchOption.name"
                    :href="watchOption.link"
                    target="_blank"
                    @click="watchNowClicked(watchOption)"
                >
                    <div class="ott-container mr-3">
                        <img :src="watchOption.imagePath" class="ott-icon" />
                        <div class="watch-price pt-1">{{ watchOption.price }}</div>
                    </div>
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
            },
            isGoogleDataLoading: false,
        };
    },
    methods: {
        async getGoogleData() {
            this.isGoogleDataLoading = true;
            const googleData = await api.getOTTLink(encodeURIComponent(this.googleLink.replace('&', '')));
            this.googleData = mapGoogleData(googleData);
            this.isGoogleDataLoading = false;
        },
        getYear(movieDate: any) {
            return new Date(movieDate).getFullYear();
        },
        watchNowClicked(watchOption) {
            if (!this.user.displayName) {
                return;
            }
            const userDbRef = db.collection('users').doc(this.user.uid);
            userDbRef
                .collection('continueWatching')
                .doc(`${this.item.id}`)
                .set({
                    watchOption,
                    ...this.item,
                    updatedAt: Date.now(),
                });
        },
    },
    computed: {
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
    margin-top: 1rem;
    // min-width: 13rem;
    position: relative;
    padding-left: 1rem;
    // padding-top: 1rem;
    display: flex;
    background: rgba(28, 28, 28, 0.43);
    box-shadow: inset 0 0 15px rgb(104, 104, 104);
    backdrop-filter: blur(3px);
    float: left;
    flex-direction: column;
    border-radius: 0.5rem;
    .watch-options-heading {
        position: absolute;
        top: -1rem;
        border: 2px @link-color-red solid;
        color: @link-color-red;
        padding: 0.3rem 1rem;
        border-radius: 1rem;
        background: rgb(15, 15, 15);
    }
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
    .ott-icon {
        width: 2.5rem;
    }
    .watch-price {
        font-size: 0.65rem;
        color: rgb(207, 207, 207);
        text-shadow: none;
    }
}
</style>
