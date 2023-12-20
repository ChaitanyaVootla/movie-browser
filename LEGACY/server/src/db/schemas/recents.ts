import { InferSchemaType, model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const RecentsSchema = new Schema({
    userId: {type: Number, required: true},
    itemId: {type: Number, required: true},
    isMovie: {type: Boolean, required: true},
    updatedAt: {type: Date, required: true},
}, {strict: false});

RecentsSchema.index({userId: 1 , itemId: 1, isMovie: 1}, {unique: true});
RecentsSchema.index({userId: 1});

type IRecent = InferSchemaType<typeof RecentsSchema>;

const Recent = model<IRecent>(dbConstants.collections.recents, RecentsSchema);
export { RecentsSchema, IRecent, Recent};
