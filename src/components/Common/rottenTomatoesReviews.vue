<template>
    <div>
        <div
            v-if="
                (item.rottenTomatoes && item.rottenTomatoes.criticsConsensus) ||
                (item.rottenTomatoes && item.rottenTomatoes.criticsRating)
            "
            class="heading"
        >
            <a :href="item.rottenTomatoes.link" target="_blank" rel="noreferrer noopener"
                >Rotten Tomatoes <i class="el-icon-top-right"></i
            ></a>
        </div>
        <div v-if="item.rottenTomatoes && item.rottenTomatoes.criticsConsensus" class="rottenTomatoes">
            <div class="frosted">
                <div class="heading"> <img src="/images/rating/rottenTomatoes.svg" /> Critics consensus </div>
                <div class="review">{{ item.rottenTomatoes.criticsConsensus }}</div>
            </div>
            <div class="frosted">
                <div class="heading"> <img src="/images/rating/rottenAudience.svg" /> Audience says </div>
                <div class="review">{{ item.rottenTomatoes.audienceSays }}</div>
            </div>
        </div>
        <div v-if="item.rottenTomatoes && item.rottenTomatoes.criticsRating" class="rottenTomatoes">
            <div class="frosted">
                <div class="heading centered">
                    <img src="/images/rating/rottenTomatoes.svg" /> {{ item.rottenTomatoes.criticsRating }}
                </div>
                <div class="subText">Critics rating</div>
            </div>
            <div class="frosted">
                <div class="heading centered">
                    <img src="/images/rating/rottenAudience.svg" /> {{ item.rottenTomatoes.audienceRating }}
                </div>
                <div class="subText">Audience rating</div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default {
    name: 'rottenTomatoesReviews',
    props: {
        item: Object,
    },
};
</script>

<style scoped lang="less">
.heading {
    font-size: 1.5rem;
    font-weight: 500;
}
.rottenTomatoes {
    margin-bottom: 3rem;
    margin-top: 1rem;
    display: flex;
    justify-content: left;
    gap: 20px;
    div {
        padding: 1rem;
        max-width: 35vw;
        border-radius: 30px;
        img {
            width: 30px;
            margin-right: 1rem;
        }
        .subText {
            font-weight: 500;
        }
        .review {
            padding-left: 1rem;
        }
    }
    .heading {
        padding: 0;
        padding-bottom: 0.5rem;
        padding-left: 0.5rem;
        font-weight: 500;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        &.centered {
            justify-content: center;
            padding-bottom: 0;
        }
    }
}
</style>
