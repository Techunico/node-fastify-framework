import { QueueService } from '../plugins/queue/queue.service';
import type { EventListener } from './event.types';
export class EventService {
  private listeners: Map<string, EventListener[]> = new Map();

  constructor(private queue: QueueService) {}

  register(listener: EventListener) {
    if (!this.listeners.has(listener.event)) {
      this.listeners.set(listener.event, []);
    }

    this.listeners.get(listener.event)!.push(listener);
  }

  async emit(event: string, payload: any) {
    const listeners = this.listeners.get(event) || [];

    for (const listener of listeners) {
      if (listener.async) {
        // send to queue
        await this.queue.add(
          'events',
          event,
          {
            event,
            payload,
          }
        );
      } else {
        // run immediately
        await listener.handler(payload);
      }
    }
  }
}