import { Queue } from 'bullmq';
import { redisConnection } from './connection';

/**
 * BullMQ Queue instance responsible for scheduling and managing video analysis tasks.
 * Retains failed jobs for offline diagnostics while auto-cleaning successful ones.
 */
export const videoQueue = new Queue('video-analysis', {
   connection: redisConnection,
   defaultJobOptions: {
      attempts: 3,
      backoff: {
         type: 'exponential',
         delay: 5000,
      },
      removeOnComplete: true, // Auto-cleanup successful jobs from Redis memory
      removeOnFail: {
         count: 100 // Retain the last 100 failed jobs for diagnostics without leaking memory
      }
   },
});