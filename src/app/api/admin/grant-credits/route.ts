import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// POST /api/admin/grant-credits
// --------------------------------
// Admin grants credits to a user. Use for Substack followers,
// beta testers, or manual top-ups.
//
// Body: { username: string, credits: number }
// Or:   { userId: string, credits: number }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const credits = typeof body.credits === "number" ? Math.floor(body.credits) : 0;

    if (credits <= 0 || credits > 1000) {
      return err("credits must be between 1 and 1000");
    }

    let result;
    if (body.username) {
      result = await sql`
        UPDATE users
        SET agent_credits = COALESCE(agent_credits, 0) + ${credits}
        WHERE username = ${body.username}
        RETURNING id, username, agent_credits
      `;
    } else if (body.userId) {
      result = await sql`
        UPDATE users
        SET agent_credits = COALESCE(agent_credits, 0) + ${credits}
        WHERE id = ${body.userId}
        RETURNING id, username, agent_credits
      `;
    } else {
      return err("username or userId is required");
    }

    if (result.rows.length === 0) {
      return err("User not found", 404);
    }

    const user = result.rows[0];
    return ok({
      message: `Granted ${credits} credits to @${user.username}. New balance: ${user.agent_credits}`,
      username: user.username,
      newBalance: user.agent_credits,
    });
  } catch (e) {
    return serverError("/api/admin/grant-credits", e);
  }
}
