import { model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const SeriesSchema = new Schema({
    id: Number,
    title: String,
    adult: Boolean,
    poster_path: String,
    backdrop_path: String,
    genres: [{id: Number, name: String}],
    updatedAt: Date,
    any: Schema.Types.Mixed,
}, {strict: false});

interface ISeries {
    id: Number,
    title: String,
    adult: Boolean,
    poster_path: String,
    backdrop_path: String,
    genres: [{id: Number, name: String}],
    updatedAt: Date,
    any: Schema.Types.Mixed,
}

const SeriesLightFileds = `id name adult overview popularity release_date imdb_id poster_path backdrop_path vote_average
    genres updatedAt status next_episode_to_air first_air_date last_episode_to_air`;

const Series = model<ISeries>(dbConstants.collections.tv, SeriesSchema);
export { SeriesSchema, ISeries, SeriesLightFileds, Series};
