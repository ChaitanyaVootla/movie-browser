import { TokenPayload } from "google-auth-library";
import { model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const UserSchema = new Schema({
    sub: Number,
    name: String,
}, {strict: false});

const Users = model<TokenPayload>(dbConstants.collections.users, UserSchema);
export { UserSchema, Users};
