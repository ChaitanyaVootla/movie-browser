import axios from 'axios';
import axiosRetry from 'axios-retry';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';

axiosRetry(axios, {retries: 3});

const getRottenTomatoesLite = async (str: string) => {
    try {
        const { data }: {data: string} = await axios.get(str);
        const $ = load(data)
        // fs.writeFileSync(path.join(__dirname, 'rt.html'), data);
        const rt = {
            criticsConsensus: '',
            audienceSays: '',
            link: str,
        }
        const whatToKnow = [];
        $(".what-to-know__section-body span").each(
            (index, element) => {
                whatToKnow.push($(element).text().trim())
        });
        if (whatToKnow.length === 2) {
            rt.criticsConsensus = whatToKnow[0];
            rt.audienceSays = whatToKnow[1];
        }
        return rt;
    } catch(e) {
        return null;
    }
}

const getRottenTomatoesSeriesLite = async (str: string) => {
    try {
        const { data }: {data: string} = await axios.get(str);
        const $ = load(data)
        // fs.writeFileSync(path.join(__dirname, 'rtSeries.html'), data);
        const rt = {
            criticsRating: '',
            audienceRating: '',
            link: str,
        }
        $("[data-qa='tomatometer']").each(
            (index, element) => {
                rt.criticsRating = $(element).text().trim();
        });
        $("[data-qa='audience-score']").each(
            (index, element) => {
                rt.audienceRating = $(element).text().trim();
        });
        return rt;
    } catch(e) {
        return null;
    }
}

export { getRottenTomatoesLite, getRottenTomatoesSeriesLite };
