import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// POST /api/jury/[id]/accept — accept a jury assignment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;

  // Verify assignment exists and belongs to user
  const assignment = await sql`
    SELECT id, user_id, accepted FROM jury_assignments WHERE id = ${id}
  `;
  if (assignment.rows.length === 0) {
    return err("Jury assignment not found", 404);
  }
  if (assignment.rows[0].user_id !== session.sub) {
    return err("This assignment does not belong to you", 403);
  }
  if (assignment.rows[0].accepted) {
    return err("Assignment already accepted");
  }

  await sql`
    UPDATE jury_assignments
    SET accepted = TRUE, accepted_at = now()
    WHERE id = ${id}
  `;

  return ok({ id, accepted: true });
}
