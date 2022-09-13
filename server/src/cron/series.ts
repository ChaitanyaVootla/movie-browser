import download from 'download';
import moment from "moment";
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import zlib from 'zlib';
import {promisify} from 'util';
import { pipeline } from 'stream';
import { updateSeries } from "@/series/updateSeries";

const fileName = 'latestSeries';

const cronSeries = async () => {
    const latest = moment().subtract(1, 'days').format('MM_DD_YYYY');
    await download(`http://files.tmdb.org/p/exports/tv_series_ids_${latest}.json.gz`, path.join(__dirname, 'data'), {
        filename: `${fileName}.json.gz`,
    });
    
    const fileContents = fs.createReadStream(path.join(__dirname, 'data', `${fileName}.json.gz`));
    const writeStream = fs.createWriteStream(path.join(__dirname, 'data', `${fileName}.json`));
    const unzip = zlib.createGunzip();

    const pipe = promisify(pipeline);
    await pipe(fileContents, unzip, writeStream)
    const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${fileName}.json`));
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    let seriesIds = [];
    for await (const line of rl) {
        if (JSON.parse(line).popularity > 100)
            seriesIds.push(JSON.parse(line).id);
    }
    updateSeries(seriesIds, true);
    return seriesIds.length;
}

export { cronSeries };
