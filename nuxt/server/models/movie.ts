import mongoose, { model, Schema } from "mongoose";
// import { dbConstants } from "../constants";

const MovieSchema = new Schema({
    id: Number,
    title: String,
    adult: Boolean,
    poster_path: String,
    backdrop_path: String,
    genres: [{id: Number, name: String}],
    updatedAt: Date,
    any: Schema.Types.Mixed,
}, {strict: false});

// interface IMovie {
//     id: Number,
//     title: String,
//     adult: Boolean,
//     poster_path: String,
//     backdrop_path: String,
//     genres: [{id: Number, name: String}],
//     updatedAt: Date,
//     any: Schema.Types.Mixed,
// }

// const MovieLightFileds = 'id title adult original_title overview popularity release_date imdb_id vote_average genres poster_path backdrop_path';

export default mongoose.model("Movie", MovieSchema, "movies");
