import { HistoricalData } from '@/db/schemas/historicalData';
import moment from 'moment';

export const getHistoricalData = (id: number) => {
    const last30Days = moment().subtract(30, 'days').startOf('day').toDate();
    return HistoricalData.find({id, date: {$gte: last30Days}});
};
