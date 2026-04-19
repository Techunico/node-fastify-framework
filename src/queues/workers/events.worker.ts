import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { loadConfig } from '../../bootstrap/config';

const config = loadConfig();

const connection = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
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