import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// GET /api/vault/[id] — get single vault entry by id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "vault";

  let result;

  switch (type) {
    case "argument":
      result = await sql`
        SELECT a.id, a.org_id, a.submission_id, a.content, a.status,
               a.survival_count, a.approved_at, a.created_at,
               u.username AS submitted_by_username, u.display_name AS submitted_by_display_name
        FROM arguments a
        LEFT JOIN users u ON u.id = a.submitted_by
        WHERE a.id = ${id}
      `;
      break;
    case "belief":
      result = await sql`
        SELECT b.id, b.org_id, b.submission_id, b.content, b.status,
               b.survival_count, b.approved_at, b.created_at,
               u.username AS submitted_by_username, u.display_name AS submitted_by_display_name
        FROM beliefs b
        LEFT JOIN users u ON u.id = b.submitted_by
        WHERE b.id = ${id}
      `;
      break;
    case "translation":
      result = await sql`
        SELECT t.id, t.org_id, t.submission_id, t.original_text, t.translated_text,
               t.translation_type, t.status, t.survival_count, t.approved_at, t.created_at,
               u.username AS submitted_by_username, u.display_name AS submitted_by_display_name
        FROM translations t
        LEFT JOIN users u ON u.id = t.submitted_by
        WHERE t.id = ${id}
      `;
      break;
    default:
      result = await sql`
        SELECT v.id, v.org_id, v.submission_id, v.assertion, v.evidence, v.status,
               v.survival_count, v.approved_at, v.created_at,
               u.username AS submitted_by_username, u.display_name AS submitted_by_display_name
        FROM vault_entries v
        LEFT JOIN users u ON u.id = v.submitted_by
        WHERE v.id = ${id}
      `;
      break;
  }

  if (result.rows.length === 0) {
    return err("Entry not found", 404);
  }

  const entry = result.rows[0];
  return ok({
    ...entry,
    submitted_by_username: entry.submitted_by_username || "unknown",
    submitted_by_display_name: entry.submitted_by_display_name || "",
  });
}
