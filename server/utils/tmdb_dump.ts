import * as fs from 'fs';
import axios from 'axios';
import * as zlib from 'zlib';
import * as path from 'path';
import * as readline from 'readline';

export enum TMDBMediaType {
    MOVIE = 'movie',
    SERIES = 'series',
    PERSON = 'person',
}

const getMediaDumpUrl = (mediaType: TMDBMediaType) => {
    switch (mediaType) {
        case TMDBMediaType.MOVIE:
            return `http://files.tmdb.org/p/exports/movie_ids_${getSafeDate()}.json.gz`;
        case TMDBMediaType.SERIES:
            return `http://files.tmdb.org/p/exports/tv_series_ids_${getSafeDate()}.json.gz`;
        case TMDBMediaType.PERSON:
            return `http://files.tmdb.org/p/exports/person_ids_${getSafeDate()}.json.gz`;
    }
};

const getSafeDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    let month: any = date.getMonth() + 1;
    if (month < 10) {
        month = `0${month}`;
    }
    let day: any = date.getDate();
    if (day < 10) {
        day = `0${day}`;
    }
    return `${month}_${day}_${date.getFullYear()}`;
};

const downloadAndUnzipFileIfNotExists = async (url: string, unzippedFilePath: string) => {
    if (!fs.existsSync(unzippedFilePath)) {
        console.log(`Downloading and unzipping: ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        // @ts-ignore
        const decompressed = zlib.gunzipSync(buffer);
        // @ts-ignore
        fs.writeFileSync(unzippedFilePath, decompressed);
        console.log(`File downloaded and unzipped to: ${unzippedFilePath}`);
    } else {
        console.log(`Unzipped file already exists: ${unzippedFilePath}`);
    }
};

const readFileLineByLine = async (filePath: string): Promise<any[]> => {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const items: any[] = [];
    for await (const line of rl) {
        if (line.trim()) {
            items.push(JSON.parse(line.trim()));
        }
    }
    return items;
};

export const getLatestMovieDataFile = async (): Promise<string> => {
    const formattedDate = getSafeDate();
    const dataDir = path.resolve('./data');
    const unzippedFilePath = path.join(dataDir, `movie_ids_${formattedDate}.json`);

    await downloadAndUnzipFileIfNotExists(getMediaDumpUrl(TMDBMediaType.MOVIE), unzippedFilePath);
    return unzippedFilePath;
};

export const getLatestSeriesDataFile = async (): Promise<string> => {
    const formattedDate = getSafeDate();
    const dataDir = path.resolve('./data');
    const unzippedFilePath = path.join(dataDir, `tv_series_ids_${formattedDate}.json`);

    await downloadAndUnzipFileIfNotExists(getMediaDumpUrl(TMDBMediaType.SERIES), unzippedFilePath);
    return unzippedFilePath;
}

export const getLatestPersonDataFile = async (): Promise<string> => {
    const formattedDate = getSafeDate();
    const dataDir = path.resolve('./data');
    const unzippedFilePath = path.join(dataDir, `person_ids_${formattedDate}.json`);

    await downloadAndUnzipFileIfNotExists(getMediaDumpUrl(TMDBMediaType.PERSON), unzippedFilePath);
    return unzippedFilePath;
}

export const getLatestMovieData = async (): Promise<any[]> => {
    const filePath = await getLatestMovieDataFile();
    return readFileLineByLine(filePath);
};

export const getLatestSeriesData = async (): Promise<any[]> => {
    const filePath = await getLatestSeriesDataFile();
    return readFileLineByLine(filePath);
};

export const getLatestPersonData = async (): Promise<any[]> => {
    const filePath = await getLatestPersonDataFile();
    return readFileLineByLine(filePath);
};
