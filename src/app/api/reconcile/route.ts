import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// POST /api/reconcile — Migrate KV store records to relational tables, then purge KV.
// Admin-only. Reads data from kv_store table and inserts missing records
// into the proper relational tables. Idempotent — safe to run multiple times.
//
// Pass ?purge=true to delete KV rows after successful migration.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const purge = request.nextUrl.searchParams.get("purge") === "true";
  const report: string[] = [];
  let migratedCount = 0;

  // Helper: resolve username → user ID (cached)
  const userIdCache: Record<string, string | null> = {};
  async function resolveUserId(username: string): Promise<string | null> {
    const key = username.toLowerCase();
    if (key in userIdCache) return userIdCache[key];
    const result = await sql`SELECT id FROM users WHERE username = ${key}`;
    userIdCache[key] = result.rows.length > 0 ? (result.rows[0].id as string) : null;
    return userIdCache[key];
  }

  try {
    // ── Migrate submissions from KV ──
    const kvSubs = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'ta-s-%'`;
    for (const kvRow of kvSubs.rows) {
      if (!kvRow.value) continue;
      let subsObj: Record<string, Record<string, unknown>>;
      try { subsObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; }
      catch { report.push(`ERR: Could not parse KV key ${kvRow.key}`); continue; }

      for (const [subId, sub] of Object.entries(subsObj)) {
        // Check if submission already exists in relational table
        const existing = await sql`SELECT id FROM submissions WHERE id = ${subId}`;
        if (existing.rows.length > 0) {
          report.push(`SKIP submission ${subId}: already in relational table`);
          // Even if submission exists, migrate child records that may be missing
          await migrateChildRecords(subId, sub, report);
          continue;
        }

        // Look up user ID by username
        const submitter = sub.submittedBy as string;
        if (!submitter) { report.push(`SKIP submission ${subId}: no submittedBy`); continue; }
        const userId = await resolveUserId(submitter);
        if (!userId) { report.push(`SKIP submission ${subId}: submitter @${submitter} not found in users table`); continue; }

        // Look up org
        const orgId = sub.orgId as string;
        if (!orgId) { report.push(`SKIP submission ${subId}: no orgId`); continue; }
        const orgResult = await sql`SELECT id FROM organizations WHERE id = ${orgId}`;
        if (orgResult.rows.length === 0) { report.push(`SKIP submission ${subId}: org ${orgId} not found`); continue; }

        // Resolve DI partner
        let diPartnerId: string | null = null;
        if (sub.diPartner) {
          diPartnerId = await resolveUserId(sub.diPartner as string);
          if (!diPartnerId) report.push(`WARN submission ${subId}: DI partner @${sub.diPartner} not found, setting to null`);
        }

        try {
          await sql`
            INSERT INTO submissions (
              id, submission_type, status, url, original_headline, replacement,
              reasoning, author, submitted_by, org_id, trusted_skip, is_di,
              di_partner_id, jury_seats, jury_seed,
              cross_group_jury_size, cross_group_seed,
              deliberate_lie_finding, survival_count,
              created_at, resolved_at
            ) VALUES (
              ${subId},
              ${(sub.submissionType as string) || 'correction'},
              ${(sub.status as string) || 'pending_review'},
              ${(sub.url as string) || ''},
              ${(sub.originalHeadline as string) || ''},
              ${(sub.replacement as string) || null},
              ${(sub.reasoning as string) || ''},
              ${(sub.author as string) || null},
              ${userId},
              ${orgId},
              ${(sub.trustedSkip as boolean) || false},
              ${(sub.isDI as boolean) || false},
              ${diPartnerId},
              ${(sub.jurySeats as number) || null},
              ${(sub.jurySeed as number) || null},
              ${(sub.crossGroupJurySize as number) || null},
              ${(sub.crossGroupSeed as number) || null},
              ${(sub.deliberateLieFinding as boolean) || false},
              ${(sub.survivalCount as number) || 0},
              ${(sub.createdAt as string) || new Date().toISOString()},
              ${(sub.resolvedAt as string) || null}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          migratedCount++;
          report.push(`OK submission ${subId} (@${submitter} → ${sub.orgName || orgId}): status=${sub.status}`);
        } catch (e) {
          report.push(`ERR submission ${subId}: ${(e as Error).message}`);
          continue;
        }

        // Migrate child records
        await migrateChildRecords(subId, sub, report);
      }
    }

    // ── Migrate disputes from KV ──
    const kvDisp = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'ta-disp-%'`;
    for (const kvRow of kvDisp.rows) {
      if (!kvRow.value) continue;
      let dispObj: Record<string, Record<string, unknown>>;
      try { dispObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; }
      catch { report.push(`ERR: Could not parse KV key ${kvRow.key}`); continue; }

      for (const [dispId, disp] of Object.entries(dispObj)) {
        const existing = await sql`SELECT id FROM disputes WHERE id = ${dispId}`;
        if (existing.rows.length > 0) { report.push(`SKIP dispute ${dispId}: already in relational table`); continue; }

        const disputedBy = disp.disputedBy as string;
        if (!disputedBy) continue;
        const disputerId = await resolveUserId(disputedBy);
        if (!disputerId) { report.push(`SKIP dispute ${dispId}: disputer @${disputedBy} not found`); continue; }

        const subIdRef = disp.subId as string;
        const orgId = disp.orgId as string;
        if (!subIdRef || !orgId) { report.push(`SKIP dispute ${dispId}: missing subId or orgId`); continue; }

        try {
          await sql`
            INSERT INTO disputes (
              id, submission_id, org_id, disputed_by, reasoning, status,
              deliberate_lie_finding, created_at, resolved_at
            ) VALUES (
              ${dispId},
              ${subIdRef},
              ${orgId},
              ${disputerId},
              ${(disp.reasoning as string) || ''},
              ${(disp.status as string) || 'pending_review'},
              ${(disp.deliberateLieFinding as boolean) || false},
              ${(disp.createdAt as string) || new Date().toISOString()},
              ${(disp.resolvedAt as string) || null}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          migratedCount++;
          report.push(`OK dispute ${dispId}: migrated`);

          // Migrate dispute jurors and votes
          const dispJurors = (disp.jurors || []) as string[];
          for (const jurorUsername of dispJurors) {
            const jurorId = await resolveUserId(jurorUsername);
            if (!jurorId) continue;
            await sql`
              INSERT INTO jury_assignments (dispute_id, user_id, role, in_pool, accepted, accepted_at)
              VALUES (${dispId}, ${jurorId}, 'dispute', TRUE, TRUE, now())
              ON CONFLICT DO NOTHING
            `;
          }

          const dispVotes = (disp.votes || {}) as Record<string, Record<string, unknown>>;
          for (const [voterUsername, vote] of Object.entries(dispVotes)) {
            const voterId = await resolveUserId(voterUsername);
            if (!voterId) continue;
            await sql`
              INSERT INTO jury_votes (dispute_id, user_id, role, approve, note, deliberate_lie, voted_at)
              VALUES (
                ${dispId}, ${voterId}, 'dispute',
                ${(vote.approve as boolean) || false},
                ${(vote.note as string) || null},
                ${(vote.deliberateLie as boolean) || false},
                ${(vote.time as string) || new Date().toISOString()}
              )
              ON CONFLICT DO NOTHING
            `;
          }
        } catch (e) {
          report.push(`ERR dispute ${dispId}: ${(e as Error).message}`);
        }
      }
    }

    // ── Migrate audit entries from KV ──
    const kvAudit = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'ta-a-%'`;
    for (const kvRow of kvAudit.rows) {
      if (!kvRow.value) continue;
      let auditEntries: Array<Record<string, unknown>>;
      try {
        const parsed = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value;
        auditEntries = Array.isArray(parsed) ? parsed : [];
      } catch { continue; }

      let auditMigrated = 0;
      for (const entry of auditEntries) {
        if (!entry.action || !entry.time) continue;
        const existing = await sql`
          SELECT id FROM audit_log
          WHERE action = ${entry.action as string}
            AND created_at BETWEEN ${new Date(new Date(entry.time as string).getTime() - 1000).toISOString()}
                           AND ${new Date(new Date(entry.time as string).getTime() + 1000).toISOString()}
          LIMIT 1
        `;
        if (existing.rows.length > 0) continue;

        try {
          await sql`
            INSERT INTO audit_log (action, entity_type, created_at)
            VALUES (${entry.action as string}, 'kv_migration', ${entry.time as string})
          `;
          auditMigrated++;
          migratedCount++;
        } catch (e) {
          report.push(`ERR audit entry: ${(e as Error).message}`);
        }
      }
      report.push(`Processed ${auditEntries.length} audit entries from KV key ${kvRow.key} (migrated ${auditMigrated})`);
    }

    // ── Report on all KV keys ──
    const allKeys = await sql`SELECT key, LENGTH(value::text) AS size FROM kv_store ORDER BY key`;
    report.push(`\n--- KV Store Contents (${allKeys.rows.length} keys) ---`);
    for (const row of allKeys.rows) {
      report.push(`  ${row.key}: ${row.size} bytes`);
    }

    // ── Purge KV store if requested ──
    if (purge) {
      const deleteResult = await sql`DELETE FROM kv_store RETURNING key`;
      report.push(`\n--- PURGED ${deleteResult.rows.length} KV keys ---`);
      for (const row of deleteResult.rows) {
        report.push(`  Deleted: ${row.key}`);
      }
    }

    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata)
      VALUES (
        ${purge ? 'KV store reconciliation + purge completed' : 'KV store reconciliation completed'},
        ${admin.sub},
        'kv_migration',
        ${JSON.stringify({ migratedCount, reportLines: report.length, purged: purge })}
      )
    `;

    return ok({
      success: true,
      migratedCount,
      purged: purge,
      report,
    });
  } catch (e) {
    return err(`Reconciliation failed: ${(e as Error).message}`, 500);
  }

  // ── Helper: migrate evidence, inline edits, jurors, and votes for a submission ──
  async function migrateChildRecords(subId: string, sub: Record<string, unknown>, report: string[]) {
    // --- Evidence ---
    const evidence = (sub.evidence || []) as Array<Record<string, unknown>>;
    for (let i = 0; i < evidence.length; i++) {
      const ev = evidence[i];
      if (!ev.url) continue;
      const existingEv = await sql`
        SELECT id FROM submission_evidence
        WHERE submission_id = ${subId} AND url = ${ev.url as string}
        LIMIT 1
      `;
      if (existingEv.rows.length > 0) continue;
      try {
        await sql`
          INSERT INTO submission_evidence (submission_id, url, explanation, sort_order)
          VALUES (${subId}, ${ev.url as string}, ${(ev.explanation as string) || ''}, ${i})
        `;
        migratedCount++;
      } catch (e) {
        report.push(`ERR evidence for ${subId}: ${(e as Error).message}`);
      }
    }

    // --- Inline edits ---
    const inlineEdits = (sub.inlineEdits || []) as Array<Record<string, unknown>>;
    for (let i = 0; i < inlineEdits.length; i++) {
      const edit = inlineEdits[i];
      if (!edit.original) continue;
      const existingEdit = await sql`
        SELECT id FROM submission_inline_edits
        WHERE submission_id = ${subId} AND original_text = ${edit.original as string}
        LIMIT 1
      `;
      if (existingEdit.rows.length > 0) continue;
      try {
        await sql`
          INSERT INTO submission_inline_edits (submission_id, original_text, replacement_text, reasoning, approved, sort_order)
          VALUES (${subId}, ${edit.original as string}, ${(edit.replacement as string) || ''}, ${(edit.reasoning as string) || null}, ${(edit.approved as boolean) || null}, ${i})
        `;
        migratedCount++;
      } catch (e) {
        report.push(`ERR inline edit for ${subId}: ${(e as Error).message}`);
      }
    }

    // --- Jury assignments (in-group) ---
    const jurors = (sub.jurors || []) as string[];
    const acceptedJurors = new Set((sub.acceptedJurors || []) as string[]);
    const acceptedAt = (sub.acceptedAt || {}) as Record<string, string>;
    const juryPool = new Set((sub.juryPool || []) as string[]);
    for (const jurorUsername of jurors) {
      const jurorId = await resolveUserId(jurorUsername);
      if (!jurorId) { report.push(`WARN juror @${jurorUsername} not found for sub ${subId}`); continue; }
      try {
        await sql`
          INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted, accepted_at)
          VALUES (
            ${subId}, ${jurorId}, 'in_group',
            ${juryPool.has(jurorUsername)},
            ${acceptedJurors.has(jurorUsername)},
            ${acceptedAt[jurorUsername] || null}
          )
          ON CONFLICT DO NOTHING
        `;
      } catch (e) {
        report.push(`ERR juror ${jurorUsername} for sub ${subId}: ${(e as Error).message}`);
      }
    }

    // --- Jury assignments (cross-group) ---
    const crossJurors = (sub.crossGroupJurors || []) as string[];
    const acceptedCross = new Set((sub.crossGroupAcceptedJurors || []) as string[]);
    const crossAcceptedAt = (sub.crossGroupAcceptedAt || {}) as Record<string, string>;
    const crossPool = new Set((sub.crossGroupJuryPool || []) as string[]);
    for (const jurorUsername of crossJurors) {
      const jurorId = await resolveUserId(jurorUsername);
      if (!jurorId) continue;
      try {
        await sql`
          INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted, accepted_at)
          VALUES (
            ${subId}, ${jurorId}, 'cross_group',
            ${crossPool.has(jurorUsername)},
            ${acceptedCross.has(jurorUsername)},
            ${crossAcceptedAt[jurorUsername] || null}
          )
          ON CONFLICT DO NOTHING
        `;
      } catch (e) {
        report.push(`ERR cross juror ${jurorUsername} for sub ${subId}: ${(e as Error).message}`);
      }
    }

    // --- Votes (in-group) ---
    const votes = (sub.votes || {}) as Record<string, Record<string, unknown>>;
    for (const [voterUsername, vote] of Object.entries(votes)) {
      const voterId = await resolveUserId(voterUsername);
      if (!voterId) continue;
      try {
        await sql`
          INSERT INTO jury_votes (submission_id, user_id, role, approve, note, deliberate_lie, newsworthy, interesting, voted_at)
          VALUES (
            ${subId}, ${voterId}, 'in_group',
            ${(vote.approve as boolean) || false},
            ${(vote.note as string) || null},
            ${(vote.deliberateLie as boolean) || false},
            ${(vote.newsworthy as number) || null},
            ${(vote.interesting as number) || null},
            ${(vote.time as string) || new Date().toISOString()}
          )
          ON CONFLICT DO NOTHING
        `;
      } catch (e) {
        report.push(`ERR vote ${voterUsername} for sub ${subId}: ${(e as Error).message}`);
      }
    }

    // --- Votes (cross-group) ---
    const crossVotes = (sub.crossGroupVotes || {}) as Record<string, Record<string, unknown>>;
    for (const [voterUsername, vote] of Object.entries(crossVotes)) {
      const voterId = await resolveUserId(voterUsername);
      if (!voterId) continue;
      try {
        await sql`
          INSERT INTO jury_votes (submission_id, user_id, role, approve, note, deliberate_lie, newsworthy, interesting, voted_at)
          VALUES (
            ${subId}, ${voterId}, 'cross_group',
            ${(vote.approve as boolean) || false},
            ${(vote.note as string) || null},
            ${(vote.deliberateLie as boolean) || false},
            ${(vote.newsworthy as number) || null},
            ${(vote.interesting as number) || null},
            ${(vote.time as string) || new Date().toISOString()}
          )
          ON CONFLICT DO NOTHING
        `;
      } catch (e) {
        report.push(`ERR cross vote ${voterUsername} for sub ${subId}: ${(e as Error).message}`);
      }
    }
  }
}
