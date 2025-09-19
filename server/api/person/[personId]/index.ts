import { JWT } from "next-auth/jwt";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const personId = getRouterParam(event, 'personId');
    if (!personId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Person not found for id: ${personId}`);
    }

    try {
        const person: any = await $fetch(`${TMDB.BASE_URL}/person/${personId}?api_key=${process.env.TMDB_API_KEY
            }&append_to_response=images,combined_credits,external_ids`, {
                timeout: 15000,  // 15 second timeout
                retry: 3         // 3 retries
            });
            
        if (!person || !person.id) {
            console.error(`❌ Invalid person data for ID: ${personId}`);
            event.node.res.statusCode = 404;
            event.node.res.end(`Person not found for id: ${personId}`);
            return;
        }
        
        if (person.adult && (!userData || !userData?.sub)) {
            event.node.res.statusCode = 401;
            event.node.res.end(`Unauthorized`);
            return;
        }
        
        return person;
        
    } catch (error: any) {
        console.error(`❌ TMDB person API error for ID ${personId}:`, {
            error: error.message,
            timestamp: new Date().toISOString()
        });
        
        event.node.res.statusCode = 500;
        event.node.res.end(`Error fetching person data: ${error.message}`);
        return;
    }
});
