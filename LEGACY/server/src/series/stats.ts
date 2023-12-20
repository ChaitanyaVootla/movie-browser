import { HistoricalData } from '@/db/schemas/historicalData';
import moment from 'moment';

export const getHistoricalData = (id: number) => {
    const last30Days = moment().subtract(3, 'months').startOf('day').toDate();
    return HistoricalData.find({id, isMovie: false});
};
