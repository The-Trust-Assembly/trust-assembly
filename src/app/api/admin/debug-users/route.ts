import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admin/debug-users — Compare raw DB users vs what /api/data/users returns.
// Shows exactly which users are "ghosts" (exist in DB but vanish from the data endpoint).
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  // 1. Raw DB: every user row
  const dbUsers = await sql`
    SELECT id, username, is_di, di_approved, di_partner_id, primary_org_id, created_at
    FROM users
    ORDER BY created_at ASC
  `;

  // 2. Run the EXACT same query as /api/data/users
  const dataQuery = await sql`
    SELECT
      u.id, u.username, u.display_name, u.real_name, u.email,
      u.gender, u.age, u.country, u.state, u.political_affiliation, u.bio,
      u.is_di, u.di_approved, u.is_admin,
      u.total_wins, u.total_losses, u.current_streak,
      u.dispute_wins, u.dispute_losses, u.deliberate_lies,
      u.last_deception_finding, u.created_at, u.ip_hash,
      u.primary_org_id,
      partner.username AS di_partner_username
    FROM users u
    LEFT JOIN users partner ON partner.id = u.di_partner_id
    ORDER BY u.created_at ASC
  `;

  // 3. Build the keyed object the same way the data endpoint does
  const keyedUsers: Record<string, string> = {};
  const duplicateKeys: string[] = [];
  for (const row of dataQuery.rows) {
    const username = row.username as string;
    if (keyedUsers[username]) {
      duplicateKeys.push(`${username} (overwrites id=${keyedUsers[username]} with id=${row.id})`);
    }
    keyedUsers[username] = row.id as string;
  }

  // 4. Find ghosts: in DB but not in keyed result
  const dbUsernames = new Set(dbUsers.rows.map(r => r.username as string));
  const keyedUsernames = new Set(Object.keys(keyedUsers));
  const ghosts = [...dbUsernames].filter(u => !keyedUsernames.has(u));
  const extras = [...keyedUsernames].filter(u => !dbUsernames.has(u));

  // 5. Org membership check
  const memberships = await sql`
    SELECT om.user_id, om.org_id, o.name AS org_name
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.is_active = TRUE
    ORDER BY om.user_id
  `;
  const membershipMap: Record<string, Array<{ orgId: string; orgName: string }>> = {};
  for (const row of memberships.rows) {
    const uid = row.user_id as string;
    if (!membershipMap[uid]) membershipMap[uid] = [];
    membershipMap[uid].push({ orgId: row.org_id as string, orgName: row.org_name as string });
  }

  // 6. KV store user data for comparison
  const kvData = await sql`
    SELECT key, LENGTH(value::text) AS size
    FROM kv_store
    WHERE key LIKE '%user%' OR key LIKE '%User%'
    ORDER BY key
  `;

  // 7. For each ghost, get full details
  const ghostDetails = [];
  for (const ghostUsername of ghosts) {
    const row = dbUsers.rows.find(r => r.username === ghostUsername);
    if (row) {
      ghostDetails.push({
        id: row.id,
        username: row.username,
        isDI: row.is_di,
        diApproved: row.di_approved,
        diPartnerId: row.di_partner_id,
        primaryOrgId: row.primary_org_id,
        createdAt: row.created_at,
        orgMemberships: membershipMap[row.id as string] || [],
      });
    }
  }

  return ok({
    summary: {
      dbCount: dbUsers.rows.length,
      dataQueryRowCount: dataQuery.rows.length,
      keyedObjectKeyCount: Object.keys(keyedUsers).length,
      ghostCount: ghosts.length,
      duplicateKeyCount: duplicateKeys.length,
    },
    ghosts,
    ghostDetails,
    duplicateKeys,
    extras,
    allDbUsernames: dbUsers.rows.map(r => ({
      username: r.username,
      id: r.id,
      isDI: r.is_di,
      primaryOrgId: r.primary_org_id,
      orgCount: (membershipMap[r.id as string] || []).length,
      createdAt: r.created_at,
    })),
    kvUserKeys: kvData.rows,
  });
}
