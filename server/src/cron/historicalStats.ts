import moment, { Moment } from "moment"
import { loadMovieDataByDate, loadSeriesDataByDate } from "./updateTmdbItems";
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { HistoricalData, IHistoricalData } from '@/db/schemas/historicalData';
import { chunk } from "lodash";

const movieFileName = 'latestMovie';
const seriesFileName = 'latestSeries';

export const getHistoricalMovieStats = async () => {
    const latestDate = moment().subtract(1, 'days');
    const startingDate = moment().subtract(3, 'months');

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
            const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${movieFileName}.json`));
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
            
            // const chunkedMovieItems = chunk(allMovieItems, 400*1000);
            // for (const movieItems of chunkedMovieItems) {
                await HistoricalData.insertMany(allMovieItems.map(movieItem => ({
                    date: moment(date.startOf('day')).toDate(),
                    ...movieItem,
                    isMovie: true,
                } as IHistoricalData)),
                {
                    ordered: false,
                }).catch(e => {
                    console.log(`Failed to insert historical data for date: ${date} with error: ${e}`);
                });
            // }
        } catch (e) {
            console.log(`Failed to load historical data for date: ${date}` + e);
        }
    }
}

export const getHistoricalSeriesStats = async () => {
    const latestDate = moment().subtract(1, 'days');
    const startingDate = moment().subtract(3, 'months');

    const dates = [] as Moment[];
    let currentDate = moment(startingDate);
    while (currentDate <= moment(latestDate)) {
        dates.push(currentDate);
        currentDate = moment(currentDate).add(1, 'days');
    }

    for (const date of dates) {
        try {
            console.log(`Loading historical data for date: ${date}`)
            await loadSeriesDataByDate(date as any);
            const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${seriesFileName}.json`));
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            const allSeriesItems = [];
            for await (const line of rl) {
                allSeriesItems.push(JSON.parse(line));
            }
            fileStream.close();
            rl.close();
            console.log(`Fetched ${allSeriesItems.length} items for date: ${date}`);
            
            await HistoricalData.insertMany(allSeriesItems.map(seriesItem => ({
                date: moment(date.startOf('day')).toDate(),
                ...seriesItem,
                isMovie: false,
            } as IHistoricalData)),
            {
                ordered: false,
            }).catch(e => {
                console.log(`Failed to insert historical data for date: ${date} with error: ${e}`);
            });
        } catch (e) {
            console.log(`Failed to load historical data for date: ${date}` + e);
        }
    }
}
