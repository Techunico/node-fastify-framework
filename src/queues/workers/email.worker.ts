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