import { Worker } from "bullmq";
import { redisConnection } from "../queue/redis.js";
import { createTicket } from "../services/ticketService.js";
import { parseEmail } from "../utils/emailParser.js";
import { logger } from "../utils/logger.js";

export const emailWorker = new Worker(
  "processEmail",
  async (job) => {
    const { tenant_id, from, subject, text } = job.data;

    logger.info("Processing email job", { jobId: job.id, tenant_id, from, subject });

    const parsed = parseEmail({ subject, body: text });

    logger.info("Email parsed", {
      jobId:    job.id,
      priority: parsed.priority,
      category: parsed.category,
      dueDate:  parsed.dueDate,
      keywords: parsed.keywords.map((k) => k.word),
    });

    const ticket = await createTicket({
      tenantId: tenant_id,
      from,
      subject,
      body:     text,
      priority: parsed.priority,
      category: parsed.category,
      dueDate:  parsed.dueDate,
    });

    logger.info("Ticket created", { jobId: job.id, ticketId: ticket.id });

    return { ...ticket, parsed };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

emailWorker.on("completed", (job) => {
  logger.info("Job completed", { jobId: job.id });
});

emailWorker.on("failed", (job, err) => {
  logger.error("Job failed", { jobId: job.id, error: err.message });
});
