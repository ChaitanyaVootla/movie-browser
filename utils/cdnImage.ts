export enum IMAGE_TYPE {
    POSTER = 'poster',
    LOGO = 'logo',
    BACKDROP = 'backdrop',
    WIDE_CARD = 'widePoster',
}

export const getCdnImage = (item: any, imageType: IMAGE_TYPE) => {
    return `https://image.themoviebrowser.com/${item.title?'movie':'series'}/${item.id}/${imageType}.webp`;
}
