import AWS from 'aws-sdk';

const getGoogleData = async (str: string) => {
    console.time(`Calling aws lambda ${str}`);
    AWS.config.update({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    const lambda = new AWS.Lambda();
    const params = {
        FunctionName: 'puppeteer-node14',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
            queryStringParameters: {
                searchString: str.split('search?q=')[1],
            }
        }),
    };
    const res = await lambda.invoke(params).promise();
    const jsonRes = JSON.parse(res.Payload as string);
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
