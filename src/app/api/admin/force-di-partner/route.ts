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

  // Use sql.connect() for a dedicated client where transactions work.
  // All user updates, submission backfills, and di_request records in one transaction.
  const client = await sql.connect();
  let usersUpdated = 0;
  let subsBackfilled = 0;

  try {
    await client.query("BEGIN");

    // 3. Set each DI user's di_partner_id to @thekingofamerica and mark approved
    for (const di of diUsers.rows) {
      const diId = di.id as string;
      const diUsername = di.username as string;
      const currentPartner = di.di_partner_id as string | null;

      if (currentPartner === kingId && di.di_approved) {
        report.push(`SKIP @${diUsername}: already partnered with @thekingofamerica`);
        continue;
      }

      await client.query(
        "UPDATE users SET di_partner_id = $1, di_approved = TRUE WHERE id = $2",
        [kingId, diId]
      );
      usersUpdated++;
      report.push(`OK @${diUsername}: di_partner_id → @thekingofamerica (was ${currentPartner || "NULL"})`);
    }

    // 4. Set @thekingofamerica's di_partner_id to the first DI (if not already set).
    // With multi-DI support, humans can have up to 5 DIs; di_partner_id holds the first,
    // and the full list is derived from di_requests WHERE status='approved'.
    const currentKing = await client.query("SELECT di_partner_id FROM users WHERE id = $1", [kingId]);
    if (!currentKing.rows[0]?.di_partner_id) {
      const firstDI = await client.query(
        "SELECT id, username FROM users WHERE is_di = TRUE ORDER BY created_at ASC LIMIT 1"
      );
      if (firstDI.rows.length > 0) {
        await client.query("UPDATE users SET di_partner_id = $1 WHERE id = $2", [firstDI.rows[0].id, kingId]);
        report.push(`OK @thekingofamerica: di_partner_id → @${firstDI.rows[0].username} (first DI)`);
      }
    } else {
      report.push(`SKIP @thekingofamerica: di_partner_id already set (multi-DI — full list in di_requests)`);
    }

    // 5. Backfill di_partner_id on all submissions from DI users where it's NULL
    const backfilled = await client.query(
      `UPDATE submissions
       SET di_partner_id = $1
       WHERE is_di = TRUE
         AND di_partner_id IS NULL
         AND submitted_by IN (SELECT id FROM users WHERE is_di = TRUE)
       RETURNING id`,
      [kingId]
    );
    subsBackfilled = backfilled.rows.length;
    report.push(`Backfilled di_partner_id on ${subsBackfilled} submission(s)`);

    // 6. Also fix any di_pending submissions that have a wrong di_partner_id
    const fixedSubs = await client.query(
      `UPDATE submissions
       SET di_partner_id = $1
       WHERE is_di = TRUE
         AND status = 'di_pending'
         AND di_partner_id != $1
         AND submitted_by IN (SELECT id FROM users WHERE is_di = TRUE AND di_partner_id = $1)
       RETURNING id`,
      [kingId]
    );
    if (fixedSubs.rows.length > 0) {
      report.push(`Fixed di_partner_id on ${fixedSubs.rows.length} submission(s) with wrong partner`);
    }

    // 7. Create/update di_requests records so the approval is tracked
    for (const di of diUsers.rows) {
      const diId = di.id as string;
      const diUsername = di.username as string;

      const existing = await client.query(
        "SELECT id, status FROM di_requests WHERE di_user_id = $1 AND partner_user_id = $2",
        [diId, kingId]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].status !== "approved") {
          await client.query(
            "UPDATE di_requests SET status = 'approved' WHERE id = $1",
            [existing.rows[0].id]
          );
          report.push(`OK di_request for @${diUsername}: status → approved`);
        }
      } else {
        await client.query(
          "INSERT INTO di_requests (di_user_id, partner_user_id, status) VALUES ($1, $2, 'approved')",
          [diId, kingId]
        );
        report.push(`OK di_request for @${diUsername}: created as approved`);
      }
    }

    // Audit log
    await client.query(
      "INSERT INTO audit_log (action, user_id, entity_type, metadata) VALUES ($1, $2, $3, $4)",
      [
        "Admin force-linked all DI users to @thekingofamerica",
        admin.sub,
        "di_partnership",
        JSON.stringify({ usersUpdated, subsBackfilled, report }),
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Force DI partner transaction failed, rolled back:", e);
    throw e;
  } finally {
    client.release();
  }

  return ok({
    success: true,
    usersUpdated,
    subsBackfilled,
    report,
  });
}
