import { JWT } from "next-auth/jwt";
import { Recent } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const recents = await Recent.find({userId: userData?.sub}).select('-_id -__v -userId').sort({updatedAt: -1});
    return recents.map(recent => ({
        ...recent.toJSON(),
        id: recent.itemId,
    }));
});
