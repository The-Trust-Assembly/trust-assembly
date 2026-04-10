import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-utils";

export const fetchCache = "force-no-store";

// POST /api/users/me/devices — Register a push notification device token
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUserFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { deviceToken, platform } = body;
    if (!deviceToken || typeof deviceToken !== "string") return err("deviceToken is required");
    if (!platform || !["ios", "android", "web"].includes(platform)) return err("platform must be ios, android, or web");

    // Upsert: if this device token already exists for this user, update it
    await sql`
      INSERT INTO user_devices (user_id, device_token, platform)
      VALUES (${session.sub}, ${deviceToken}, ${platform})
      ON CONFLICT (device_token) DO UPDATE SET
        user_id = ${session.sub},
        platform = ${platform},
        updated_at = now()
    `;

    return ok({ success: true });
  } catch (e) {
    return serverError("POST /api/users/me/devices", e);
  }
}

// DELETE /api/users/me/devices — Unregister a device token (e.g., on logout)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getCurrentUserFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { deviceToken } = body;
    if (!deviceToken) return err("deviceToken is required");

    await sql`
      DELETE FROM user_devices
      WHERE user_id = ${session.sub} AND device_token = ${deviceToken}
    `;

    return ok({ success: true });
  } catch (e) {
    return serverError("DELETE /api/users/me/devices", e);
  }
}

// GET /api/users/me/devices — List registered devices (for debugging)
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUserFromRequest(request);
    if (!session) return unauthorized();

    const result = await sql`
      SELECT id, platform, created_at, updated_at
      FROM user_devices
      WHERE user_id = ${session.sub}
      ORDER BY updated_at DESC
    `;

    return ok({ devices: result.rows });
  } catch (e) {
    return serverError("GET /api/users/me/devices", e);
  }
}
