import { Request } from "express"
import { Session } from "express-session"
import { TokenPayload } from "google-auth-library"
export interface IGetUserAuthInfoRequest extends Request {
    session: SessionWithUser
    user: UserTokenPayload
    isAuthenticated: Boolean
}

interface SessionWithUser extends Session {
    user: TokenPayload
}

interface UserTokenPayload extends TokenPayload {
    isAdmin: Boolean
}
