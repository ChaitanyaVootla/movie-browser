import { LambdaClient, InvokeCommand, InvokeCommandInput } from '@aws-sdk/client-lambda';

const decoder = new TextDecoder('utf-8');

const getNewLambdaDataInternal = async (searchString: string, tmdbId?: string, imdbId?: string, wikidataId?: string, mediaType: 'movie' | 'tv' = 'movie') => {
    console.time(`Calling new lambda ${searchString}`);
    const client = new LambdaClient();
    const params = {
        FunctionName: 'movie-ratings-scraper', // New lambda function name
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
            queryStringParameters: {
                searchString,
                tmdbId,
                imdbId,
                wikidataId,
                mediaType
                // No googleScraperMode - skips Google scraping for speed
            }
        }),
    } as InvokeCommandInput;
    const command = new InvokeCommand(params);
    const res = await client.send(command);
    const jsonRes = JSON.parse(decoder.decode(res.Payload));
    console.timeEnd(`Calling new lambda ${searchString}`);
    
    if (jsonRes.body) {
        return JSON.parse(jsonRes.body);
    }
    return {};
};

const getYear = (movieDate: any) => {
    return new Date(movieDate).getFullYear();
};

export const getNewLambdaData = async (item: any) => {
    let mainStr = sanitizeString(`${item.name || item.title}`);
    const dateInfo = `${item.first_air_date ? 'tv series' : getYear(item.release_date) + ' movie'}`;
    const mediaType = item.first_air_date ? 'tv' : 'movie';
    
    // Extract wikidata_id from external_ids if available
    const wikidataId = item.external_ids?.wikidata_id;
    
    // Make just one simple call without fallbacks for maximum speed
    return await getNewLambdaDataInternal(
        `${mainStr} ${dateInfo}`,
        item.id,
        item.imdb_id,
        wikidataId,
        mediaType
    );
};

const sanitizeString = (str: string) => {
    return str.replaceAll('&', "and").replaceAll('?','');
};
