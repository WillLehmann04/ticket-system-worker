import "dotenv/config";
import express from "express";
import busboy from "busboy";
import { emailQueue } from "./src/queue/queue.js";
import { logger } from "./src/utils/logger.js";
import "./src/worker/emailProcessor.js";

const app = express();

function parseMultipart(req, res, next) {
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("multipart/form-data")) return next();
  const fields = {};
  const bb = busboy({ headers: req.headers });
  bb.on("field", (name, val) => { fields[name] = val; });
  bb.on("finish", () => { req.body = fields; next(); });
  bb.on("error", next);
  req.pipe(bb);
}

// Mailgun sends inbound email as multipart/form-data
app.post("/inbound", parseMultipart, async (req, res) => {
  try {
    const { sender, from, subject, recipient } = req.body || {};
    const text = (req.body || {})["body-plain"] || (req.body || {}).text || "";

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
