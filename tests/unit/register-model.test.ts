import path from "path";
import mongoose, { Schema } from "mongoose";
import { listRegisteredModels, ModelRegistrationError, registerModel } from "@/plugins/db-mongoose/register-model";
import { registerModels } from "@/plugins/db-mongoose/model-loader";

describe("registerModel", () => {
  afterEach(() => {
    for (const name of Object.keys(mongoose.models)) {
      if (name.startsWith("Test")) mongoose.deleteModel(name);
    }
  });

  it("returns the existing model when the same schema is registered again", () => {
    const schema = new Schema({ email: String });
    const first = registerModel("TestUser", schema);
    expect(registerModel("TestUser", schema)).toBe(first);
  });

  it("throws when a different schema is registered under the same name", () => {
    registerModel("TestUser", new Schema({ email: String }));
    expect(() => registerModel("TestUser", new Schema({ name: String }))).toThrow(ModelRegistrationError);
    expect(() => registerModel("TestUser", new Schema({ name: String }))).toThrow(/different schema/);
  });

  it("throws when the same name targets a different collection", () => {
    const schema = new Schema({ email: String });
    registerModel("TestAccount", schema, "accounts");
    expect(() => registerModel("TestAccount", schema, "people")).toThrow(/collection/);
  });

  it("validates its arguments", () => {
    expect(() => registerModel("", new Schema({}))).toThrow(/name is required/);
    expect(() => registerModel("TestX", undefined as unknown as Schema)).toThrow(/schema is required/);
  });
});

describe("registerModels (loader)", () => {
  it("loads *.model.ts files from extra directories and is safe to run twice", async () => {
    const dir = path.join(__dirname, "..", "fixtures", "models");
    const first = await registerModels({ extraDirs: [dir], logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() } });
    expect(first).toContain("FixtureWidget");

    const second = await registerModels({ extraDirs: [dir], logger: { info: jest.fn(), warn: jest.fn() } });
    expect(second).toContain("FixtureWidget");
    expect(listRegisteredModels().filter((name) => name === "FixtureWidget")).toHaveLength(1);
  });

  it("fails on a missing extra directory only when soft mode is disabled", async () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    await expect(registerModels({ extraDirs: ["/does/not/exist"], logger })).resolves.toBeDefined();
    expect(logger.warn).toHaveBeenCalled();
    await expect(registerModels({ extraDirs: ["/does/not/exist"], logger, softMissingRoots: false })).rejects.toThrow(/not found/);
  });
});
