import axios from 'axios';
import axiosRetry from 'axios-retry';
import { load } from 'cheerio';

axiosRetry(axios, {retries: 3});

const getGoogleDataLite = async (str: string) => {
    try {
        const { data }: {data: string} = await axios.get(str);
        const $= load(data)

        const ratings = [];
        let imdbIndex = -1;
        let imdbId = null;

        $(".BNeawe.s3v9rd.AP7Wnd .Ap5OSd .BNeawe.s3v9rd.AP7Wnd .BNeawe").each(
            (index, element) => {
                const name = $(element).text();
                ratings.push({name});
                if (name.toLocaleLowerCase() == 'imdb') {
                    imdbIndex = index;
                }
            }
        );

        $(".BNeawe.s3v9rd.AP7Wnd .Ap5OSd .BNeawe.s3v9rd.AP7Wnd").each(
            (index, element) => {
            const values = $(element).text().split('\n').map(str => str.split(' ')[0]).filter(Boolean);
            for (let i = 0; i < values.length; i++) {
                if (ratings[i]) {
                    ratings[i].rating = values[i];
                }
            }
        });

        $(".BNeawe.s3v9rd.AP7Wnd .Ap5OSd .BNeawe.s3v9rd.AP7Wnd .BNeawe a").each(
            (index, element) =>{
            ratings[index].link = $(element).attr('href')?.split('/url?q=')[1].split('&sa=')[0]
        });
        if (imdbIndex != 1) {
            imdbId = ratings[imdbIndex]?.link.split('/title/')[1].split('/')[0];
            ratings[imdbIndex].rating = ratings[imdbIndex].rating?.split('/')[0];
        }
        return {ratings, imdbId, allWatchOptions: []};
    } catch(e) {
        return null;
    }
}

export { getGoogleDataLite };
