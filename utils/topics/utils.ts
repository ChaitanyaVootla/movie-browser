import { getCode, getName } from "country-list";
import { getThemeMeta } from "./themes";

export const popularGenres = [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 12, name: 'Adventure' },
    { id: 80, name: 'Crime' },
    { id: 878, name: 'Science Fiction' },
    { id: 18, name: 'Drama' },
    { id: 14, name: 'Fantasy' },
    { id: 27, name: 'Horror' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 53, name: 'Thriller' },
    { id: 10752, name: 'War' },
];
const basePromoTransform = (items: any[]) => {
    return items.filter(({backdrop_path}: any) => backdrop_path).filter(Boolean);
}

export const getCountryMeta = (countryString: string, media="movie") => {
    let countryCode = 'IN'
    let countryName = getName(countryCode);
    if (getName(countryString)) {
        countryCode = countryString;
        countryName = getName(countryCode);
    } else if (getCode(countryString)) {
        countryCode = getCode(countryString) as string;
        countryName = getName(countryCode);
    }
    return {
        name: `Popular ${media === 'movie' ? 'Movies' : 'Shows'} from ${countryName}`,
        key: `country/${countryName}`,
        filterParams: {
            media_type: media,
            with_origin_country: countryCode.toUpperCase(),
        },
        scrollVariations: popularGenres.map((genre) => ({
            name: `${countryName} - Popular ${genre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
            key: `popular-in-${countryCode}-genre-${genre.id}`,
            filterParams: {
                with_genres: genre.id,
            },
        })),
        transform: basePromoTransform,
    };
}

export const getLanguageMeta = (languageString: string, media="movie") => {
    let language = LANGAUAGES.find((lang) =>
        (lang.iso_639_1 === languageString) ||
        (lang.english_name.toLocaleLowerCase() === languageString.toLocaleLowerCase()));
    if (!language) {
        language = LANGAUAGES.find((lang) => lang.english_name === 'English');
    }
    return {
        name: `Popular ${language?.english_name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
        key: `language/${language?.english_name}`,
        filterParams: {
            media_type: media,
            with_original_language: language?.iso_639_1,
        },
        scrollVariations: popularGenres.map((genre) => ({
            name: `${language?.english_name} - Popular ${genre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
            key: `popular-in-${language}-genre-${genre.id}`,
            filterParams: {
                with_genres: genre.id,
            },
        })),
        transform: basePromoTransform,
    };
}

export const getGenreMeta = (genre: string, media="movie") => {
    const genreId = popularGenres.find(({ name }) => name.toLocaleLowerCase() === genre.toLocaleLowerCase())?.id;
    return {
        name: `Popular ${genre} ${media === 'movie' ? 'Movies' : 'Shows'}`,
        key: getTopicKey('genre', genre, 'movie'),
        ignorePromo: false,
        filterParams: {
            media_type: media,
            with_genres: genreId,
        },
        scrollVariations: popularGenres.filter(({ name }) => name !== genre).map((subGenre) => ({
            name: `Popular ${genre} - ${subGenre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
            key: `popular-genre-${subGenre.id}`,
            filterParams: {
                with_genres: [subGenre.id, genreId],
            },
        })),
        transform: basePromoTransform,
    };
}

export const getTopicKey = (type: string, topic: string, media: string) => {
    return `${type}-${topic}-${media}`;
}

export const getTopicObject = (topicUrlString: string) => {
    const [type, topic, media] = topicUrlString.split('-');
    return {
        type,
        topic,
        media,
    };
}

export const getTopicMetaFromKey = (key: string) => {
    const [type, topic, media] = key.split('-');
    switch (type) {
        case 'genre':
            return getGenreMeta(topic, media);
        case 'country':
            return getCountryMeta(topic, media);
        case 'language':
            return getLanguageMeta(topic, media);
        case 'theme':
            return getThemeMeta(topic, media);
        default:
            return null;
    }
}