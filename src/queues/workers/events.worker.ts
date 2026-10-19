// Standalone worker process: load .env before configuration is read.
import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../config';

const connection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  // Required by BullMQ workers (blocking commands).
  maxRetriesPerRequest: null,
});

new Worker(
  'events',
  async (job) => {
    const { event, payload } = job.data;

    switch (event) {
      case 'user.created':
        console.log('Processing async event:', payload);
        break;
    }
  },
  { connection }
);