<template>
    <div class="main-container">
        <div class="heading">{{title}}</div>
        <div class="section-container">
            <InfoCard
                v-for="(item, index) in items"
                class="info-card"
                :key="index"
                :item="item"
            />
        </div>
    </div>
</template>

<script lang="ts">
import InfoCard from './Common/infoCard.vue';

export default {
    name: 'CardSection',
    components: {
        InfoCard,
    },
    props: {
        title: {
            type: String,
            default: '',
        },
        items: {
            type: Array,
            default: () => [],
        },
    },
    data() {
        return {
        };
    },
    methods: {
    },
    computed: {},
};
</script>

<style scoped lang="less">
.main-container {
    margin: 0 2rem;
    .heading {
        font-size: 1.4em;
        font-weight: 500;
        margin-bottom: 1.5rem;
    }
    .section-container {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
        .info-card {
            margin-bottom: 2rem;
        }
    }
}
</style>