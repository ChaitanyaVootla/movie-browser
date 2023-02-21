import AWS from 'aws-sdk';

const getGoogleData = async (str: string) => {
    console.time(`Calling aws lambda ${str}`);
    AWS.config.update({
        region: 'ap-south-1',
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

export default getGoogleData;
