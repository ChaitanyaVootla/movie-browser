import { JWT } from "next-auth/jwt";
import { UserRating } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const body = await readBody(event);
    const itemId = parseInt(body.itemId as string);
    const itemType = body.itemType as string;
    const rating = parseInt(body.rating as string);

    if (!itemId || !itemType || !rating) {
        event.node.res.statusCode = 403;
        event.node.res.end(`Wrong params`);
    }

    const newRating = {
        userId: userData.sub,
        itemId,
        itemType,
        rating,
        createdAt: new Date(),
    };
    const existing = await UserRating.findOne({itemId, userId: userData.sub, itemType})
    if (existing) {
        await UserRating.deleteOne({_id: existing._id});
    }
    await UserRating.create(newRating);
    return newRating;
});
