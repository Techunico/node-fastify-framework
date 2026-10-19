/**
 * Contract every database plugin decorates as `app.db`.
 *
 * `getClient()` returns the driver-specific client (PrismaClient, mongoose);
 * database-agnostic code should only use `ping()`, `isConnected()` and the
 * lifecycle methods.
 */
export interface DatabaseAdapter<TClient = unknown> {
  readonly provider: "postgresql" | "mongodb";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Resolves when the database answers a round-trip; rejects otherwise. */
  ping(): Promise<void>;
  getClient(): TClient;
  isConnected?(): boolean;
}
