import cron from "node-cron";

export default defineNitroPlugin(async (nitroApp) => {
    console.log("Starting cron jobs");
    cron.schedule('0 3 * * *', async () => {
        $fetch('/api/cron/series');
    });
    cron.schedule('0 3 * * *', async () => {
        $fetch(`/api/trending/trendingTmdb`);
    });
});
