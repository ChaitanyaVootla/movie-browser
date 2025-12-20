import { JWT } from "next-auth/jwt";
import { SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const seriesId = getRouterParam(event, 'seriesId');
    if (!seriesId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${seriesId}`);
    }
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const objectToDelete =
        {
            seriesId: parseInt(seriesId as string),
            userId: parseInt(userData.sub as string),
        };
    await SeriesList.deleteOne(objectToDelete)
    return {
        seriesId,
        userId: userData.sub,
    };
});
