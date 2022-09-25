import { InferSchemaType, model, Schema } from "mongoose";
import { dbConstants } from "../constants";

const FiltersSchema = new Schema({
    name: {type: String, required: true},
    userId: {type: Number, required: true},
}, {strict: false});

type IFilter = InferSchemaType<typeof FiltersSchema>;

const Filters = model<IFilter>(dbConstants.collections.filters, FiltersSchema);

export { FiltersSchema, Filters, IFilter};
