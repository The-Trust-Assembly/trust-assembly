import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// POST /api/concessions/[id]/vote — vote on a concession
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { approve } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  // Verify concession exists
  const concession = await sql`
    SELECT id, org_id FROM concessions WHERE id = ${id}
  `;
  if (concession.rows.length === 0) {
    return err("Concession not found", 404);
  }

  // Insert vote
  const result = await sql`
    INSERT INTO jury_votes (concession_id, user_id, role, approve)
    VALUES (${id}, ${session.sub}, 'concession', ${approve})
    RETURNING id, concession_id, approve, voted_at
  `;

  return ok(result.rows[0], 201);
}
