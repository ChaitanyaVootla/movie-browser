import { IGetUserAuthInfoRequest } from './utils';
import { Users } from '@/db/schemas/User';

const authInjector = async (req: IGetUserAuthInfoRequest, res, next) => {
    req.isAuthenticated = false;
    if (req.session.user) {
        const dbUser = await Users.findOne({ id: req.session.user.sub });
        if (!dbUser) {
            await Users.updateOne(
                { id: req.session.user.sub },
                {
                    $set: {
                        ...req.session.user,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
                { upsert: true },
            );
        } else {
            await Users.updateOne(
                { id: req.session.user.sub },
                {
                    $set: {
                        updatedAt: new Date(),
                    },
                },
            );
        }
        req.user = {
            ...dbUser.toJSON(),
            isAdmin: req.session.user?.email === 'speedblaze@gmail.com' ? true : false,
        } as any;
        req.isAuthenticated = true;
    } else {
        // console.log(req.path)
    }
    next();
};

export { authInjector };
