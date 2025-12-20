import { getCodes } from 'country-list';
import { topics } from './topics';
import { getCountryMeta, getGenreMeta, getLanguageMeta, popularGenres } from './utils';
import { mappedThemes } from './themes';

const countryTopics = getCodes().map((countryCode) => [getCountryMeta(countryCode), getCountryMeta(countryCode, 'tv')]).flat();

const languageTopics = LANGAUAGES.map(({ iso_639_1 }) =>  [getLanguageMeta(iso_639_1), getLanguageMeta(iso_639_1, 'tv')]).flat();

const genreTopics = Object.values(movieGenres).map(({ name }) => getGenreMeta(name));

const allTopics = [
    // ...Object.values(topics),
    // ...countryTopics,
    // ...languageTopics,
    ...genreTopics,
    ...mappedThemes,
];

export { topics, allTopics };
