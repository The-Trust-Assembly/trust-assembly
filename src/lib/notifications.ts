// Notification creation helper.
// Never throws — swallows errors like logError() so callers are never disrupted.

import { sql } from "@/lib/db";

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await sql`
      INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id)
      VALUES (${params.userId}, ${params.type}, ${params.title},
              ${params.body || null}, ${params.entityType || null}, ${params.entityId || null})
    `;
  } catch (e) {
    console.error("[notifications] Failed to create notification:", e);
  }
}
