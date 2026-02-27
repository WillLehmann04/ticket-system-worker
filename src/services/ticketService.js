import { prisma } from "../db/prisma.js";

export async function createTicket({ tenantId, from, subject, body }) {
  return prisma.ticket.create({
    data: {
      tenantId,
      fromEmail: from,
      subject,
      body,
      status: "open",
    },
  });
}
