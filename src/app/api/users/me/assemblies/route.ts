import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/users/me/assemblies — list user's joined and followed assemblies
// Reads from the KV store (where the React SPA stores all data)
// to stay consistent with the main app's source of truth.

const VER = "v5";
const SK_ORGS = `ta-o-${VER}`;
const SK_USERS = `ta-u-${VER}`;

async function kvGet(key: string): Promise<unknown> {
  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0 || !result.rows[0].value) return null;
  return JSON.parse(result.rows[0].value);
}

export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const [orgsRaw, usersRaw] = await Promise.all([
    kvGet(SK_ORGS),
    kvGet(SK_USERS),
  ]);

  const orgs = (orgsRaw as Record<string, Record<string, unknown>>) || {};
  const users = (usersRaw as Record<string, Record<string, unknown>>) || {};

  // Find the user in KV by username (from JWT)
  const username = session.username;
  const user = users[username] as Record<string, unknown> | undefined;

  // Find orgs where the user is a member (KV stores members as username arrays)
  const joined: { id: string; name: string }[] = [];
  for (const [orgId, org] of Object.entries(orgs)) {
    const members = (org.members as string[]) || [];
    if (members.includes(username)) {
      joined.push({ id: orgId, name: (org.name as string) || "" });
    }
  }

  // Get followed orgs from user's followedOrgIds array
  const followed: { id: string; name: string }[] = [];
  const followedIds = (user?.followedOrgIds as string[]) || [];
  for (const orgId of followedIds) {
    const org = orgs[orgId];
    if (org) {
      followed.push({ id: orgId, name: (org.name as string) || "" });
    }
  }

  return ok({
    joined,
    followed,
  });
}
