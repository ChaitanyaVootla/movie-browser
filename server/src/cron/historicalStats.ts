import moment, { Moment } from "moment"
import { loadMovieDataByDate } from "./updateTmdbItems";
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { HistoricalData, IHistoricalData } from '@/db/schemas/historicalData';
import { chunk } from "lodash";

const fileName = 'latestMovie';

export const getHistoricalMovieStats = async () => {
    const latestDate = moment().subtract(1, 'days');
    const startingDate = moment().subtract(1, 'months');

    const dates = [] as Moment[];
    let currentDate = moment(startingDate);
    while (currentDate <= moment(latestDate)) {
        dates.push(currentDate);
        currentDate = moment(currentDate).add(1, 'days');
    }

    for (const date of dates) {
        try {
            console.log(`Loading historical data for date: ${date}`)
            await loadMovieDataByDate(date as any);
            const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${fileName}.json`));
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            const allMovieItems = [];
            for await (const line of rl) {
                allMovieItems.push(JSON.parse(line));
            }
            fileStream.close();
            rl.close();
            console.log(`Fetched ${allMovieItems.length} items for date: ${date}`);
            
            const chunkedMovieItems = chunk(allMovieItems, 400*1000);
            for (const movieItems of chunkedMovieItems) {
                // const createCalls = HistoricalData.create(movieItems.map(movieItem => ({
                //     date: moment(date).toDate(),
                //     ...movieItem,
                //     isMovie: true,
                // } as IHistoricalData)));
                // await Promise.all(createCalls);
                await HistoricalData.insertMany(movieItems.map(movieItem => ({
                    date: moment(date.startOf('day')).toDate(),
                    ...movieItem,
                    isMovie: true,
                } as IHistoricalData)),
                {
                    ordered: false,
                }).catch(e => {
                    console.log(`Failed to insert historical data for date: ${date} with error: ${e}`);
                });
            }
        } catch (e) {
            console.log(`Failed to load historical data for date: ${date}` + e);
        }
    }
}
