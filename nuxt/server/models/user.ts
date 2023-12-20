import { Schema, model } from "mongoose";

const UserSchema = new Schema({
    sub: Number,
    name: String,
}, {strict: false});

export default model<any>("users", UserSchema);
