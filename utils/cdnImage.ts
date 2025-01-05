export enum IMAGE_TYPE {
    POSTER = 'poster',
    LOGO = 'logo',
    BACKDROP = 'backdrop',
    WIDE_CARD = 'wide_card',
}

export const getCdnImage = (item: any, imageType: IMAGE_TYPE) => {
    return `https://d2qifmj8erqnak.cloudfront.net/${item.title?'movie':'tv'}/${item.id}/${imageType}.avif`;
}
