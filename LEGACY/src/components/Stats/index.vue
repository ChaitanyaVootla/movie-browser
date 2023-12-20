<template>
    <div class="row-container">
        <div>
            <div class="label main-label">Movies</div>
            <el-row class="info-bar">
                <el-col :span="8">
                    <div class="label">Total coverage</div>
                    <el-progress :percentage="totalMoviesInDbPercentage"></el-progress>
                </el-col>
            </el-row>
            <el-row class="info-bar">
                <el-col :span="8">
                    <div class="label">IMDB coverage</div>
                    <el-progress :percentage="totalMoviesWithImdbPercentage"></el-progress>
                </el-col>
            </el-row>
            <el-row class="info-bar">
                <el-col :span="8">
                    <div class="label">Google data covered</div>
                    <el-progress :percentage="totalMoviesWithGoogleDataPercentage"></el-progress>
                </el-col>
            </el-row>
        </div>
        <div>
            <div class="label main-label">Series</div>
            <el-row class="info-bar">
                <el-col :span="8">
                    <div class="label">Total coverage</div>
                    <el-progress :percentage="totalSeriesInDbPercentage"></el-progress>
                </el-col>
            </el-row>
            <el-row class="info-bar">
                <el-col :span="8">
                    <div class="label">IMDB coverage</div>
                    <el-progress :percentage="totalSeriesWithImdbPercentage"></el-progress>
                </el-col>
            </el-row>
            <el-row class="info-bar">
                <el-col :span="8">
                    <div class="label">Google data covered</div>
                    <el-progress :percentage="totalSeriesWithGoogleDataPercentage"></el-progress>
                </el-col>
            </el-row>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';

export default {
    name: 'Stats',
    data() {
        return {
            stats: {} as any,
            interval: null as any,
        };
    },
    created() {
        this.loadStats();
        this.interval = setInterval(async () => {
            this.loadStats();
        }, 60*1000);
    },
    computed: {
        totalMoviesInDbPercentage() {
            return ((this.stats.movies?.db?.total / this.stats.movies?.total) * 100).toFixed(2);
        },
        totalMoviesWithImdbPercentage() {
            return ((this.stats.movies?.db?.imdb / this.stats.movies?.total) * 100).toFixed(2);
        },
        totalMoviesWithGoogleDataPercentage() {
            return ((this.stats.movies?.db?.withGoogleData / this.stats.movies?.total) * 100).toFixed(2);
        },
        totalSeriesInDbPercentage() {
            return ((this.stats.series?.db?.total / this.stats.series?.total) * 100).toFixed(2);
        },
        totalSeriesWithImdbPercentage() {
            return ((this.stats.series?.db?.imdb / this.stats.series?.total) * 100).toFixed(2);
        },
        totalSeriesWithGoogleDataPercentage() {
            return ((this.stats.series?.db?.withGoogleData / this.stats.series?.total) * 100).toFixed(2);
        },
    },
    methods: {
        async loadStats() {
            this.stats = await api.getStats();
        },
        getProgressText(text: string) {
            return (percentage: number) => {
                return `${text}: ${percentage}%`;
            };
        },
    },
    beforeUnmount() {
        clearInterval(this.interval);
    },
}
</script>

<style lang="less" scoped>
.row-container {
    display: flex;
    justify-content: space-around;
    width: 100%;
    >div {
        width: 100%;
    }
}
.main-label {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 1rem;
}
.info-bar {
    margin-bottom: 1rem;
}
</style>
