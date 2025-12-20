import { Schema, model } from "mongoose";

const UserSchema = new Schema({
    sub: Number,
    name: String,
}, {strict: false});

interface IUser {
    id: String,
    createdAt: Date,
    updatedAt: Date,
    any: Schema.Types.Mixed,
}

const User =  model<IUser>("users", UserSchema);

export {
    User,
    IUser,
};
