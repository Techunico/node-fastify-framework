import { Schema } from "mongoose";
import { registerModel } from "@/plugins/db-mongoose/register-model";

export const widgetSchema = new Schema({ name: { type: String, required: true } });

export const Widget = registerModel("FixtureWidget", widgetSchema);
