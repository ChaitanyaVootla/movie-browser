<template>
    <div id="historyChart" style="width: 600px;height:400px;"></div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { isMovie } from '@/common/utils';
import * as echarts from 'echarts';
import moment from 'moment';

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
            if (isMovie(this.details)) {
                this.stats = await api.getHistoricalMovieStats(this.details.id);
            } else {
                this.stats = await api.getHistoricalSeriesStats(this.details.id);
            }
        },
        drawChart() {
            var chartDom = document.getElementById('historyChart');
            var myChart = echarts.init(chartDom, null, { height: '400px', width: '600px' });

            const option = {
                xAxis: {
                    type: 'time',
                    axisLabel: {
                        hideOverlap: true
                    }
                },
                yAxis: {
                    type: 'value'
                },
                tooltip: {
                    trigger: "axis",
                    axisPointer: {
                        type: "shadow",
                    },
                    formatter: (params) => {
                        console.log(params)
                        return `
                            <b>Popularity - ${moment(params[0].data[0]).format('DD MMM YYYY')}</b>
                            <br />
                            ${Number(params[0].data[1]).toFixed(0)}
                        `;
                    },
                },
                series: [
                    {
                        name: 'Popularity',
                        data: this.stats.map((stat: any) => [stat.date, stat.popularity]),
                        type: 'line',
                        showSymbol: false,
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
