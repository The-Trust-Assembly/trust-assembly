import { NextRequest } from "next/server";
import { createHash } from "crypto";
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

  // Helper: check if a string is a valid UUID
  function isValidUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  // Helper: convert a legacy non-UUID ID to a deterministic UUID.
  // Uses MD5 hash of the ID to produce a stable UUID — same input always gives same output.
  function toUuid(legacyId: string): string {
    if (isValidUuid(legacyId)) return legacyId;
    const hash = createHash("md5").update(`ta-kv-migration:${legacyId}`).digest("hex");
    return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
  }

  // Tracks legacy submission ID → UUID for dispute cross-references
  const subIdMap: Record<string, string> = {};

  // Helper: resolve username → user ID (cached)
  const userIdCache: Record<string, string | null> = {};
  async function resolveUserId(username: string): Promise<string | null> {
    const key = username.toLowerCase();
    if (key in userIdCache) return userIdCache[key];
    const result = await sql`SELECT id FROM users WHERE username = ${key}`;
    userIdCache[key] = result.rows.length > 0 ? (result.rows[0].id as string) : null;
    return userIdCache[key];
  }

  // Helper: resolve an org ID from KV (may be non-UUID). Try by UUID first, then by name.
  const orgIdCache: Record<string, string | null> = {};
  async function resolveOrgId(kvOrgId: string, orgName?: string): Promise<string | null> {
    if (kvOrgId in orgIdCache) return orgIdCache[kvOrgId];
    // Try direct lookup if it's a valid UUID
    if (isValidUuid(kvOrgId)) {
      const result = await sql`SELECT id FROM organizations WHERE id = ${kvOrgId}`;
      if (result.rows.length > 0) {
        orgIdCache[kvOrgId] = result.rows[0].id as string;
        return orgIdCache[kvOrgId];
      }
    }
    // Try deterministic UUID from legacy ID
    const mappedUuid = toUuid(kvOrgId);
    const result2 = await sql`SELECT id FROM organizations WHERE id = ${mappedUuid}`;
    if (result2.rows.length > 0) {
      orgIdCache[kvOrgId] = result2.rows[0].id as string;
      return orgIdCache[kvOrgId];
    }
    // Fallback: look up by name if provided
    if (orgName) {
      const result3 = await sql`SELECT id FROM organizations WHERE name = ${orgName}`;
      if (result3.rows.length > 0) {
        orgIdCache[kvOrgId] = result3.rows[0].id as string;
        return orgIdCache[kvOrgId];
      }
    }
    // Last resort: try to find the General Public org
    const gp = await sql`SELECT id FROM organizations WHERE is_general_public = TRUE LIMIT 1`;
    if (gp.rows.length > 0) {
      orgIdCache[kvOrgId] = gp.rows[0].id as string;
      return orgIdCache[kvOrgId];
    }
    orgIdCache[kvOrgId] = null;
    return null;
  }

  try {
    // ── Migrate submissions from KV ──
    const kvSubs = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'ta-s-%'`;
    for (const kvRow of kvSubs.rows) {
      if (!kvRow.value) continue;
      let subsObj: Record<string, Record<string, unknown>>;
      try { subsObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; }
      catch { report.push(`ERR: Could not parse KV key ${kvRow.key}`); continue; }

      for (const [kvSubId, sub] of Object.entries(subsObj)) {
        const newSubId = toUuid(kvSubId);
        subIdMap[kvSubId] = newSubId;

        // Check if submission already exists in relational table — REPAIR if needed
        const existing = await sql`SELECT id, is_di, di_partner_id, status, org_id FROM submissions WHERE id = ${newSubId}`;
        if (existing.rows.length > 0) {
          // Repair pass: update fields that may be missing or wrong
          const ex = existing.rows[0];
          const repairs: string[] = [];

          // Repair di_partner_id
          const kvDiPartner = sub.diPartner as string;
          if (kvDiPartner && !ex.di_partner_id) {
            const partnerId = await resolveUserId(kvDiPartner);
            if (partnerId) {
              await sql`UPDATE submissions SET di_partner_id = ${partnerId} WHERE id = ${newSubId}`;
              repairs.push(`di_partner_id→${partnerId.slice(0,8)}…`);
              migratedCount++;
            }
          }

          // Repair is_di flag
          if ((sub.isDI === true || sub.isDI === "true") && !ex.is_di) {
            await sql`UPDATE submissions SET is_di = TRUE WHERE id = ${newSubId}`;
            repairs.push("is_di→true");
            migratedCount++;
          }

          // Repair org_id if it's the GP but should be a specific org
          const kvOrgId = sub.orgId as string;
          if (kvOrgId) {
            const resolvedOrg = await resolveOrgId(kvOrgId, sub.orgName as string | undefined);
            if (resolvedOrg && resolvedOrg !== ex.org_id) {
              await sql`UPDATE submissions SET org_id = ${resolvedOrg} WHERE id = ${newSubId}`;
              repairs.push(`org_id→${resolvedOrg.slice(0,8)}…`);
              migratedCount++;
            }
          }

          if (repairs.length > 0) {
            report.push(`REPAIR submission ${kvSubId}: ${repairs.join(", ")}`);
          } else {
            report.push(`SKIP submission ${kvSubId}: already in relational table (as ${newSubId.slice(0,8)}…)`);
          }
          await migrateChildRecords(newSubId, sub, report);
          continue;
        }

        // Look up user ID by username
        const submitter = sub.submittedBy as string;
        if (!submitter) { report.push(`SKIP submission ${kvSubId}: no submittedBy`); continue; }
        const userId = await resolveUserId(submitter);
        if (!userId) { report.push(`SKIP submission ${kvSubId}: submitter @${submitter} not found in users table`); continue; }

        // Look up org — try UUID, then by name, then fallback to GP
        const kvOrgId = sub.orgId as string;
        if (!kvOrgId) { report.push(`SKIP submission ${kvSubId}: no orgId`); continue; }
        const resolvedOrgId = await resolveOrgId(kvOrgId, sub.orgName as string | undefined);
        if (!resolvedOrgId) { report.push(`SKIP submission ${kvSubId}: org ${kvOrgId} (${sub.orgName || 'unnamed'}) not found`); continue; }

        // Resolve DI partner
        let diPartnerId: string | null = null;
        if (sub.diPartner) {
          diPartnerId = await resolveUserId(sub.diPartner as string);
          if (!diPartnerId) report.push(`WARN submission ${kvSubId}: DI partner @${sub.diPartner} not found, setting to null`);
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
              ${newSubId},
              ${(sub.submissionType as string) || 'correction'},
              ${(sub.status as string) || 'pending_review'},
              ${(sub.url as string) || ''},
              ${(sub.originalHeadline as string) || ''},
              ${(sub.replacement as string) || null},
              ${(sub.reasoning as string) || ''},
              ${(sub.author as string) || null},
              ${userId},
              ${resolvedOrgId},
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
          report.push(`OK submission ${kvSubId} → ${newSubId.slice(0,8)}… (@${submitter} → ${sub.orgName || resolvedOrgId}): status=${sub.status}`);
        } catch (e) {
          report.push(`ERR submission ${kvSubId}: ${(e as Error).message}`);
          continue;
        }

        // Migrate child records
        await migrateChildRecords(newSubId, sub, report);
      }
    }

    // ── Migrate disputes from KV ──
    const kvDisp = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'ta-disp-%'`;
    for (const kvRow of kvDisp.rows) {
      if (!kvRow.value) continue;
      let dispObj: Record<string, Record<string, unknown>>;
      try { dispObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; }
      catch { report.push(`ERR: Could not parse KV key ${kvRow.key}`); continue; }

      for (const [kvDispId, disp] of Object.entries(dispObj)) {
        const newDispId = toUuid(kvDispId);

        const existing = await sql`SELECT id FROM disputes WHERE id = ${newDispId}`;
        if (existing.rows.length > 0) { report.push(`SKIP dispute ${kvDispId}: already in relational table`); continue; }

        const disputedBy = disp.disputedBy as string;
        if (!disputedBy) continue;
        const disputerId = await resolveUserId(disputedBy);
        if (!disputerId) { report.push(`SKIP dispute ${kvDispId}: disputer @${disputedBy} not found`); continue; }

        const kvSubIdRef = disp.subId as string;
        const kvOrgId = disp.orgId as string;
        if (!kvSubIdRef || !kvOrgId) { report.push(`SKIP dispute ${kvDispId}: missing subId or orgId`); continue; }

        // Resolve submission ID (may have been remapped)
        const resolvedSubId = subIdMap[kvSubIdRef] || toUuid(kvSubIdRef);
        const resolvedOrgId = await resolveOrgId(kvOrgId);
        if (!resolvedOrgId) { report.push(`SKIP dispute ${kvDispId}: org ${kvOrgId} not found`); continue; }

        // Resolve original submitter for the required FK
        const origSubmitter = disp.originalSubmitter as string || disp.submittedBy as string || "";
        let origSubmitterId = origSubmitter ? await resolveUserId(origSubmitter) : null;
        if (!origSubmitterId) {
          // Try to look it up from the submission itself
          const subRow = await sql`SELECT submitted_by FROM submissions WHERE id = ${resolvedSubId}`;
          origSubmitterId = subRow.rows.length > 0 ? (subRow.rows[0].submitted_by as string) : disputerId;
        }

        try {
          await sql`
            INSERT INTO disputes (
              id, submission_id, org_id, disputed_by, original_submitter, reasoning, status,
              deliberate_lie_finding, created_at, resolved_at
            ) VALUES (
              ${newDispId},
              ${resolvedSubId},
              ${resolvedOrgId},
              ${disputerId},
              ${origSubmitterId},
              ${(disp.reasoning as string) || ''},
              ${(disp.status as string) || 'pending_review'},
              ${(disp.deliberateLieFinding as boolean) || false},
              ${(disp.createdAt as string) || new Date().toISOString()},
              ${(disp.resolvedAt as string) || null}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          migratedCount++;
          report.push(`OK dispute ${kvDispId} → ${newDispId.slice(0,8)}…: migrated`);

          // Migrate dispute jurors and votes
          const dispJurors = (disp.jurors || []) as string[];
          for (const jurorUsername of dispJurors) {
            const jurorId = await resolveUserId(jurorUsername);
            if (!jurorId) continue;
            await sql`
              INSERT INTO jury_assignments (dispute_id, user_id, role, in_pool, accepted, accepted_at)
              VALUES (${newDispId}, ${jurorId}, 'dispute', TRUE, TRUE, now())
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
                ${newDispId}, ${voterId}, 'dispute',
                ${(vote.approve as boolean) || false},
                ${(vote.note as string) || null},
                ${(vote.deliberateLie as boolean) || false},
                ${(vote.time as string) || new Date().toISOString()}
              )
              ON CONFLICT DO NOTHING
            `;
          }
        } catch (e) {
          report.push(`ERR dispute ${kvDispId}: ${(e as Error).message}`);
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

    // ── Migrate vault entries from KV (ta-vault-v5) ──
    report.push(`\n--- Vault / Args / Beliefs / Translations ---`);
    const vaultTypes = [
      { kvKey: "ta-vault-v5", table: "vault_entries", fields: ["assertion", "evidence"] },
      { kvKey: "ta-args-v5", table: "arguments", fields: ["content"] },
      { kvKey: "ta-beliefs-v5", table: "beliefs", fields: ["content"] },
      { kvKey: "ta-trans-v5", table: "translations", fields: ["originalText", "translatedText", "translationType"] },
    ];
    for (const vt of vaultTypes) {
      const kvRows = await sql`SELECT key, value FROM kv_store WHERE key = ${vt.kvKey}`;
      for (const kvRow of kvRows.rows) {
        if (!kvRow.value) continue;
        let entries: Record<string, Record<string, unknown>>;
        try { entries = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; } catch { continue; }

        let vaultMigrated = 0;
        for (const [kvId, entry] of Object.entries(entries)) {
          const newId = toUuid(kvId);
          const submitter = entry.submittedBy as string;
          if (!submitter) continue;
          const userId = await resolveUserId(submitter);
          if (!userId) { report.push(`WARN ${vt.table} ${kvId}: submitter @${submitter} not found`); continue; }

          const kvOrgId = entry.orgId as string;
          const resolvedOrgId = kvOrgId ? await resolveOrgId(kvOrgId, entry.orgName as string | undefined) : null;

          // Check for linked submission
          const kvSubId = entry.submissionId as string;
          const resolvedSubId = kvSubId ? (subIdMap[kvSubId] || toUuid(kvSubId)) : null;

          try {
            if (vt.table === "vault_entries") {
              await sql`
                INSERT INTO vault_entries (id, org_id, submission_id, submitted_by, assertion, evidence, status, survival_count, approved_at, created_at)
                VALUES (${newId}, ${resolvedOrgId}, ${resolvedSubId}, ${userId},
                  ${(entry.assertion as string) || ''}, ${(entry.evidence as string) || ''},
                  ${(entry.status as string) || 'pending'}, ${(entry.survivalCount as number) || 0},
                  ${(entry.approvedAt as string) || null}, ${(entry.createdAt as string) || new Date().toISOString()})
                ON CONFLICT (id) DO NOTHING
              `;
            } else if (vt.table === "arguments") {
              await sql`
                INSERT INTO arguments (id, org_id, submission_id, submitted_by, content, status, survival_count, approved_at, created_at)
                VALUES (${newId}, ${resolvedOrgId}, ${resolvedSubId}, ${userId},
                  ${(entry.content as string) || ''}, ${(entry.status as string) || 'pending'},
                  ${(entry.survivalCount as number) || 0}, ${(entry.approvedAt as string) || null},
                  ${(entry.createdAt as string) || new Date().toISOString()})
                ON CONFLICT (id) DO NOTHING
              `;
            } else if (vt.table === "beliefs") {
              await sql`
                INSERT INTO beliefs (id, org_id, submission_id, submitted_by, content, status, survival_count, approved_at, created_at)
                VALUES (${newId}, ${resolvedOrgId}, ${resolvedSubId}, ${userId},
                  ${(entry.content as string) || ''}, ${(entry.status as string) || 'pending'},
                  ${(entry.survivalCount as number) || 0}, ${(entry.approvedAt as string) || null},
                  ${(entry.createdAt as string) || new Date().toISOString()})
                ON CONFLICT (id) DO NOTHING
              `;
            } else if (vt.table === "translations") {
              await sql`
                INSERT INTO translations (id, org_id, submission_id, submitted_by, original_text, translated_text, translation_type, status, survival_count, approved_at, created_at)
                VALUES (${newId}, ${resolvedOrgId}, ${resolvedSubId}, ${userId},
                  ${(entry.originalText as string) || ''}, ${(entry.translatedText as string) || ''},
                  ${(entry.translationType as string) || 'clarity'}, ${(entry.status as string) || 'pending'},
                  ${(entry.survivalCount as number) || 0}, ${(entry.approvedAt as string) || null},
                  ${(entry.createdAt as string) || new Date().toISOString()})
                ON CONFLICT (id) DO NOTHING
              `;
            }
            vaultMigrated++;
            migratedCount++;
          } catch (e) {
            report.push(`ERR ${vt.table} ${kvId}: ${(e as Error).message}`);
          }
        }
        report.push(`${vt.table}: processed ${Object.keys(entries).length} entries (migrated ${vaultMigrated})`);
      }
    }

    // ── Migrate membership applications from KV (ta-apps-v5) ──
    report.push(`\n--- Membership Applications ---`);
    const kvApps = await sql`SELECT key, value FROM kv_store WHERE key = 'ta-apps-v5'`;
    for (const kvRow of kvApps.rows) {
      if (!kvRow.value) continue;
      let appsObj: Record<string, Record<string, unknown>>;
      try { appsObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; } catch { continue; }

      let appsMigrated = 0;
      for (const [kvAppId, app] of Object.entries(appsObj)) {
        const newAppId = toUuid(kvAppId);
        const applicantUsername = app.userId as string;
        if (!applicantUsername) continue;
        const applicantId = await resolveUserId(applicantUsername);
        if (!applicantId) { report.push(`WARN app ${kvAppId}: applicant @${applicantUsername} not found`); continue; }

        const kvOrgId = app.orgId as string;
        const resolvedOrgId = kvOrgId ? await resolveOrgId(kvOrgId, app.orgName as string | undefined) : null;
        if (!resolvedOrgId) { report.push(`WARN app ${kvAppId}: org ${kvOrgId} not found`); continue; }

        try {
          await sql`
            INSERT INTO membership_applications (id, user_id, org_id, reason, link, mode, sponsors_needed, founder_approved, status, created_at)
            VALUES (${newAppId}, ${applicantId}, ${resolvedOrgId},
              ${(app.reason as string) || null}, ${(app.link as string) || null},
              ${(app.mode as string) || 'open'}, ${(app.sponsorsNeeded as number) || 0},
              ${(app.founderApproved as boolean) || null}, ${(app.status as string) || 'pending'},
              ${(app.createdAt as string) || new Date().toISOString()})
            ON CONFLICT (id) DO NOTHING
          `;
          // Migrate sponsors
          const sponsors = (app.sponsors || []) as string[];
          for (const sponsorUsername of sponsors) {
            const sponsorId = await resolveUserId(sponsorUsername);
            if (!sponsorId) continue;
            await sql`
              INSERT INTO application_sponsors (id, application_id, sponsor_id, sponsored_at)
              VALUES (gen_random_uuid(), ${newAppId}, ${sponsorId}, ${(app.createdAt as string) || new Date().toISOString()})
              ON CONFLICT (application_id, sponsor_id) DO NOTHING
            `;
          }
          appsMigrated++;
          migratedCount++;
        } catch (e) {
          report.push(`ERR app ${kvAppId}: ${(e as Error).message}`);
        }
      }
      report.push(`Applications: processed ${Object.keys(appsObj).length} entries (migrated ${appsMigrated})`);
    }

    // ── Migrate DI requests from KV (ta-di-requests) ──
    report.push(`\n--- DI Requests ---`);
    const kvDiReqs = await sql`SELECT key, value FROM kv_store WHERE key = 'ta-di-requests'`;
    for (const kvRow of kvDiReqs.rows) {
      if (!kvRow.value) continue;
      let diReqsObj: Record<string, Record<string, unknown>>;
      try { diReqsObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; } catch { continue; }

      let diReqsMigrated = 0;
      for (const [kvReqKey, req] of Object.entries(diReqsObj)) {
        const diUsername = (req.diUsername as string) || kvReqKey;
        const partnerUsername = req.partnerUsername as string;
        if (!diUsername || !partnerUsername) continue;

        const diUserId = await resolveUserId(diUsername);
        const partnerUserId = await resolveUserId(partnerUsername);
        if (!diUserId || !partnerUserId) {
          report.push(`WARN DI request ${kvReqKey}: @${diUsername} or @${partnerUsername} not found`);
          continue;
        }

        const existing = await sql`
          SELECT id FROM di_requests WHERE di_user_id = ${diUserId} AND partner_user_id = ${partnerUserId}
        `;
        if (existing.rows.length > 0) continue;

        try {
          await sql`
            INSERT INTO di_requests (id, di_user_id, partner_user_id, status, created_at)
            VALUES (gen_random_uuid(), ${diUserId}, ${partnerUserId},
              ${(req.status as string) || 'pending'},
              ${(req.createdAt as string) || new Date().toISOString()})
          `;
          diReqsMigrated++;
          migratedCount++;

          // If status is approved, also set the DI partnership on user records
          if (req.status === "approved") {
            await sql`UPDATE users SET di_partner_id = ${partnerUserId}, is_di = TRUE, di_approved = TRUE WHERE id = ${diUserId} AND di_partner_id IS NULL`;
            await sql`UPDATE users SET di_partner_id = ${diUserId} WHERE id = ${partnerUserId} AND di_partner_id IS NULL`;
            report.push(`OK: DI partnership @${diUsername} ↔ @${partnerUsername} (from approved KV request)`);
          }
        } catch (e) {
          report.push(`ERR DI request ${kvReqKey}: ${(e as Error).message}`);
        }
      }
      report.push(`DI Requests: processed ${Object.keys(diReqsObj).length} entries (migrated ${diReqsMigrated})`);
    }

    // ── Reconcile DI partnerships on user records ──
    // KV migration may not have carried di_partner_id to user records.
    // Infer from: (1) submissions with is_di + di_partner_id, (2) KV user data, (3) di_requests table.
    report.push(`\n--- DI Partnership Reconciliation ---`);

    // Strategy 1: Infer from submissions
    const diSubs = await sql`
      SELECT DISTINCT s.submitted_by, s.di_partner_id
      FROM submissions s
      WHERE s.is_di = TRUE AND s.di_partner_id IS NOT NULL
    `;
    for (const row of diSubs.rows) {
      const diUserId = row.submitted_by as string;
      const partnerId = row.di_partner_id as string;
      // Set di_partner_id on the DI user (the submitter) if missing
      const diUser = await sql`SELECT id, username, di_partner_id FROM users WHERE id = ${diUserId}`;
      if (diUser.rows.length > 0 && !diUser.rows[0].di_partner_id) {
        await sql`UPDATE users SET di_partner_id = ${partnerId}, is_di = TRUE, di_approved = TRUE WHERE id = ${diUserId}`;
        report.push(`OK: Set di_partner_id on DI user @${diUser.rows[0].username} (inferred from submissions)`);
        migratedCount++;
      }
      // Set di_partner_id on the human partner if missing
      const partnerUser = await sql`SELECT id, username, di_partner_id FROM users WHERE id = ${partnerId}`;
      if (partnerUser.rows.length > 0 && !partnerUser.rows[0].di_partner_id) {
        await sql`UPDATE users SET di_partner_id = ${diUserId} WHERE id = ${partnerId}`;
        report.push(`OK: Set di_partner_id on partner @${partnerUser.rows[0].username} (inferred from submissions)`);
        migratedCount++;
      }
    }

    // Strategy 2: Infer from KV store user data (ta-u-* keys)
    const kvUsers = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'ta-u-%'`;
    for (const kvRow of kvUsers.rows) {
      if (!kvRow.value) continue;
      let usersObj: Record<string, Record<string, unknown>>;
      try { usersObj = typeof kvRow.value === "string" ? JSON.parse(kvRow.value) : kvRow.value; } catch { continue; }

      for (const [uname, udata] of Object.entries(usersObj)) {
        if (!udata.diPartner) continue;
        const diPartnerUsername = udata.diPartner as string;
        const userId = await resolveUserId(uname);
        const partnerId = await resolveUserId(diPartnerUsername);
        if (!userId || !partnerId) {
          report.push(`WARN: KV user @${uname} has diPartner @${diPartnerUsername} but one/both not found in users table`);
          continue;
        }
        // Update the user's di_partner_id if missing
        const userRec = await sql`SELECT di_partner_id FROM users WHERE id = ${userId}`;
        if (userRec.rows.length > 0 && !userRec.rows[0].di_partner_id) {
          const isDI = udata.isDI === true;
          if (isDI) {
            await sql`UPDATE users SET di_partner_id = ${partnerId}, is_di = TRUE, di_approved = TRUE WHERE id = ${userId}`;
          } else {
            await sql`UPDATE users SET di_partner_id = ${partnerId} WHERE id = ${userId}`;
          }
          report.push(`OK: Set di_partner_id on @${uname} → @${diPartnerUsername} (from KV user data)`);
          migratedCount++;
        }
      }
    }

    // Strategy 3: Infer from approved di_requests
    const approvedReqs = await sql`
      SELECT di_user_id, partner_user_id FROM di_requests WHERE status = 'approved'
    `;
    for (const row of approvedReqs.rows) {
      const diUserId = row.di_user_id as string;
      const partnerId = row.partner_user_id as string;
      const diUser = await sql`SELECT id, username, di_partner_id FROM users WHERE id = ${diUserId}`;
      if (diUser.rows.length > 0 && !diUser.rows[0].di_partner_id) {
        await sql`UPDATE users SET di_partner_id = ${partnerId}, is_di = TRUE, di_approved = TRUE WHERE id = ${diUserId}`;
        report.push(`OK: Set di_partner_id on @${diUser.rows[0].username} (from approved di_request)`);
        migratedCount++;
      }
      const partnerUser = await sql`SELECT id, username, di_partner_id FROM users WHERE id = ${partnerId}`;
      if (partnerUser.rows.length > 0 && !partnerUser.rows[0].di_partner_id) {
        await sql`UPDATE users SET di_partner_id = ${diUserId} WHERE id = ${partnerId}`;
        report.push(`OK: Set di_partner_id on @${partnerUser.rows[0].username} (from approved di_request)`);
        migratedCount++;
      }
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
