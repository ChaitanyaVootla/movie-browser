import { connect } from "mongoose";

export default defineNitroPlugin(async (nitroApp) => {
    try {
        await connect(`mongodb://root:${process.env.MONGO_PASS}@${process.env.MONGO_IP}:27017`, {
            dbName: "test",
        });
        console.log("DB connection established.");
    } catch (error) {
        console.error("DB connection failed.", error);
    }
})
