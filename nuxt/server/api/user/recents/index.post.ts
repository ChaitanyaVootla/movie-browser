import { JWT } from "next-auth/jwt";
import { Recent } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const body = await readBody(event);
    const itemId = parseInt(body.itemId as string);
    const isMovie = body.isMovie === 'true';
    const poster_path = body.poster_path;
    const backdrop_path = body.backdrop_path;
    const title = body.title;
    const name = body.name;

    if (!itemId || (typeof isMovie != 'boolean')) {
        event.node.res.statusCode = 403;
        event.node.res.end(`Wrong params`);
    }

    const recentObj = {
        userId: userData.sub,
        itemId,
        isMovie,
        poster_path,
        backdrop_path,
        title,
        name,
        updatedAt: new Date(),
    };
    const existing = await Recent.findOne({itemId, isMovie, userId: userData.sub})
    if (existing) {
        await Recent.deleteOne({_id: existing._id});
    }
    await Recent.create(recentObj);
    // clean up
    const excessRecents = await (await Recent.find({userId: userData.sub}).sort({updatedAt: -1}))
        .slice(10).map(doc => doc._id);
    await Recent.deleteMany({_id: {$in: excessRecents}})
    return {
        itemId,
        isMovie,
        userId: userData.sub,
    };
});
