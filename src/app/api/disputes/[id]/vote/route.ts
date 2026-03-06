import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// POST /api/disputes/[id]/vote — vote on a dispute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { approve, note, deliberateLie } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  // Verify dispute exists
  const dispute = await sql`
    SELECT id, org_id FROM disputes WHERE id = ${id}
  `;
  if (dispute.rows.length === 0) {
    return err("Dispute not found", 404);
  }

  // Insert vote
  const result = await sql`
    INSERT INTO jury_votes (dispute_id, user_id, role, approve, note, deliberate_lie)
    VALUES (${id}, ${session.sub}, 'dispute', ${approve}, ${note || null}, ${deliberateLie || false})
    RETURNING id, dispute_id, approve, voted_at
  `;

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
    VALUES ('Dispute vote cast', ${session.sub}, ${dispute.rows[0].org_id}, 'dispute', ${id})
  `;

  return ok(result.rows[0], 201);
}
