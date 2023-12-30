import { JWT } from "next-auth/jwt";
import { ContinueWatching } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const items = await ContinueWatching.find({userId: userData?.sub}).select('-_id -__v -userId').sort({updatedAt: -1});
    return items.map(item => ({
        ...item.toJSON(),
        id: item.itemId,
    }));
});
