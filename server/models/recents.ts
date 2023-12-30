import { InferSchemaType, model, Schema } from "mongoose";

const RecentsSchema = new Schema({
    userId: {type: Number, required: true},
    itemId: {type: Number, required: true},
    isMovie: {type: Boolean, required: true},
    poster_path: {type: String, required: false},
    backdrop_path: {type: String, required: false},
    title: {type: String, required: false},
    name: {type: String, required: false},
    updatedAt: {type: Date, required: true},
}, {strict: false});

RecentsSchema.index({userId: 1 , itemId: 1, isMovie: 1}, {unique: true});
RecentsSchema.index({userId: 1});

type IRecent = InferSchemaType<typeof RecentsSchema>;

const Recent = model<IRecent>('recents', RecentsSchema);
export { RecentsSchema, IRecent, Recent};
