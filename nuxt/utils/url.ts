export const getBaseUrl = (url: string) => {
    const urlObj = new URL(url);
    return urlObj.host;
};
