import { prisma } from "../db/prisma.js";

export async function createTicket({ tenantId, from, subject, body, priority, category, dueDate }) {
  return prisma.ticket.create({
    data: {
      tenantId,
      fromEmail: from,
      subject,
      body,
      status: "open",
      priority:  priority  ?? "normal",
      category:  category  ?? "general",
      dueDate:   dueDate   ?? null,
    },
  });
}
