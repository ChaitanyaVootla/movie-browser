export const stripLogos = (item: any) => {
    const englishLogo = item.images?.logos?.find((logo: any) => logo.iso_639_1 === 'en');
    if (!englishLogo) {
        item.images.logos = [];
    } else {
        item.images.logos = [englishLogo];
    }
    return item;
};
