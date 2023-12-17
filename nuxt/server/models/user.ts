import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema({
    sub: Number,
    name: String,
}, {strict: false});

export default mongoose.model("users", UserSchema);
