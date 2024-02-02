import { JWT } from "next-auth/jwt";
import { Filters } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const body = await readBody(event);
    const id  = body.id as string;
    console.log(id, userData.sub);
    await Filters.deleteOne({ userId: userData.sub, _id: id}).exec();
    return {
        status: 200,
    };
});
