import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";
import { slugify } from "@/lib/slugify";
import { logError } from "@/lib/error-logger";
import { ensureSlugsExist } from "@/lib/ensure-schema";

const SOURCE_FILE = "src/app/api/stories/route.ts";

// GET /api/stories — list stories (filterable, searchable)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = `
    SELECT
      st.id, st.title, st.description, st.status, st.org_id,
      st.created_at, st.approved_at, st.resolved_at,
      u.username AS submitted_by,
      o.name AS org_name,
      (SELECT COUNT(*) FROM story_submissions ss WHERE ss.story_id = st.id AND ss.status = 'approved') AS submission_count
    FROM stories st
    LEFT JOIN users u ON u.id = st.submitted_by
    LEFT JOIN organizations o ON o.id = st.org_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (orgId) {
    query += ` AND st.org_id = $${paramIndex++}`;
    params.push(orgId);
  }
  if (status) {
    query += ` AND st.status = $${paramIndex++}`;
    params.push(status);
  }
  if (search && search.trim()) {
    query += ` AND to_tsvector('english', st.title || ' ' || st.description) @@ plainto_tsquery('english', $${paramIndex++})`;
    params.push(search.trim());
  }

  query += ` ORDER BY st.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  return ok({
    stories: result.rows,
    limit,
    offset,
  });
}

// POST /api/stories — create a story proposal
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { title, description, orgId } = body;

  // Validate required fields
  if (!title || !description || !orgId) {
    return err("title, description, and orgId are required");
  }

  // Validate lengths
  const lengthError = validateFields([
    ["title", title, MAX_LENGTHS.story_title],
    ["description", description, MAX_LENGTHS.story_description],
  ]);
  if (lengthError) return err(lengthError);

  // Minimum lengths for substantive content
  if (title.trim().length < 10) {
    return err("Title must be at least 10 characters");
  }
  if (description.trim().length < 50) {
    return err("Description must be at least 50 characters");
  }

  // Verify membership
  const membership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${orgId} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (membership.rows.length === 0) {
    return err("You must be a member of this assembly to create a story");
  }

  // Rate limit: max 3 story proposals per user per day
  const recentCount = await sql`
    SELECT COUNT(*) as count FROM stories
    WHERE submitted_by = ${session.sub} AND created_at > now() - interval '1 day'
  `;
  if (parseInt(recentCount.rows[0].count) >= 3) {
    return err("You can create at most 3 story proposals per day");
  }

  const wildWest = await isWildWestMode();

  // Check member count for initial status
  const memberCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE org_id = ${orgId} AND is_active = TRUE
  `;
  const count = parseInt(memberCount.rows[0].count);
  const initialStatus = count < (wildWest ? 2 : 5) ? "pending_jury" : "pending_review";

  // Ensure slug columns exist (runtime migration 006)
  await ensureSlugsExist();

  // Create story in transaction
  const client = await sql.connect();
  let story: Record<string, unknown>;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO stories (title, description, status, submitted_by, org_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, status, created_at`,
      [title.trim(), description.trim(), initialStatus, session.sub, orgId]
    );
    story = result.rows[0];

    // Set SEO-friendly slug
    const storySlug = slugify(title.trim(), story.id as string);
    await client.query("UPDATE stories SET slug = $1 WHERE id = $2", [storySlug, story.id]);
    story.slug = storySlug;

    // Audit log
    await client.query(
      "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)",
      ["Story proposal filed", session.sub, orgId, "story", story.id]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Story creation transaction failed:", e);
    await logError({
      userId: session.sub,
      sessionInfo: session.username,
      errorType: "transaction_error",
      error: e instanceof Error ? e : String(e),
      apiRoute: "/api/stories",
      sourceFile: SOURCE_FILE,
      sourceFunction: "POST handler",
      lineContext: "Story creation transaction",
      entityType: "story",
      httpMethod: "POST",
      httpStatus: 500,
      requestUrl: request.url,
      requestBody: { title, orgId },
    });
    return err(`Failed to create story: ${e instanceof Error ? e.message : String(e)}`, 500);
  } finally {
    client.release();
  }

  // Jury assignment (if enough members)
  if (initialStatus === "pending_review") {
    const jurySize = wildWest ? 1 : getJurySize(count);
    const poolSize = wildWest ? count : jurySize * JURY_POOL_MULTIPLIER;

    const juryClient = await sql.connect();
    try {
      await juryClient.query("BEGIN");

      await juryClient.query(
        "UPDATE stories SET jury_seats = $1 WHERE id = $2",
        [jurySize, story.id]
      );

      const pool = await juryClient.query(
        `SELECT om.user_id
         FROM organization_members om
         WHERE om.org_id = $1
           AND om.is_active = TRUE
           AND om.user_id != $2
         ORDER BY RANDOM()
         LIMIT $3`,
        [orgId, session.sub, poolSize]
      );

      for (const juror of pool.rows) {
        await juryClient.query(
          `INSERT INTO jury_assignments (story_id, user_id, role, in_pool, accepted)
           VALUES ($1, $2, 'in_group', TRUE, FALSE)
           ON CONFLICT DO NOTHING`,
          [story.id, juror.user_id]
        );
      }

      await juryClient.query("COMMIT");
    } catch (e) {
      await juryClient.query("ROLLBACK");
      console.error("Story jury assignment failed:", e);
      await logError({
        userId: session.sub,
        sessionInfo: session.username,
        errorType: "transaction_error",
        error: e instanceof Error ? e : String(e),
        apiRoute: "/api/stories",
        sourceFile: SOURCE_FILE,
        sourceFunction: "POST handler — jury assignment",
        lineContext: `Jury assignment for story ${story.id}`,
        entityType: "story",
        entityId: story.id as string,
        httpMethod: "POST",
        httpStatus: 500,
        requestUrl: request.url,
      });
      return err(`Story created but jury assignment failed: ${e instanceof Error ? e.message : String(e)}`, 500);
    } finally {
      juryClient.release();
    }
  }

  return ok(story, 201);
}
