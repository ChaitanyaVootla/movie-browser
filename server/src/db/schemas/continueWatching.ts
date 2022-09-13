import { InferSchemaType, model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const ContinueWatchingSchema = new Schema({
    userId: {type: Number, required: true},
    itemId: {type: Number, required: true},
    isMovie: {type: Boolean, required: true},
    updatedAt: {type: Date, required: true},
    watchLink: {type: String, required: true},
}, {strict: false});

ContinueWatchingSchema.index({userId: 1 , itemId: 1, isMovie: 1}, {unique: true});
ContinueWatchingSchema.index({userId: 1});

type IContinueWatching = InferSchemaType<typeof ContinueWatchingSchema>;

const ContinueWatching = model<IContinueWatching>(dbConstants.collections.continueWatching, ContinueWatchingSchema);
export { ContinueWatchingSchema, IContinueWatching, ContinueWatching};
