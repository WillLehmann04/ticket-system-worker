import "dotenv/config";
import express from "express";
import multer from "multer";
import { emailQueue } from "./src/queue/queue.js";
import { logger } from "./src/utils/logger.js";
import "./src/worker/emailProcessor.js";

const app = express();
const upload = multer();

// Mailgun sends inbound email as multipart/form-data
app.post("/inbound", upload.none(), async (req, res) => {
  try {
    const { sender, from, subject, recipient } = req.body;
    const text = req.body["body-plain"] || req.body.text || "";

    // Derive tenant_id from the recipient address.
    // Convention: <tenant_id>@tickets.yourdomain.com
    const recipientLocal = (recipient || "").split("@")[0];
    const tenant_id = recipientLocal || "default";

    if (!sender && !from) {
      logger.warn("Inbound webhook missing sender", { body: req.body });
      return res.status(400).json({ error: "Missing sender" });
    }

    const job = await emailQueue.add("inbound-email", {
      tenant_id,
      from: sender || from,
      subject: subject || "(no subject)",
      text,
    });

    logger.info("Email queued", { jobId: job.id, tenant_id, from: sender || from });

    res.status(200).json({ queued: true, jobId: job.id });
  } catch (err) {
    logger.error("Failed to queue inbound email", { error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Inbound dyno listening on port ${PORT}`);
});
