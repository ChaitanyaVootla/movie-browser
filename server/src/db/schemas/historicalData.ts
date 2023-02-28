import { InferSchemaType, model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const HistoricalDataSchema = new Schema({
    id: {type: Number, required: true},
    date: {type: Date, required: true},
    isMovie: {type: Boolean, required: true},
}, {strict: false});

type IHistoricalData = InferSchemaType<typeof HistoricalDataSchema>;

const HistoricalData = model<IHistoricalData>(dbConstants.collections.historicalData, HistoricalDataSchema);

export { HistoricalDataSchema, HistoricalData, IHistoricalData};
