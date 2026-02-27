import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export const emailQueue = new Queue("processEmail", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
