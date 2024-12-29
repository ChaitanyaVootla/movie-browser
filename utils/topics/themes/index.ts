import { getTopicKey } from '../commonUtils';
import { popularGenres, popularSeriesGenres } from '../utils';
import themes from './themes.json';

export const getThemeMeta = (themeString: string, media="movie") => {
    const theme = themes.find(({ name }) => name.toLowerCase().replace(/ /g, '') === themeString.toLowerCase());
    if (!theme) {
        return null;
    }
    return {
        name: `${theme.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
        key: getTopicKey('theme', theme.name.toLowerCase().replace(/ /g, ''), media ),
        filterParams: {
            media_type: media,
            with_keywords: theme.keywords.map(({id}) => id),
        },
        scrollVariations: (media === 'movie' ? popularGenres: popularSeriesGenres).map((genre) => ({
            name: `${theme.name} - ${genre.name} ${media === 'movie' ? 'Movies' : 'Shows'}`,
            key: `popular-in-${theme.name.toLowerCase().replace(/ /g, '')}-genre-${genre.id}`,
            filterParams: {
                with_genres: genre.id,
            },
        })),
    }
}
    

export const mappedThemes = themes.map((theme) => {
    return [
        {
            name: `${theme.name} Movies`,
            key: `theme-${theme.name.toLowerCase().replace(/ /g, '')}-movie`,
            filterParams: {
                media_type: 'movie',
                with_keywords: theme.keywords.map(({id}) => id),
            },
        },
        {
            name: `${theme.name} Shows`,
            key: `theme-${theme.name.toLowerCase().replace(/ /g, '')}-tv`,
            filterParams: {
                media_type: 'tv',
                with_keywords: theme.keywords.map(({id}) => id),
            },
        },
    ];
}).flat();


export const themeTopicSearchItems = mappedThemes.map(({ name, key }) => ({
    name,
    key,
})) as Array<{ name: string, key: string }>;
