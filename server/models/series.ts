import { model, Schema } from "mongoose";

const SeriesSchema = new Schema({
    id: Number,
    name: String,
    adult: Boolean,
    poster_path: String,
    backdrop_path: String,
    genres: [{id: Number, name: String}],
    updatedAt: Date,
    any: Schema.Types.Mixed,
}, {strict: false});

interface ISeries {
    id: Number,
    name: String,
    adult: Boolean,
    poster_path: String,
    backdrop_path: String,
    genres: [{id: Number, name: String}],
    updatedAt: Date,
    any: Schema.Types.Mixed,
}

const SeriesLightFileds = `-_id id name adult overview popularity release_date imdb_id poster_path backdrop_path vote_average
    genres updatedAt status next_episode_to_air first_air_date last_episode_to_air googleData images.logos`;

const SERIES_QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

const Series = model<ISeries>('series', SeriesSchema);
export { SeriesSchema, ISeries, SeriesLightFileds, Series, SERIES_QUERY_PARAMS };
