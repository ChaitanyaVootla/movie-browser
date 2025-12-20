import { JWT } from "next-auth/jwt";
import { UserRating } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const query = getQuery(event);
    const itemId = parseInt(query.itemId as string);
    const itemType = query.itemType as string;

    if (!itemId || !itemType) {
        event.node.res.statusCode = 403;
        event.node.res.end(`Wrong params`);
    }

    const existing = await UserRating.findOne({itemId, userId: userData.sub, itemType})
    return existing || {};
});
