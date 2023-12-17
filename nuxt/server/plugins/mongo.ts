import mongoose from "mongoose";

export default defineNitroPlugin(async (nitroApp) => {
    if (mongoose.connection?.readyState === 1) {
        return;
    }
    try {
        await mongoose.connect("mongodb://root:rootpassword@localhost:27017", {
            dbName: "test",
        });
        console.log("DB connection established.");
    } catch (error) {
        console.error("DB connection failed.", error);
    }
})
