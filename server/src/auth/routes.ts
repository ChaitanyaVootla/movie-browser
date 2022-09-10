import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { OAuth2Client, TokenPayload } from "google-auth-library";

const setupRoute = (app) => {
    app.post('/auth/callback',
        async (req: IGetUserAuthInfoRequest, res) => {
            try {
                const userData: TokenPayload = await verify(req);
                req.session.user = userData;
                res.redirect('back');
            } catch(e) {
                console.error(e);
            }
        }
    );

    app.get("/logout", (req, res) => {
        req.session.destroy((err) => {
            if (err) { return console.error(err); }
            res.clearCookie('googleonetap').json({message: 'logged out'});
        });
    })
}

async function verify(req) {
    const CLIENT_ID = process.env.GOOGLE_AUTH_CLIENT_ID;
    const client = new OAuth2Client(CLIENT_ID);
    const ticket = await client.verifyIdToken({
        idToken: `${req.body.credential}`,
        audience: CLIENT_ID,
    });
    return ticket.getPayload();
}

export {setupRoute as default};
