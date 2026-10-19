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
  'email',
  async (job) => {
    switch (job.name) {
      case 'send-welcome-email':
        console.log('Sending email to:', job.data.to);
        break;

      default:
        console.warn('Unknown job:', job.name);
    }
  },
  { connection }
);