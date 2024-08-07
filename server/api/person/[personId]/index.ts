import { JWT } from "next-auth/jwt";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const personId = getRouterParam(event, 'personId');
    if (!personId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Person not found for id: ${personId}`);
    }

    const person: any = await $fetch(`${TMDB.BASE_URL}/person/${personId}?api_key=${process.env.TMDB_API_KEY
        }&append_to_response=images,combined_credits,external_ids`);

    if (person.adult && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }
    return person;
});
