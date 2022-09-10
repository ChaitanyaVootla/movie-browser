import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";

const setupRoute = (app) => {
    app.get('/user',
        async (req:IGetUserAuthInfoRequest, res) => {
            if (req.user) {
                res.json(req.user)
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED);
            }
        }
    );
}

export {setupRoute as default};
