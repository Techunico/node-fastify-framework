import mongoose, { Model, Schema } from "mongoose";

/**
 * Safe Mongoose model registration with hot-reload / duplicate protection.
 *
 * Prefer this over bare `mongoose.model()` so re-imports under ts-node-dev
 * (and intentional double requires from the model loader) do not throw
 * "Cannot overwrite model once compiled".
 *
 * @example
 * const UserSchema = new Schema({ email: String });
 * export const User = registerModel("User", UserSchema);
 */
export function registerModel<T = any>(
  name: string,
  schema: Schema<any>,
  collection?: string,
): Model<T> {
  if (!name || typeof name !== "string") {
    throw new Error("registerModel: name is required");
  }
  if (!schema) {
    throw new Error(`registerModel: schema is required for model "${name}"`);
  }

  const existing = mongoose.models[name] as Model<T> | undefined;
  if (existing) {
    return existing;
  }

  return mongoose.model<T>(name, schema, collection);
}

/**
 * Returns a previously registered model, or undefined if not yet loaded.
 */
export function getRegisteredModel<T = any>(name: string): Model<T> | undefined {
  return mongoose.models[name] as Model<T> | undefined;
}

/**
 * Snapshot of model names currently on the default mongoose connection.
 */
export function listRegisteredModels(): string[] {
  return Object.keys(mongoose.models);
}
