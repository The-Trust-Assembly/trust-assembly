import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// GET /api/data/orgs — returns ALL organizations keyed by ID
// with member username arrays, in the format the v5 SPA expects.
// Serves sG(SK.ORGS) reads from the relational database.
export async function GET() {
  try {
  const result = await sql`
    SELECT
      o.id, o.name, o.description, o.charter, o.avatar, o.is_general_public,
      o.enrollment_mode, o.sponsors_required,
      o.cross_group_deception_findings, o.cassandra_wins,
      o.created_at,
      creator.username AS created_by
    FROM organizations o
    LEFT JOIN users creator ON creator.id = o.created_by
    ORDER BY o.created_at ASC
  `;

  const orgIds = result.rows.map((r: Record<string, unknown>) => r.id as string);
  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Surrogate-Control": "no-store",
    "CDN-Cache-Control": "no-store",
  };
  if (orgIds.length === 0) return NextResponse.json({}, { status: 200, headers: noCacheHeaders });

  // Batch load all active members for all orgs
  const members = await sql.query(
    `SELECT om.org_id, u.username, om.is_founder
     FROM organization_members om
     LEFT JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ANY($1) AND om.is_active = TRUE
     ORDER BY om.joined_at ASC`,
    [orgIds]
  );
  const membersMap: Record<string, string[]> = {};
  const foundersMap: Record<string, string[]> = {};
  for (const row of members.rows) {
    if (!membersMap[row.org_id]) membersMap[row.org_id] = [];
    membersMap[row.org_id].push(row.username);
    if (row.is_founder) {
      if (!foundersMap[row.org_id]) foundersMap[row.org_id] = [];
      foundersMap[row.org_id].push(row.username);
    }
  }

  // Direct avatar check to diagnose read-replica / caching issues
  const avatarCheck = await sql`
    SELECT id, name,
      avatar IS NOT NULL as has_avatar,
      CASE WHEN avatar IS NOT NULL THEN length(avatar) ELSE 0 END as avatar_length
    FROM organizations ORDER BY name
  `;
  const avatarDiag: Record<string, { has_avatar: boolean; avatar_length: number }> = {};
  for (const row of avatarCheck.rows) {
    avatarDiag[row.id as string] = {
      has_avatar: !!row.has_avatar,
      avatar_length: Number(row.avatar_length) || 0,
    };
  }

  const orgs: Record<string, unknown> = {};
  for (const row of result.rows) {
    const id = row.id as string;
    const mainQueryHasAvatar = row.avatar !== null && row.avatar !== undefined;
    const diagHasAvatar = avatarDiag[id]?.has_avatar ?? false;

    // Log discrepancy: main query says null but direct check says exists
    if (!mainQueryHasAvatar && diagHasAvatar) {
      console.warn(`[data/orgs] AVATAR DISCREPANCY for ${row.name} (${id}): main query avatar is ${row.avatar === null ? 'null' : 'undefined'}, but direct check says avatar exists (${avatarDiag[id]?.avatar_length} bytes)`);
    }

    orgs[id] = {
      id,
      name: row.name,
      description: row.description,
      charter: row.charter,
      avatar: row.avatar,
      isGeneralPublic: row.is_general_public,
      enrollmentMode: row.enrollment_mode,
      sponsorsRequired: row.sponsors_required,
      crossGroupDeceptionFindings: row.cross_group_deception_findings,
      cassandraWins: row.cassandra_wins,
      createdBy: row.created_by || "unknown",
      createdAt: row.created_at,
      members: membersMap[id] || [],
      founders: foundersMap[id] || [],
    };
  }

  // Add diagnostic metadata
  (orgs as Record<string, unknown>)._avatarDiag = {
    timestamp: new Date().toISOString(),
    avatarStatus: avatarDiag,
  };

  return NextResponse.json(orgs, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Surrogate-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    },
  });
  } catch (error) {
    return serverError("GET /api/data/orgs", error);
  }
}
