import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/jury — get jury assignments for current user
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const result = await sql`
    SELECT
      ja.id, ja.submission_id, ja.dispute_id, ja.concession_id,
      ja.role, ja.in_pool, ja.accepted, ja.accepted_at, ja.assigned_at,
      s.original_headline AS submission_headline,
      s.submission_type,
      s.status AS submission_status,
      s.url AS submission_url,
      d.reasoning AS dispute_reasoning,
      d.status AS dispute_status,
      c.reasoning AS concession_reasoning,
      c.status AS concession_status
    FROM jury_assignments ja
    LEFT JOIN submissions s ON s.id = ja.submission_id
    LEFT JOIN disputes d ON d.id = ja.dispute_id
    LEFT JOIN concessions c ON c.id = ja.concession_id
    WHERE ja.user_id = ${session.sub}
    ORDER BY ja.assigned_at DESC
  `;

  return ok({ assignments: result.rows });
}
