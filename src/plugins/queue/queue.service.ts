import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export class QueueService {
  private queues: Map<string, Queue> = new Map();

  constructor(private redis: Redis) {}

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: this.redis,
      });

      this.queues.set(name, queue);
    }

    return this.queues.get(name)!;
  }

  async add(
    queueName: string,
    jobName: string,
    data: any,
    options?: {
      delay?: number;
      attempts?: number;
      removeOnComplete?: boolean;
    }
  ) {
    const queue = this.getQueue(queueName);

    await queue.add(jobName, data, {
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      removeOnComplete: options?.removeOnComplete ?? true,
    });
  }
}