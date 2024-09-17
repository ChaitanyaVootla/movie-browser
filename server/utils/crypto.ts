import crypto from 'crypto';

export const getObjectSha = (obj: any) => {
    let objString = JSON.stringify(obj);
    return crypto.createHash('md5').update(objString).digest('hex');
}
