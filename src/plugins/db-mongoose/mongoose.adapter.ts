import mongoose from "mongoose";

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getClient(): unknown;
  isConnected?(): boolean;
}

type AdapterLogger = {
  info: (obj: object | string, msg?: string) => void;
  warn: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  debug?: (obj: object | string, msg?: string) => void;
};

/**
 * Single shared Mongoose connection for the process.
 * Uses mongoose's default connection (not createConnection) so models share one pool.
 */
export class MongooseAdapter implements DatabaseAdapter {
  private listenersAttached = false;
  private logger: AdapterLogger | null = null;

  setLogger(logger: AdapterLogger) {
    this.logger = logger;
  }

  private log(
    level: "info" | "warn" | "error" | "debug",
    obj: object,
    msg: string,
  ) {
    if (this.logger?.[level]) {
      this.logger[level]!(obj, msg);
      return;
    }
    // Fallback before Fastify logger is available
    const line = `[mongo] ${msg} ${JSON.stringify(obj)}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  private attachLifecycleListeners() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    const conn = mongoose.connection;

    conn.on("connected", () => {
      this.log(
        "info",
        { readyState: conn.readyState, host: conn.host, name: conn.name },
        "MongoDB connected",
      );
    });

    conn.on("disconnected", () => {
      this.log(
        "warn",
        { readyState: conn.readyState },
        "MongoDB disconnected",
      );
    });

    conn.on("reconnected", () => {
      this.log(
        "info",
        { readyState: conn.readyState, host: conn.host },
        "MongoDB reconnected",
      );
    });

    conn.on("error", (err) => {
      // Never rethrow — process must keep running; drivers will soft-fail writes
      this.log(
        "error",
        {
          err:
            err instanceof Error
              ? { message: err.message, name: err.name }
              : err,
          readyState: conn.readyState,
        },
        "MongoDB connection error",
      );
    });

    conn.on("close", () => {
      this.log(
        "info",
        { readyState: conn.readyState },
        "MongoDB connection closed",
      );
    });
  }

  async connect() {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined");
    }

    this.attachLifecycleListeners();

    // readyState: 0=disconnected 1=connected 2=connecting 3=disconnecting
    if (mongoose.connection.readyState === 1) {
      this.log(
        "info",
        { readyState: 1 },
        "MongoDB already connected — reusing single connection",
      );
      return;
    }

    if (mongoose.connection.readyState === 2) {
      // Wait for in-flight connect instead of opening a second one
      await new Promise<void>((resolve, reject) => {
        const onConnected = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          mongoose.connection.off("connected", onConnected);
          mongoose.connection.off("error", onError);
        };
        mongoose.connection.once("connected", onConnected);
        mongoose.connection.once("error", onError);
      });
      return;
    }

    this.log(
      "info",
      { uriHost: redactUri(process.env.MONGO_URI) },
      "Connecting to MongoDB…",
    );

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Single default connection pool (do not call createConnection elsewhere)
      maxPoolSize: 20,
    });
  }

  async disconnect() {
    if (mongoose.connection.readyState === 0) {
      return;
    }

    this.log(
      "info",
      { readyState: mongoose.connection.readyState },
      "Disconnecting MongoDB…",
    );

    try {
      await mongoose.disconnect();
    } catch (err) {
      this.log(
        "error",
        {
          err: err instanceof Error ? err.message : err,
        },
        "MongoDB disconnect error (ignored)",
      );
    }
  }

  getClient() {
    return mongoose;
  }

  isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}

function redactUri(uri: string): string {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
  } catch {
    return "[redacted]";
  }
}
