import cron from "node-cron";

export default defineNitroPlugin(async (nitroApp) => {
    console.log("Starting cron jobs");
    cron.schedule('0 3 * * *', async () => {
        $fetch('/api/cron/series');
    });
    cron.schedule('0 3 * * *', async () => {
        $fetch(`/api/trending/trendingTmdb`);
    });
    // New cron job to clear storage every hour
    cron.schedule('0 * * * *', async () => {
        try {
            useStorage('discovery').clear();
        } catch (error) {
            console.error('Error clearing storage:', error);
        }
    });
});
