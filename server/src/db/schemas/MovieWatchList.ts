import { InferSchemaType, model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const MoviesWatchListSchema = new Schema({
    userId: {type: Number, required: true},
    movieId: {type: Number, required: true},
    createdAt: {type: Date, required: true},
}, {strict: false});

MoviesWatchListSchema.index({userId: 1 , movieId: 1}, {unique: true});

type IMoviesWatchList = InferSchemaType<typeof MoviesWatchListSchema>;

const MoviesWatchList = model<IMoviesWatchList>(dbConstants.collections.moviesWatchList, MoviesWatchListSchema);
export { MoviesWatchListSchema, IMoviesWatchList, MoviesWatchList};
