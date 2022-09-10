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

const Series = model<ISeries>(dbConstants.collections.tv, SeriesSchema);
export { SeriesSchema, ISeries, Series};
