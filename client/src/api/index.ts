import axios from 'axios';
import config from './constants';

export const api = {
    getTrendingListWeek: async function () {
        const res = await axios.get(
            `${config.serverBaseTMDBUrl}${config.trendingListWeek}`
        );
        return res.data;
    },
    streamingNow: async function () {
        const res = await axios.get(
            `${config.serverBaseTMDBUrl}${config.trendingListWeek}`
        );
        return res.data;
    },
}
