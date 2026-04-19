export type EventHandler<T = any> = (payload: T) => Promise<void>;

export interface EventListener<T = any> {
  event: string;
  handler: EventHandler<T>;
  async?: boolean; // queue-based
}