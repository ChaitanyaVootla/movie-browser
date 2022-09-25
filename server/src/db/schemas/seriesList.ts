import { InferSchemaType, model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const SeriesListSchema = new Schema({
    userId: {type: Number, required: true},
    seriesId: {type: Number, required: true},
    createdAt: {type: Date, required: true},
}, {strict: false});

SeriesListSchema.index({userId: 1 , seriesId: 1}, {unique: true});

type ISeriesList = InferSchemaType<typeof SeriesListSchema>;

const SeriesList = model<ISeriesList>(dbConstants.collections.seriesList, SeriesListSchema);
export { SeriesListSchema, ISeriesList, SeriesList};
