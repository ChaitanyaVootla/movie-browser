import { InferSchemaType, model, Schema } from "mongoose";

const WatchedMoviesSchema = new Schema({
    userId: {type: Number, required: true},
    movieId: {type: Number, required: true},
    createdAt: {type: Date, required: true},
}, {strict: false});

WatchedMoviesSchema.index({userId: 1 , movieId: 1}, {unique: true});

type IWatchedMovie = InferSchemaType<typeof WatchedMoviesSchema>;

const WatchedMovies = model<IWatchedMovie>('WatchedMovies', WatchedMoviesSchema);
export { WatchedMoviesSchema, IWatchedMovie, WatchedMovies};
