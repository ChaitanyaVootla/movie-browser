import { connect } from "mongoose";

export default defineNitroPlugin(async (nitroApp) => {
    try {
        const mongoPort = process.env.MONGO_PORT || '27018';
        await connect(`mongodb://root:${process.env.MONGO_PASS}@${process.env.MONGO_IP}:${mongoPort}`, {
            dbName: "test",
        });
        console.log("DB connection established.");
    } catch (error) {
        console.error("DB connection failed.", error);
    }
})
