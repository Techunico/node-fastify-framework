export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getClient?(): unknown;
  isConnected?(): boolean;
}
