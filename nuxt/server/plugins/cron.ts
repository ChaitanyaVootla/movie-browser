import cron from "node-cron";

export default defineNitroPlugin(async (nitroApp) => {
    console.log("Starting cron jobs");
    cron.schedule('0 3 * * *', async () => {
        $fetch('/api/cron/series');
    });
    cron.schedule('0 3 * * *', async () => {
        $fetch(`/api/trending/trendingTmdb`);
    });
    // Storage management cron jobs
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('🧹 Clearing discovery cache...');
            useStorage('discovery').clear();
        } catch (error) {
            console.error('Error clearing discovery storage:', error);
        }
    });
    
    // Clear trending cache every hour (cache TTL is 30 min)
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('🧹 Clearing trending cache...');
            useStorage('trending').clear();
        } catch (error) {
            console.error('Error clearing trending storage:', error);
        }
    });
    
    // Clear seasons cache every 12 hours (cache TTL is 6 hours)
    cron.schedule('0 */12 * * *', async () => {
        try {
            console.log('🧹 Clearing seasons cache...');
            useStorage('seasons').clear();
        } catch (error) {
            console.error('Error clearing seasons storage:', error);
        }
    });
});
