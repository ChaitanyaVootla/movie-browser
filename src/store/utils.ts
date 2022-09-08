const trimTmdbObject = ({title, name, poster_path, backdrop_path, vote_average, genres,
    id, imdb_id, release_date, overview, updatedAt, status, next_episode_to_air, first_air_date}) => {
    return {
        title,
        name,
        poster_path,
        backdrop_path,
        vote_average,
        genres,
        id,
        imdb_id,
        release_date,
        overview,
        updatedAt,
        status,
        next_episode_to_air,
        first_air_date,
    }
}

export { trimTmdbObject };
