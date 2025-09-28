import { model, Schema } from "mongoose";

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

interface IMovie {
    id: Number,
    title: String,
    adult: Boolean,
    poster_path: String,
    backdrop_path: String,
    genres: [{id: Number, name: String}],
    updatedAt: Date,
    vote_average?: Number,
    vote_count?: Number,
    googleData?: any,
    external_data?: any,
    any: Schema.Types.Mixed,
}

const MovieLightFileds = 'id title vote_average vote_count genres poster_path backdrop_path googleData external_data images.logos homepage';

const Movie = model<IMovie>("Movie", MovieSchema, "movies");

export {
    Movie,
    MovieLightFileds,
    IMovie,
};
