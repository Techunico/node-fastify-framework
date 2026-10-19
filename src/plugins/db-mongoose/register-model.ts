import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

export class ModelRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRegistrationError";
  }
}

/**
 * Registers a Mongoose model on the default connection.
 *
 * - Registering the same name with the *same* schema object returns the
 *   existing model (safe for repeated imports, Jest module registries and the
 *   model loader re-requiring a file).
 * - Registering the same name with a *different* schema throws instead of
 *   silently handing back a model compiled from another schema.
 *
 * Typing note: the document type is inferred from the concrete schema. Calling
 * `mongoose.model<T>()` with an explicit, unconstrained `T` and `Schema<any>`
 * makes TypeScript expand Mongoose's inference types without bound (the
 * compiler ran out of memory), so the call is made without a type argument and
 * the result is narrowed once here.
 *
 * @example
 * const UserSchema = new Schema({ email: { type: String, required: true } });
 * export const User = registerModel("User", UserSchema);
 */
export function registerModel<TSchema extends Schema>(
  name: string,
  schema: TSchema,
  collection?: string,
): Model<InferSchemaType<TSchema>> {
  if (!name || typeof name !== "string") {
    throw new ModelRegistrationError("registerModel: name is required");
  }
  if (!schema) {
    throw new ModelRegistrationError(`registerModel: schema is required for model "${name}"`);
  }

  const existing = mongoose.models[name] as Model<InferSchemaType<TSchema>> | undefined;
  if (existing) {
    if (existing.schema !== schema) {
      throw new ModelRegistrationError(
        `Model "${name}" is already registered with a different schema. ` +
          "Model names must be unique across modules.",
      );
    }
    if (collection && existing.collection.collectionName !== collection) {
      throw new ModelRegistrationError(
        `Model "${name}" is already registered for collection "${existing.collection.collectionName}"`,
      );
    }
    return existing;
  }

  return mongoose.model(name, schema, collection) as unknown as Model<InferSchemaType<TSchema>>;
}

/**
 * Returns a previously registered model, or undefined if not yet loaded.
 */
export function getRegisteredModel(name: string): Model<unknown> | undefined {
  return mongoose.models[name] as Model<unknown> | undefined;
}

/**
 * Snapshot of model names currently on the default mongoose connection.
 */
export function listRegisteredModels(): string[] {
  return Object.keys(mongoose.models);
}
