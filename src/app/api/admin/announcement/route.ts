import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

// GET /api/admin/announcement
// Returns the current admin announcement (public endpoint).
export async function GET() {
  try {
    const result = await sql`
      SELECT value, updated_at FROM kv_store WHERE key = 'admin_announcement'
    `;
    if (result.rows.length === 0 || !result.rows[0].value) {
      return ok({ announcement: null });
    }
    return ok({
      announcement: result.rows[0].value,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (e) {
    return serverError("/api/admin/announcement", e);
  }
}

// POST /api/admin/announcement
// Updates the admin announcement. Requires admin authentication.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json();
    const text = (body.text ?? "").trim();

    if (text.length > 2000) {
      return err("Announcement must be 2000 characters or fewer");
    }

    if (text) {
      await sql`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES ('admin_announcement', ${text}, now())
        ON CONFLICT (key)
        DO UPDATE SET value = ${text}, updated_at = now()
      `;
    } else {
      // Clear the announcement
      await sql`
        DELETE FROM kv_store WHERE key = 'admin_announcement'
      `;
    }

    const action = text ? "Admin announcement updated" : "Admin announcement cleared";
    const meta = JSON.stringify({ textLength: text.length });
    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata)
      VALUES (${action}, ${admin.sub}, 'system', ${meta}::jsonb)
    `;

    return ok({ success: true, announcement: text || null });
  } catch (e) {
    return serverError("/api/admin/announcement", e);
  }
}
