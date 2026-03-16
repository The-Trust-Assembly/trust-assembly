import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/di-requests — list DI requests for current user (as partner)
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const result = await sql`
    SELECT
      dr.id, dr.di_user_id, dr.partner_user_id, dr.status, dr.created_at,
      u.username AS di_username, u.display_name AS di_display_name
    FROM di_requests dr
    LEFT JOIN users u ON u.id = dr.di_user_id
    WHERE dr.partner_user_id = ${session.sub}
    ORDER BY dr.created_at DESC
  `;

  return ok({ requests: result.rows });
}

// POST /api/di-requests — create DI partnership request
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { partnerUsername } = body;

  if (!partnerUsername) {
    return err("partnerUsername is required");
  }

  // Look up partner by username
  const partner = await sql`
    SELECT id, username FROM users WHERE username = ${partnerUsername.toLowerCase().trim()}
  `;
  if (partner.rows.length === 0) {
    return err("Partner user not found", 404);
  }

  if (partner.rows[0].id === session.sub) {
    return err("You cannot partner with yourself");
  }

  // Check for existing pending request
  const existing = await sql`
    SELECT id FROM di_requests
    WHERE di_user_id = ${session.sub} AND partner_user_id = ${partner.rows[0].id} AND status = 'pending'
  `;
  if (existing.rows.length > 0) {
    return err("A pending request already exists for this partner", 409);
  }

  const result = await sql`
    INSERT INTO di_requests (di_user_id, partner_user_id)
    VALUES (${session.sub}, ${partner.rows[0].id})
    RETURNING id, di_user_id, partner_user_id, status, created_at
  `;

  return ok(result.rows[0], 201);
}
