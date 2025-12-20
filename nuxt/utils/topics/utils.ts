import { getCode, getName, getNames } from "country-list";
import { getThemeMeta, themeTopicSearchItems } from "./themes";
import { getTopicKey, sanitiseTopic } from "./commonUtils";

export const popularGenres = [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 27, name: 'Horror' },
    { id: 878, name: 'Science Fiction' },
    { id: 12, name: 'Adventure' },
    { id: 18, name: 'Drama' },
    { id: 14, name: 'Fantasy' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 53, name: 'Thriller' },
    { id: 10752, name: 'War' },
];

export const popularSeriesGenres = [
    { id: 10759, name: 'Action & Adventure' },
    { id: 35, name: 'Comedy' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 18, name: 'Drama' },
    { id: 80, name: 'Crime' },
    { id: 16, name: 'Animation' },
    { id: 99, name: 'Documentary' },
    { id: 10751, name: 'Family' },
    { id: 9648, name: 'Mystery' },
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
        name: `${media === 'movie' ? 'Movies' : 'Shows'} from ${countryName}`,
        key: `country/${countryName}`,
        filterParams: {
            media_type: media,
            with_origin_country: countryCode.toUpperCase(),
        },
        scrollVariations: (media === 'movie' ?popularGenres: popularSeriesGenres).map((genre) => ({
            name: `${countryName} - ${genre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
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
        name: `${language?.english_name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
        key: `language/${language?.english_name}`,
        filterParams: {
            media_type: media,
            with_original_language: language?.iso_639_1,
        },
        scrollVariations: (media === 'movie' ?popularGenres: popularSeriesGenres).map((genre) => ({
            name: `${language?.english_name} - ${genre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
            key: `popular-in-${language}-genre-${genre.id}`,
            filterParams: {
                with_genres: genre.id,
            },
        })),
        transform: basePromoTransform,
    };
}

export const getGenreMeta = (genreString: string, media="movie") => {
    const genre = media === 'movie' ?
        Object.values(movieGenres).find(({ name }) => sanitiseTopic(name) === sanitiseTopic(genreString)):
        Object.values(seriesGenres).find(({ name }) => sanitiseTopic(name) === sanitiseTopic(genreString))
    return {
        name: `${genre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
        key: getTopicKey('genre', genre.name, 'movie'),
        ignorePromo: false,
        filterParams: {
            media_type: media,
            with_genres: genre.id,
            'vote_count.gte': 70,
        },
        scrollVariations: (media === 'movie' ?popularGenres: popularSeriesGenres)
            .filter(({ name, id }) => id !== genre.id).map((subGenre) => ({
                name: `${genre.name} - ${subGenre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
                key: `popular-genre-${subGenre.id}`,
                filterParams: {
                    with_genres: [subGenre.id, genre.id],
                },
        })),
        transform: basePromoTransform,
    };
}

export const getTopicNameFromKey = (key: string) => {
    const [type, topic, media] = key.split('-');
    switch (type) {
        case 'genre':
            return topic;
        case 'country':
            return getName(topic);
        case 'language':
            return topic;
        case 'theme':
            return topic;
        default:
            return null;
    }
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
    const [type, ...rest] = key.split('-');
    const media = rest.pop();
    const topic = rest.join('-');
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

const countryTopicSearchItems = getNames().map((countryName) => ({
        name: `Movies from ${countryName}`,
        key: getTopicKey('country', countryName, 'movie'),
    })
) as Array<{ name: string, key: string }>;

const genreTopicSearchItems = Object.values(movieGenres).map(({ name }) => ({
    name: `${name} Movies`,
    key: getTopicKey('genre', name, 'movie'),
})) as Array<{ name: string, key: string }>;

const languageTopicSearchItems = LANGAUAGES.map(({ english_name }) => ({
    name: `${english_name} Movies`,
    key: getTopicKey('language', english_name, 'movie'),
})) as Array<{ name: string, key: string }>;

export const searchTopics = (searchString: string) => {
    const search = searchString.toLowerCase();
    return [
        ...genreTopicSearchItems.filter(({ name }) => name.toLowerCase().includes(search)),
        ...themeTopicSearchItems.filter(({ name }) => name.toLowerCase().includes(search)),
        ...languageTopicSearchItems.filter(({ name }) => name.toLowerCase().includes(search)),
        ...countryTopicSearchItems.filter(({ name }) => name.toLowerCase().includes(search)),
    ];
}
