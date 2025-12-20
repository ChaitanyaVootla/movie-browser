import { JWT } from "next-auth/jwt";
import { ContinueWatching } from "~/server/models";

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
    const watchLink = body.watchLink;

    if (!itemId || (typeof isMovie != 'boolean')) {
        event.node.res.statusCode = 403;
        event.node.res.end(`Wrong params`);
    }

    const continueWatchingObj = {
        userId: userData.sub,
        itemId,
        isMovie,
        poster_path,
        backdrop_path,
        title,
        name,
        watchLink,
        watchProviderName: body.watchProviderName,
        updatedAt: new Date(),
    };
    const existing = await ContinueWatching.findOne({itemId, isMovie, userId: userData.sub})
    if (existing) {
        await ContinueWatching.deleteOne({_id: existing._id});
    }
    await ContinueWatching.create(continueWatchingObj);
    // clean up
    const excessItems = await (await ContinueWatching.find({userId: userData.sub}).sort({updatedAt: -1}))
        .slice(10).map(doc => doc._id);
    await ContinueWatching.deleteMany({_id: {$in: excessItems}})
    return {
        itemId,
        isMovie,
        userId: userData.sub,
    };
});
