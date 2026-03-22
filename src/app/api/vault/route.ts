import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-utils";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";
import { slugify } from "@/lib/slugify";

// GET /api/vault — list vault entries (filterable by type)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const orgIds = searchParams.get("orgIds"); // comma-separated list of org IDs
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
               u.username AS submitted_by_username,
               o.name AS org_name
        FROM arguments a
        LEFT JOIN users u ON u.id = a.submitted_by
        LEFT JOIN organizations o ON o.id = a.org_id
        WHERE 1=1
      `;
      break;
    case "belief":
      query = `
        SELECT b.id, b.org_id, b.submission_id, b.content, b.status,
               b.survival_count, b.approved_at, b.created_at,
               u.username AS submitted_by_username,
               o.name AS org_name
        FROM beliefs b
        LEFT JOIN users u ON u.id = b.submitted_by
        LEFT JOIN organizations o ON o.id = b.org_id
        WHERE 1=1
      `;
      break;
    case "translation":
      query = `
        SELECT t.id, t.org_id, t.submission_id, t.original_text, t.translated_text,
               t.translation_type, t.status, t.survival_count, t.approved_at, t.created_at,
               u.username AS submitted_by_username,
               o.name AS org_name
        FROM translations t
        LEFT JOIN users u ON u.id = t.submitted_by
        LEFT JOIN organizations o ON o.id = t.org_id
        WHERE 1=1
      `;
      break;
    default: // vault
      query = `
        SELECT v.id, v.org_id, v.submission_id, v.assertion, v.evidence, v.status,
               v.survival_count, v.approved_at, v.created_at,
               u.username AS submitted_by_username,
               o.name AS org_name
        FROM vault_entries v
        LEFT JOIN users u ON u.id = v.submitted_by
        LEFT JOIN organizations o ON o.id = v.org_id
        WHERE 1=1
      `;
      break;
  }

  if (orgId) {
    query += ` AND org_id = $${paramIndex++}`;
    params.push(orgId);
  } else if (orgIds) {
    const ids = orgIds.split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${paramIndex + i}`).join(", ");
      paramIndex += ids.length;
      query += ` AND org_id IN (${placeholders})`;
      params.push(...ids);
    }
  }
  if (status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  const entries = result.rows.map((row: Record<string, unknown>) => ({
    ...row,
    submitted_by_username: row.submitted_by_username || "unknown",
    org_name: row.org_name || "Unknown Org",
  }));

  return ok({
    entries,
    type,
    limit,
    offset,
  });
}

// POST /api/vault — create a vault entry (supports single orgId or multiple orgIds)
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { orgId, orgIds, type, submissionId } = body;

  // Support single orgId or array of orgIds
  const targetOrgIds: string[] = orgIds && Array.isArray(orgIds) && orgIds.length > 0
    ? orgIds
    : orgId ? [orgId] : [];

  if (targetOrgIds.length === 0) {
    return err("orgId or orgIds is required");
  }

  // If submissionId is provided, verify the submission exists and belongs to this user
  if (submissionId) {
    const sub = await sql`
      SELECT id FROM submissions WHERE id = ${submissionId} AND submitted_by = ${session.sub}
    `;
    if (sub.rows.length === 0) {
      return err("Invalid submission ID");
    }
  }

  const entryType = type || "vault";

  // Validate inputs before starting the transaction
  switch (entryType) {
    case "argument":
    case "belief": {
      const { content } = body;
      if (!content) return err(`content is required for ${entryType}s`);
      const fieldErr = validateFields([["content", content, MAX_LENGTHS.vault_content]]);
      if (fieldErr) return err(fieldErr);
      break;
    }
    case "translation": {
      const { original, translated, translationType } = body;
      if (!original || !translated || !translationType) {
        return err("original, translated, and translationType are required for translations");
      }
      const transErr = validateFields([
        ["original", original, MAX_LENGTHS.translation_text],
        ["translated", translated, MAX_LENGTHS.translation_text],
      ]);
      if (transErr) return err(transErr);
      break;
    }
    default: {
      const { assertion, evidence } = body;
      if (!assertion || !evidence) {
        return err("assertion and evidence are required for vault entries");
      }
      const vaultErr = validateFields([
        ["assertion", assertion, MAX_LENGTHS.vault_assertion],
        ["evidence", evidence, MAX_LENGTHS.vault_evidence],
      ]);
      if (vaultErr) return err(vaultErr);
      break;
    }
  }

  try {
    const results = await withTransaction(async (client) => {
      const txResults: unknown[] = [];

      for (const targetOrgId of targetOrgIds) {
        switch (entryType) {
          case "argument": {
            const result = await client.query(
              `INSERT INTO arguments (org_id, submitted_by, content, submission_id)
               VALUES ($1, $2, $3, $4)
               RETURNING id, org_id, content, status, submission_id, created_at`,
              [targetOrgId, session.sub, body.content, submissionId || null]
            );
            txResults.push(result.rows[0]);
            break;
          }
          case "belief": {
            const result = await client.query(
              `INSERT INTO beliefs (org_id, submitted_by, content, submission_id)
               VALUES ($1, $2, $3, $4)
               RETURNING id, org_id, content, status, submission_id, created_at`,
              [targetOrgId, session.sub, body.content, submissionId || null]
            );
            txResults.push(result.rows[0]);
            break;
          }
          case "translation": {
            const result = await client.query(
              `INSERT INTO translations (org_id, submitted_by, original_text, translated_text, translation_type, submission_id)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, org_id, original_text, translated_text, translation_type, status, submission_id, created_at`,
              [targetOrgId, session.sub, body.original, body.translated, body.translationType, submissionId || null]
            );
            txResults.push(result.rows[0]);
            break;
          }
          default: {
            const result = await client.query(
              `INSERT INTO vault_entries (org_id, submitted_by, assertion, evidence, submission_id)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id, org_id, assertion, evidence, status, submission_id, created_at`,
              [targetOrgId, session.sub, body.assertion, body.evidence, submissionId || null]
            );
            const vaultSlug = slugify(body.assertion, result.rows[0].id);
            await client.query("UPDATE vault_entries SET slug = $1 WHERE id = $2", [vaultSlug, result.rows[0].id]);
            result.rows[0].slug = vaultSlug;
            txResults.push(result.rows[0]);
            break;
          }
        }
      }

      return txResults;
    });

    // Return single entry for backward compatibility, or array for multi-org
    return ok(results.length === 1 ? results[0] : { entries: results, count: results.length }, 201);
  } catch (error) {
    return serverError("POST /api/vault", error);
  }
}
