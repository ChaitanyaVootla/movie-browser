import { LambdaClient, InvokeCommand, InvokeCommandInput } from '@aws-sdk/client-lambda';
import { LANGAUAGES } from '~/utils/languages';

const decoder = new TextDecoder('utf-8');

const getGoogleData = async (string: string) => {
    console.time(`Calling aws lambda ${string}`);
    const client = new LambdaClient();
    const params = {
        FunctionName: 'puppeteer-node14',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
            queryStringParameters: {
                searchString: string,
            }
        }),
    } as InvokeCommandInput;
    const command = new InvokeCommand(params);
    const res = await client.send(command)
    const jsonRes = JSON.parse(decoder.decode(res.Payload));
    console.timeEnd(`Calling aws lambda ${string}`);
    return jsonRes;
};

const getYear = (movieDate: any) => {
    return new Date(movieDate).getFullYear();
};

export const getGoogleLambdaData = async (item: any) => {
    let mainStr = sanitizeString(`${item.name || item.title}`);
    const dateInfo = `${item.first_air_date ? 'tv series' : getYear(item.release_date) + ' movie'}`;
    if (item.original_language !== 'en') {
        const language = LANGAUAGES.find(({iso_639_1}) => iso_639_1 === item.original_language);
        if (language) {
            const languageStringAttempt = await getGoogleData(`${mainStr} ${language.english_name} ${dateInfo}`);
            if (languageStringAttempt.ratings?.length > 0) {
                return languageStringAttempt;
            }
        }
    }
    const fullStringAttempt = await getGoogleData(`${mainStr} ${dateInfo}`);
    if (fullStringAttempt.ratings?.length > 0) {
        return fullStringAttempt;
    } else {
        return await getGoogleData(mainStr);
    }
};

const sanitizeString = (str: string) => {
    return str.replaceAll('&', "and").replaceAll('?','');
};
