import { InferSchemaType, model, Schema } from "mongoose";

const UserRatingsSchema = new Schema({
    userId: {type: Number, required: true},
    itemId: {type: Number, required: true},
    rating: {type: Number, required: true},
    itemType: {type: String, required: false},
    createdAt: {type: Date, required: true},
}, {strict: false});

UserRatingsSchema.index({userId: 1 , itemId: 1}, {unique: true});

type IUserRating = InferSchemaType<typeof UserRatingsSchema>;

const UserRating = model<IUserRating>('userratings', UserRatingsSchema);
export { UserRatingsSchema, IUserRating, UserRating};
