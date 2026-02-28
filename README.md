# ticket-system-worker

Receives inbound emails via Mailgun, parses them, and creates support tickets in a PostgreSQL database.

---

## How it works

Mailgun forwards inbound emails to the `/inbound` HTTP endpoint as `multipart/form-data`. The inbound server extracts the relevant fields, enqueues a job in Redis via BullMQ, and returns immediately. A separate worker process picks up the job, runs the email through the parser, and writes a ticket record to the database.

The two processes run as separate Heroku dynos: `web` for the inbound server and `worker` for the BullMQ worker.

---

## Features

### Inbound webhook

- Accepts `POST /inbound` from Mailgun's inbound routing
- Parses `multipart/form-data` without buffering the full body
- Derives the tenant from the recipient address: `<tenant_id>@tickets.yourdomain.com`
- Falls back to `"default"` if no recipient is present
- Returns `{ queued: true, jobId }` on success
- Exposes `GET /health` for uptime checks

### Job queue

- BullMQ queue named `processEmail` backed by Redis
- Each job retries up to 3 times on failure with exponential backoff (starting at 5 seconds)
- Completed jobs are retained up to 100 records; failed jobs up to 500
- Worker runs with concurrency of 5

### Email parsing

All parsing is pure JavaScript with no external API calls.

**HTML stripping**

Strips `<style>` and `<script>` blocks entirely, removes all remaining HTML tags, decodes common entities (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`), and collapses extra whitespace. Runs before any other processing so HTML emails from Outlook or Gmail do not pollute results.

**Noise stripping**

Removes quoted reply lines (lines beginning with `>`), strips everything from the signature delimiter (`--`) onward, and cuts off common mobile footers such as "Sent from my iPhone" and "Get Outlook for Android".

**Priority detection**

Classifies each ticket as `high`, `normal`, or `low`.

- Subject line is checked before the body, since it carries stronger intent
- A non-negated signal word in the subject resolves priority immediately without inspecting the body
- Negation is detected by looking at the three words immediately before each signal word, so phrases like "this is NOT urgent" do not incorrectly trigger high priority
- High priority signals: `urgent`, `asap`, `emergency`, `critical`, `blocking`, `p0`, `p1`, and others
- Low priority signals: `when you can`, `no rush`, `low priority`, `minor`, `p3`, and others

**Category detection**

Classifies each ticket into one of: `bug`, `improvement`, `feature`, `billing`, `account`, or `general`.

Uses a scoring pass rather than first-match. Each matching term adds 1 point for a body match and 3 points for a subject match. The category with the highest total score wins. If no category scores above zero the ticket falls back to `general`. Subject weighting means "billing error" in the subject correctly scores billing even when bug terms are present.

**Keyword extraction**

Extracts the top 8 words by frequency after lowercasing, removing punctuation, and filtering a stop-word list. The result is logged alongside the parsed priority and category.

**Due date extraction**

Looks for explicit due-date language near phrases like "due by", "deadline", "no later than", "needed by", and common shorthand like "EOD", "COB", "end of week". Uses chrono-node to parse the extracted text into a `Date`. Only phrases near a due-date keyword are considered to avoid false positives from dates mentioned in email history.

### Ticket storage

Tickets are written to PostgreSQL (Supabase) via Prisma.

| Field | Description |
|---|---|
| `id` | CUID, primary key |
| `tenantId` | Derived from recipient address local part |
| `fromEmail` | Sender address |
| `subject` | Email subject |
| `body` | Full plain-text body |
| `status` | Always `open` on creation |
| `priority` | `high`, `normal`, or `low` |
| `category` | `bug`, `improvement`, `feature`, `billing`, `account`, or `general` |
| `dueDate` | Parsed due date or null |
| `createdAt` / `updatedAt` | Managed by Prisma |

A database index is maintained on `tenantId` for fast per-tenant queries.

---

## Environment variables

| Variable | Description |
|---|---|
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis password (optional) |
| `SUPABASE_DB_URL` | PostgreSQL connection string |
| `PORT` | Port for the inbound server (default 3000) |

---

## Project structure

```
inbound.js                      Express server, Mailgun webhook receiver
worker.js                       BullMQ worker entry point
src/
  queue/
    queue.js                    BullMQ queue definition and job options
    redis.js                    Redis connection config
  worker/
    emailProcessor.js           Job handler: parse email, create ticket
  services/
    ticketService.js            Prisma ticket.create wrapper
  utils/
    emailParser.js              HTML stripping, noise removal, priority/category/due-date detection
    logger.js                   Structured logger
  db/
    prisma.js                   Prisma client singleton
prisma/
  schema.prisma                 Ticket model definition
```
