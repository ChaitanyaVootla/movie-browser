import { InferSchemaType, model, Schema } from "mongoose";

const FiltersSchema = new Schema({
    name: {type: String, required: true},
    userId: {type: Number, required: true},
}, {strict: false});

type IFilter = InferSchemaType<typeof FiltersSchema>;

const Filters = model<IFilter>('filters', FiltersSchema);

export { FiltersSchema, Filters, IFilter};
