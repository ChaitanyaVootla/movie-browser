<template>
    Historical Popularity - Last 3 months
    <HistoryChart :details="details" v-if="details.id"></HistoryChart>
</template>

<script lang="ts">
import HistoryChart from '@/components/HistoryChart/index.vue';

export default {
    name: 'HistoryStats',
    components: {
        HistoryChart,
    },
    props: {
        details: Object,
    },
    data() {
        return {
        };
    },
    mounted() {
    },
}
</script>

<style lang="scss" scoped>
</style>
