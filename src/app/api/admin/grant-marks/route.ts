import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";
import { creditMarks } from "@/lib/scoring/marks";

// POST /api/admin/grant-marks — { username, amount, note? }
// Admin testing/seeding tool for the Marks economy (mirrors
// grant-credits). Amount may be 1..10000; recorded in the ledger
// with reason 'admin_grant' so grants are auditable.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const body = await request.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const amount = Number(body.amount);
  if (!username) return err("username is required");
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) return err("amount must be 1-10000");

  const userResult = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
  if (userResult.rows.length === 0) return err(`User @${username} not found`, 404);

  const result = await creditMarks(userResult.rows[0].id as string, amount, "admin_grant", {
    detail: { grantedBy: admin.username, note: body.note || null },
  });
  if (!result.ok) return err("Grant failed — has migration 027 been run?", 500);

  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, metadata)
    VALUES ('Admin: granted Marks', ${admin.sub}, 'user',
            ${JSON.stringify({ targetUsername: username, amount, note: body.note || null })})
  `;

  return ok({ message: `Granted ${amount} Marks to @${username}.`, balance: result.balance });
}
