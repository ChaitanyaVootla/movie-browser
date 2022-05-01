<template>
    <div :class="`${id} main-slider-div`">
        <div class="slider-heading">{{ heading }}</div>
        <div class="slider-container">
            <div class="scroll-item" v-on:click="slideLeft" v-show="isBarFull">
                <!-- <font-awesome-icon :icon="['fas', 'chevron-left']" /> -->
                <i class="el-icon-arrow-left"></i>
            </div>
            <div v-show="!isBarFull" class="ml-4"></div>
            <div class="slider-bar" id="scroll-bar">
                <person-card
                    v-for="(person, index) in persons"
                    :person="person"
                    :configuration="configuration"
                    :imageRes="'w185'"
                    :selectPerson="selectPerson"
                    :key="person.id + index"
                    :disableRatingShadow="true"
                ></person-card>
            </div>
            <div class="scroll-item scroll-item-right" v-on:click="slideRight" v-show="isBarFull">
                <!-- <font-awesome-icon :icon="['fas', 'chevron-right']" /> -->
                <i class="el-icon-arrow-right"></i>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '../../API/api';
export default {
    name: 'personSlider',
    props: ['persons', 'configuration', 'id', 'heading', 'showMovieInfoModal', 'selectPerson'],
    data() {
        return {
            scrollValue: 500,
            showInfo: false,
            isBarFull: true,
        };
    },
    mounted() {
        this.isBarFull = this.checkIsBarFull();
    },
    methods: {
        slideLeft: function () {
            $(`.${this.id} .slider-bar`)[0].scrollLeft -= $(`.${this.id} .slider-bar`)[0].clientWidth;
        },
        slideRight: function () {
            $(`.${this.id} .slider-bar`)[0].scrollLeft += $(`.${this.id} .slider-bar`)[0].clientWidth;
        },
        checkIsBarFull() {
            // if ($(`.${this.id} .slider-bar`)[0] && $(`.${this.id} .slider-heading`)[0]) {
            //     return $(`.${this.id} .slider-bar`)[0].scrollWidth > $(`.${this.id} .slider-heading`)[0].clientWidth;
            // }
            return true;
        },
    },
    watch: {
        persons: {
            handler() {
                $(`.${this.id} .slider-bar`)[0].scrollLeft = 0;
            },
            deep: true,
        },
    },
};
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';
.slider-bar {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    justify-content: end;
    position: relative;
    padding: 0 0.5em;
    margin-right: 0.5em;
    padding-top: 0.5em;
    width: 100%;
}
.slider-bar::-webkit-scrollbar {
    display: none;
}
.slider-heading {
    font-size: 17px;
    font-weight: 500;
    padding-left: 2.2em;
    padding-top: 1em;
    padding-bottom: 0.4em;
}
.scroll-item {
    background: #333;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: linear-gradient(to right, #111 0%, #1b1b1b 100%);
    padding: 0 0.5em;
    cursor: pointer;
}
.scroll-item-right {
    background: linear-gradient(to right, #1b1b1b 0%, #111 100%);
}
.slider-container {
    display: flex;
}
.main-slider-div {
    padding-bottom: 0;
}
/deep/ .person-card-image {
    height: 11em !important;
    margin: 0 0.2em;
}
.history-slider /deep/.movie-card-image {
    height: 13em;
}
@media (max-width: 767px) {
    .scroll-item {
        background: transparent;
        padding: 0.3em;
        display: none;
    }
    .slider-bar {
        padding: 0;
    }
    .slider-heading {
        padding-left: 1.3em;
    }
    /deep/ .person-card-image {
        width: @mobile-card-width !important;
        height: auto !important;
    }
}
</style>
