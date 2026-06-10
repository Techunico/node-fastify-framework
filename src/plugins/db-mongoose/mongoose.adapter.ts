import mongoose from "mongoose";

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getClient(): unknown;
}

export class MongooseAdapter implements DatabaseAdapter {
  async connect() {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined");
    }

    await mongoose.connect(process.env.MONGO_URI);
  }

  async disconnect() {
    await mongoose.disconnect();
  }

  getClient() {
    return mongoose;
  }
}