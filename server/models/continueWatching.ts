import { InferSchemaType, model, Schema } from "mongoose";

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

const ContinueWatching = model<IContinueWatching>('continueWatching', ContinueWatchingSchema);
export { ContinueWatchingSchema, IContinueWatching, ContinueWatching};
