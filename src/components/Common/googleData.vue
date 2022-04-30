<template>
    <div>
        <div style="display: flex" class="mt-3 mb-3">
            <div class="rating-container">
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
                    <div>Watch Now</div>
                    <div class="watch-price">{{ watchOption.price }}</div>
                </div>
            </a>
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
            console.log(userDbRef, watchOption);
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
.rating-container {
    margin-right: 1rem;
    text-align: center;
    img {
        width: 2.2em;
    }
    span {
        font-size: 0.9em;
    }
}
.watch-price {
    font-size: 0.7rem;
    color: #aaa;
}
.ott-links-container {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
}
.ott-container {
    width: 6rem;
    margin-bottom: 1rem;
}
</style>
