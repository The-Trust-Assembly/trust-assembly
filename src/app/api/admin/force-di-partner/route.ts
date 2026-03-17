import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// POST /api/admin/force-di-partner
// Forces every registered DI user to be an approved partner of @thekingofamerica.
// Also backfills di_partner_id on all di_pending submissions from those DI users.
// Admin-only, one-shot migration endpoint.

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const report: string[] = [];

  // 1. Find @thekingofamerica
  const king = await sql`SELECT id, username, di_partner_id FROM users WHERE username = 'thekingofamerica'`;
  if (king.rows.length === 0) return err("User @thekingofamerica not found", 404);
  const kingId = king.rows[0].id as string;
  report.push(`Found @thekingofamerica: ${kingId}`);

  // 2. Find all DI users
  const diUsers = await sql`SELECT id, username, di_partner_id, di_approved FROM users WHERE is_di = TRUE`;
  report.push(`Found ${diUsers.rows.length} DI user(s)`);

  if (diUsers.rows.length === 0) {
    return ok({ success: true, report, message: "No DI users found" });
  }

  // 3. Set each DI user's di_partner_id to @thekingofamerica and mark approved
  let usersUpdated = 0;
  for (const di of diUsers.rows) {
    const diId = di.id as string;
    const diUsername = di.username as string;
    const currentPartner = di.di_partner_id as string | null;

    if (currentPartner === kingId && di.di_approved) {
      report.push(`SKIP @${diUsername}: already partnered with @thekingofamerica`);
      continue;
    }

    await sql`
      UPDATE users
      SET di_partner_id = ${kingId}, di_approved = TRUE
      WHERE id = ${diId}
    `;
    usersUpdated++;
    report.push(`OK @${diUsername}: di_partner_id → @thekingofamerica (was ${currentPartner || "NULL"})`);
  }

  // 4. Set @thekingofamerica's di_partner_id to the most recently created DI
  const latestDI = await sql`
    SELECT id, username FROM users WHERE is_di = TRUE ORDER BY created_at DESC LIMIT 1
  `;
  if (latestDI.rows.length > 0) {
    const latestDIId = latestDI.rows[0].id as string;
    const latestDIUsername = latestDI.rows[0].username as string;
    await sql`UPDATE users SET di_partner_id = ${latestDIId} WHERE id = ${kingId}`;
    report.push(`OK @thekingofamerica: di_partner_id → @${latestDIUsername}`);
  }

  // 5. Backfill di_partner_id on all submissions from DI users where it's NULL
  const backfilled = await sql`
    UPDATE submissions
    SET di_partner_id = ${kingId}
    WHERE is_di = TRUE
      AND di_partner_id IS NULL
      AND submitted_by IN (SELECT id FROM users WHERE is_di = TRUE)
    RETURNING id
  `;
  report.push(`Backfilled di_partner_id on ${backfilled.rows.length} submission(s)`);

  // 6. Also fix any di_pending submissions that have a wrong di_partner_id
  const fixedSubs = await sql`
    UPDATE submissions
    SET di_partner_id = ${kingId}
    WHERE is_di = TRUE
      AND status = 'di_pending'
      AND di_partner_id != ${kingId}
      AND submitted_by IN (SELECT id FROM users WHERE is_di = TRUE AND di_partner_id = ${kingId})
    RETURNING id
  `;
  if (fixedSubs.rows.length > 0) {
    report.push(`Fixed di_partner_id on ${fixedSubs.rows.length} submission(s) with wrong partner`);
  }

  // 7. Create/update di_requests records so the approval is tracked
  for (const di of diUsers.rows) {
    const diId = di.id as string;
    const diUsername = di.username as string;

    const existing = await sql`
      SELECT id, status FROM di_requests
      WHERE di_user_id = ${diId} AND partner_user_id = ${kingId}
    `;

    if (existing.rows.length > 0) {
      if (existing.rows[0].status !== "approved") {
        await sql`UPDATE di_requests SET status = 'approved' WHERE id = ${existing.rows[0].id}`;
        report.push(`OK di_request for @${diUsername}: status → approved`);
      }
    } else {
      await sql`
        INSERT INTO di_requests (di_user_id, partner_user_id, status)
        VALUES (${diId}, ${kingId}, 'approved')
      `;
      report.push(`OK di_request for @${diUsername}: created as approved`);
    }
  }

  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, metadata)
    VALUES (
      'Admin force-linked all DI users to @thekingofamerica',
      ${admin.sub},
      'di_partnership',
      ${JSON.stringify({ usersUpdated, subsBackfilled: backfilled.rows.length, report })}
    )
  `;

  return ok({
    success: true,
    usersUpdated,
    subsBackfilled: backfilled.rows.length,
    report,
  });
}
