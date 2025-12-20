import crypto from 'crypto';

export const getObjectSha = (obj: any) => {
    // Sort object keys for consistent hashing
    const sortedObj = sortObjectKeys(obj);
    let objString = JSON.stringify(sortedObj);
    return crypto.createHash('md5').update(objString).digest('hex');
}

// Helper function to recursively sort object keys
function sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: any = {};
    
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    
    return sortedObj;
}
