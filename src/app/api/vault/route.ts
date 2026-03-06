import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/vault — list vault entries (filterable by type)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const status = searchParams.get("status");
  const type = searchParams.get("type") || "vault";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let query: string;
  const params: unknown[] = [];
  let paramIndex = 1;

  switch (type) {
    case "argument":
      query = `
        SELECT a.id, a.org_id, a.submission_id, a.content, a.status,
               a.survival_count, a.approved_at, a.created_at,
               u.username AS submitted_by_username
        FROM arguments a
        JOIN users u ON u.id = a.submitted_by
        WHERE 1=1
      `;
      break;
    case "belief":
      query = `
        SELECT b.id, b.org_id, b.submission_id, b.content, b.status,
               b.survival_count, b.approved_at, b.created_at,
               u.username AS submitted_by_username
        FROM beliefs b
        JOIN users u ON u.id = b.submitted_by
        WHERE 1=1
      `;
      break;
    case "translation":
      query = `
        SELECT t.id, t.org_id, t.submission_id, t.original_text, t.translated_text,
               t.translation_type, t.status, t.survival_count, t.approved_at, t.created_at,
               u.username AS submitted_by_username
        FROM translations t
        JOIN users u ON u.id = t.submitted_by
        WHERE 1=1
      `;
      break;
    default: // vault
      query = `
        SELECT v.id, v.org_id, v.submission_id, v.assertion, v.evidence, v.status,
               v.survival_count, v.approved_at, v.created_at,
               u.username AS submitted_by_username
        FROM vault_entries v
        JOIN users u ON u.id = v.submitted_by
        WHERE 1=1
      `;
      break;
  }

  if (orgId) {
    query += ` AND org_id = $${paramIndex++}`;
    params.push(orgId);
  }
  if (status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  return ok({
    entries: result.rows,
    type,
    limit,
    offset,
  });
}

// POST /api/vault — create a vault entry
export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const body = await request.json();
  const { orgId, type } = body;

  if (!orgId) {
    return err("orgId is required");
  }

  const entryType = type || "vault";

  switch (entryType) {
    case "argument": {
      const { content } = body;
      if (!content) return err("content is required for arguments");
      const result = await sql`
        INSERT INTO arguments (org_id, submitted_by, content)
        VALUES (${orgId}, ${session.sub}, ${content})
        RETURNING id, org_id, content, status, created_at
      `;
      return ok(result.rows[0], 201);
    }
    case "belief": {
      const { content } = body;
      if (!content) return err("content is required for beliefs");
      const result = await sql`
        INSERT INTO beliefs (org_id, submitted_by, content)
        VALUES (${orgId}, ${session.sub}, ${content})
        RETURNING id, org_id, content, status, created_at
      `;
      return ok(result.rows[0], 201);
    }
    case "translation": {
      const { original, translated, translationType } = body;
      if (!original || !translated || !translationType) {
        return err("original, translated, and translationType are required for translations");
      }
      const result = await sql`
        INSERT INTO translations (org_id, submitted_by, original_text, translated_text, translation_type)
        VALUES (${orgId}, ${session.sub}, ${original}, ${translated}, ${translationType})
        RETURNING id, org_id, original_text, translated_text, translation_type, status, created_at
      `;
      return ok(result.rows[0], 201);
    }
    default: {
      // vault
      const { assertion, evidence } = body;
      if (!assertion || !evidence) {
        return err("assertion and evidence are required for vault entries");
      }
      const result = await sql`
        INSERT INTO vault_entries (org_id, submitted_by, assertion, evidence)
        VALUES (${orgId}, ${session.sub}, ${assertion}, ${evidence})
        RETURNING id, org_id, assertion, evidence, status, created_at
      `;
      return ok(result.rows[0], 201);
    }
  }
}
