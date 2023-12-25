export default defineEventHandler(async (event) => {
    const personId = getRouterParam(event, 'personId');
    if (!personId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Person not found for id: ${personId}`);
    }

    return $fetch(`${TMDB.BASE_URL}/person/${personId}?api_key=${process.env.TMDB_API_KEY
        }&append_to_response=images,combined_credits,external_ids`)
});
