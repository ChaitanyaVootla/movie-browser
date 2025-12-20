export const getTopicKey = (type: string, topic: string, media: string) => {
    return `${type}-${sanitiseTopic(topic)}-${media}`;
}

export const sanitiseTopic = (topic: string) => {
    return topic.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
