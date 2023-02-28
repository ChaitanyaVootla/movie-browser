<template>
    <div id="historyChart" style="width: 600px;height:400px;"></div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import * as echarts from 'echarts';

export default {
    name: 'HistoryChart',
    props: {
        details: Object,
    },
    data() {
        return {
            chart: null as any,
            stats: [] as any[],
        };
    },
    mounted() {
        this.init();
    },
    methods: {
        async init() {
            await this.getHistoricalStats();
            this.drawChart();
        },
        async getHistoricalStats() {
            this.stats = await api.getHistoricalStats(this.details.id);
        },
        drawChart() {
            var chartDom = document.getElementById('historyChart');
            var myChart = echarts.init(chartDom, null, { height: '400px', width: '600px' });

            const option = {
                xAxis: {
                    type: 'time',
                },
                yAxis: {
                    type: 'value'
                },
                series: [
                    {
                        name: 'Popularity',
                        data: this.stats.map((stat: any) => [stat.date, stat.popularity]),
                        type: 'line',
                        areaStyle: {}
                    }
                ]
            };

            myChart.setOption(option);
        },
    },
};
</script>

<style lang="less" scoped>
</style>
