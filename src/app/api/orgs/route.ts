import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";
import { slugifyOrg } from "@/lib/slugify";
import { logError } from "@/lib/error-logger";


const SOURCE_FILE = "src/app/api/orgs/route.ts";

// GET /api/orgs — list all assemblies
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const result = await sql`
    SELECT
      o.id, o.name, o.description, o.charter, o.is_general_public,
      o.enrollment_mode, o.sponsors_required, o.created_at,
      u.username AS created_by,
      (SELECT COUNT(*) FROM organization_members om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count
    FROM organizations o
    LEFT JOIN users u ON u.id = o.created_by
    ORDER BY o.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = await sql`SELECT COUNT(*) as count FROM organizations`;

  const organizations = result.rows.map((row: Record<string, unknown>) => ({
    ...row,
    created_by: row.created_by || "unknown",
  }));

  return ok({
    organizations,
    total: parseInt(total.rows[0].count),
    limit,
    offset,
  });
}

// POST /api/orgs — create an assembly
export async function POST(request: NextRequest) {
  const requestUrl = request.url;
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { name, description, charter } = body;

  if (!name || name.trim().length < 3) {
    return err("Assembly name must be at least 3 characters");
  }

  const lengthError = validateFields([
    ["name", name, MAX_LENGTHS.org_name],
    ["description", description, MAX_LENGTHS.org_description],
    ["charter", charter, MAX_LENGTHS.org_charter],
  ]);
  if (lengthError) return err(lengthError);

  // Check org limit (max 12 per user)
  const orgCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE user_id = ${session.sub} AND is_active = TRUE
  `;
  if (parseInt(orgCount.rows[0].count) >= 12) {
    return err("Maximum of 12 assembly memberships reached");
  }

  // Check name uniqueness
  const existing = await sql`SELECT id FROM organizations WHERE name = ${name.trim()}`;
  if (existing.rows.length > 0) {
    return err("An assembly with this name already exists", 409);
  }

  // Create org with SEO-friendly slug — use real transaction via sql.connect()
  // The sql`` tagged template is stateless (neon HTTP driver), so each call hits
  // a different connection — BEGIN/COMMIT/ROLLBACK are no-ops across calls.
  const client = await sql.connect();
  try {
    const orgSlug = slugifyOrg(name.trim());
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO organizations (name, description, charter, created_by, slug)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, charter, enrollment_mode, slug, created_at`,
      [name.trim(), description || null, charter || null, session.sub, orgSlug]
    );

    const org = result.rows[0];

    // Add creator as founder member
    await client.query(
      `INSERT INTO organization_members (org_id, user_id, is_founder)
       VALUES ($1, $2, TRUE)`,
      [org.id, session.sub]
    );

    // Log to member history
    await client.query(
      `INSERT INTO organization_member_history (org_id, user_id, action)
       VALUES ($1, $2, 'joined')`,
      [org.id, session.sub]
    );

    await client.query("COMMIT");
    return ok(org, 201);
  } catch (error) {
    await client.query("ROLLBACK");
    await logError({
      userId: session.sub,
      sessionInfo: session.username,
      errorType: "transaction_error",
      error: error instanceof Error ? error : String(error),
      apiRoute: "/api/orgs",
      sourceFile: SOURCE_FILE,
      sourceFunction: "POST handler",
      lineContext: "Assembly creation (INSERT organization → INSERT org_member → INSERT member_history)",
      entityType: "organization",
      httpMethod: "POST",
      httpStatus: 500,
      requestUrl,
      requestBody: { name: name.trim() },
    });
    return err(`Failed to create assembly: ${error instanceof Error ? error.message : String(error)}`, 500);
  } finally {
    client.release();
  }
}
