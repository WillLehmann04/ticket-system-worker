import "dotenv/config";
import "./src/worker/emailProcessor.js";
import { logger } from "./src/utils/logger.js";

logger.info("Worker dyno running...");
