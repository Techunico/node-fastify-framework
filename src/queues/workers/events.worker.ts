// Standalone worker process: load .env before configuration is read.
import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { loadConfig } from '../../config';
import { loadRedisConfig } from '../../plugins/redis/config';

const redisConfig = loadRedisConfig(loadConfig(process.env).source);

const connection = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
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