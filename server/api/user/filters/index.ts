import { JWT } from "next-auth/jwt";
import { Filters } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const filters = await Filters.find({userId: userData?.sub, isGobal: false});
    return filters;
});
