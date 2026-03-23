import { NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";
import { getNotificationsForUser, markAllNotificationsRead } from "@/lib/notifications-query";

// GET /api/notifications — shorthand for /api/users/me/notifications
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();
  return ok(await getNotificationsForUser(session.sub));
}

// PATCH /api/notifications — mark all as read
export async function PATCH(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();
  await markAllNotificationsRead(session.sub);
  return ok({ success: true });
}
