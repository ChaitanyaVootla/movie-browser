export const getTopicKey = (type: string, topic: string, media: string) => {
    return `${type}-${topic}-${media}`;
}
