import { LambdaClient, InvokeCommand, InvokeCommandInput } from '@aws-sdk/client-lambda';

const decoder = new TextDecoder('utf-8');

const getGoogleData = async (str: string) => {
    console.time(`Calling aws lambda ${str}`);
    const client = new LambdaClient();
    const params = {
        FunctionName: 'puppeteer-node14',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
            queryStringParameters: {
                searchString: str.split('search?q=')[1],
            }
        }),
    } as InvokeCommandInput;
    const command = new InvokeCommand(params);
    const res = await client.send(command)
    const jsonRes = JSON.parse(decoder.decode(res.Payload));
    console.timeEnd(`Calling aws lambda ${str}`);
    return jsonRes;
};

const getYear = (movieDate: any) => {
    return new Date(movieDate).getFullYear();
};

export const getGoogleLambdaData = async (item: any) => {
    const mainStr = `https://google.com/search?q=${item.name || item.title}`;
    const dateInfo = `${item.first_air_date ? 'tv series' : getYear(item.release_date) + ' movie'}`;
    const fullStringAttempt = await getGoogleData(`${mainStr} ${dateInfo}`);
    if (fullStringAttempt.ratings?.length > 0) {
        return fullStringAttempt;
    } else {
        return await getGoogleData(mainStr);
    }
};
