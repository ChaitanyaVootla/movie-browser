import { findPrimaryTrailer } from './video';

export const createMovieLdSchema = (movie: any) => {
    if (!movie?.title) return {};
    return {
        "@context": "https://schema.org",
        "@type": "Movie",
        "name": movie.title,
        "genre": movie.genres?.map((genre: any) => genre.name),
        "keywords": movie.keywords?.keywords?.map((keyword: any) => keyword.name).join(', '),
        "trailer": getTrailerSchema(movie.videos),
        "url": `https://www.themoviebrowser.com/movie/${movie.id}`,
        "description": movie.overview,
        "image": `https://image.tmdb.org/t/p/w780${movie.poster_path}`,
        "duration": getDuration(movie.runtime),
        "datePublished": movie.release_date,
        "director": [getPersonSchema(movie.credits?.crew?.find((crew: any) => crew.job === 'Director'))],
        "actor": movie.credits?.cast?.slice(0, 5).map((person: any) => getPersonSchema(person)),
        "aggregateRating": getAggregateRatingSchema(movie),
    }
}

export const createTVSeriesLdSchema = (tvSeries: any) => {
    if (!tvSeries?.name) return {};
    return {
        "@context": "https://schema.org",
        "@type": "TVSeries",
        "name": tvSeries.name,
        "genre": tvSeries.genres?.map((genre: any) => genre.name),
        "keywords": tvSeries.keywords?.results?.map((keyword: any) => keyword.name).join(', '),
        "trailer": getTrailerSchema(tvSeries.videos),
        "url": `https://www.themoviebrowser.com/tv/${tvSeries.id}`,
        "description": tvSeries.overview,
        "image": `https://image.tmdb.org/t/p/w780${tvSeries.poster_path}`,
        "numberOfSeasons": tvSeries.number_of_seasons,
        "numberOfEpisodes": tvSeries.number_of_episodes,
        "datePublished": tvSeries.first_air_date,
        "actor": tvSeries.credits?.cast?.slice(0, 5).map((person: any) => getPersonSchema(person)),
        "creator": tvSeries.created_by?.map((person: any) => getPersonSchema(person)),
        "aggregateRating": getAggregateRatingSchema(tvSeries),
    }
}

export const createPersonLdSchema = (person: any) => {
    if (!person?.name) return {};
    return {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": person.name,
        "image": `https://image.tmdb.org/t/p/w300${person.profile_path}`,
        "url": `https://www.themoviebrowser.com/person/${person.id}`,
        "description": person.biography,
        "birthDate": person.birthday,
        "deathDate": person.deathday,
        "birthPlace": person.place_of_birth,
        "jobTitle": Array.from(new Set([...person.combined_credits?.crew?.map((crew: any) => crew.job), person.known_for_department])),
    }
}

export const getPersonSchema = (person: any) => {
    if (!person) return {};
    return {
        "@type": "Person",
        "name": person.name,
        "image": `https://image.tmdb.org/t/p/w300${person.profile_path}`,
        "url": `https://www.themoviebrowser.com/person/${person.id}`
    }
}

const getAggregateRatingSchema = (item: any) => {
    return {
        "@type": "AggregateRating",
        "ratingValue": item.vote_average,
        "bestRating": 10,
        "worstRating": 0,
        "ratingCount": item.vote_count
    }
}

const getDuration = (time: number) => {
    if (!time) return '';
    if (time < 60) return `PT${time}M`;
    return `PT${Math.floor(time / 60)}H${time % 60}M`;
}

const getTrailerSchema = (videos: any) => {
    if (!videos?.results?.length) return {};
    const trailer = findPrimaryTrailer(videos);
    if (!trailer) return {};
    return {
        "@type": "VideoObject",
        "name": trailer.name,
        "description": trailer.name,
        "thumbnail": {
            "@type": "ImageObject",
            "contentUrl": `https://img.youtube.com/vi/${trailer.key}/maxresdefault.jpg`,
        },
        "thumbnailUrl": `https://img.youtube.com/vi/${trailer.key}/maxresdefault.jpg`,
        "uploadDate": trailer.published_at,
        "url": `https://www.youtube.com/watch?v=${trailer.key}`,
        "embedUrl": `https://www.youtube.com/embed/${trailer.key}`
    }
}
