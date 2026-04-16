import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import type {
  AgentBatch,
  SubmissionForReview,
  VaultEntryForReview,
} from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/agent/run/[id]/submit
// --------------------------------
// Submits an approved batch from a 'ready' agent run via the existing
// /api/submissions and /api/vault endpoints. The client may pass an
// EDITED batch in the body — if omitted, we use the batch as stored
// in agent_runs.batch.
//
// Body: {
//   orgIds: string[],            // assemblies to file to (required)
//   submissions?: SubmissionForReview[], // edited submissions (optional)
//   vaultEntries?: VaultEntryForReview[], // edited vault entries (optional)
// }
//
// Response: { submitted: number, vaultCreated: number, errors: [...] }
//
// On success the run is marked as 'completed'. Failures are non-fatal —
// individual submission errors are collected and returned but the run
// still completes (so the user can manually retry just the failures).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const body = await request.json().catch(() => ({}));
  const orgIds: string[] = Array.isArray(body.orgIds) ? body.orgIds : [];
  if (orgIds.length === 0) return err("orgIds is required");

  // Load the run, scoped to owner
  const loadResult = await sql`
    SELECT id, status, batch
    FROM agent_runs
    WHERE id = ${params.id} AND user_id = ${admin.sub}
    LIMIT 1
  `;
  if (loadResult.rows.length === 0) return notFound("Run not found");

  const run = loadResult.rows[0];
  if (run.status !== "ready") {
    return err(`Run is in status '${run.status}', expected 'ready'`, 409);
  }

  const storedBatch: AgentBatch = run.batch || { submissions: [], vaultEntries: [], narrative: "" };

  // Use edited batch from body if provided, otherwise use stored batch
  const submissions: SubmissionForReview[] = Array.isArray(body.submissions)
    ? body.submissions
    : storedBatch.submissions || [];
  const vaultEntries: VaultEntryForReview[] = Array.isArray(body.vaultEntries)
    ? body.vaultEntries
    : storedBatch.vaultEntries || [];

  // Mark run as submitting so the dashboard reflects the in-progress state
  await sql`
    UPDATE agent_runs
    SET status = 'submitting',
        stage_message = 'Filing submissions and vault entries...',
        updated_at = now()
    WHERE id = ${run.id}
  `;

  // Internal fetch helper — reuses /api/submissions and /api/vault so
  // we don't duplicate transaction/validation/slug/jury logic. We pass
  // through the cookie header so the inner endpoints see the same
  // authenticated session as this request.
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get("cookie") || "";
  const authHeader = request.headers.get("authorization") || "";

  async function internalPost(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cookieHeader) headers.cookie = cookieHeader;
    if (authHeader) headers.authorization = authHeader;
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  const errors: Array<{ kind: string; identifier: string; error: string }> = [];
  let submittedCount = 0;
  let vaultCreatedCount = 0;

  // ---- File submissions ----
  for (const sub of submissions) {
    if (!sub.approved) continue;
    if (sub.analysis.verdict === "skip") continue;

    const payload: Record<string, unknown> = {
      submissionType: sub.analysis.verdict, // "correction" or "affirmation"
      url: sub.url,
      originalHeadline: sub.analysis.originalHeadline || sub.headline,
      reasoning: sub.analysis.reasoning,
      orgIds,
    };
    if (sub.analysis.verdict === "correction" && sub.analysis.replacement) {
      payload.replacement = sub.analysis.replacement;
    }
    if (sub.analysis.evidence && sub.analysis.evidence.length > 0) {
      payload.evidence = sub.analysis.evidence.map((e) => ({
        url: e.url || "",
        explanation: e.description || "",
      }));
    }
    if (sub.analysis.inlineEdits && sub.analysis.inlineEdits.length > 0) {
      payload.inlineEdits = sub.analysis.inlineEdits.map((e) => ({
        original: e.originalText,
        replacement: e.correctedText,
        reasoning: e.explanation,
      }));
    }

    const result = await internalPost("/api/submissions", payload);
    if (result.ok) {
      submittedCount++;
    } else {
      const errMsg =
        (result.data as { error?: string })?.error || `HTTP ${result.status}`;
      errors.push({ kind: "submission", identifier: sub.url, error: errMsg });
    }
  }

  // ---- File vault entries ----
  for (const ve of vaultEntries) {
    if (!ve.approved) continue;

    const entry = ve.entry;
    const payload: Record<string, unknown> = { orgIds, type: entry.type };
    if (entry.type === "vault") {
      if (!entry.assertion || !entry.evidence) {
        errors.push({ kind: "vault", identifier: ve.id, error: "Missing assertion or evidence" });
        continue;
      }
      payload.assertion = entry.assertion;
      payload.evidence = entry.evidence;
    } else if (entry.type === "argument") {
      if (!entry.content) {
        errors.push({ kind: "argument", identifier: ve.id, error: "Missing content" });
        continue;
      }
      payload.content = entry.content;
    } else if (entry.type === "translation") {
      if (!entry.original || !entry.translated || !entry.translationType) {
        errors.push({ kind: "translation", identifier: ve.id, error: "Missing translation fields" });
        continue;
      }
      payload.original = entry.original;
      payload.translated = entry.translated;
      payload.translationType = entry.translationType;
    } else {
      errors.push({ kind: "vault", identifier: ve.id, error: `Unknown type: ${entry.type}` });
      continue;
    }

    const result = await internalPost("/api/vault", payload);
    if (result.ok) {
      vaultCreatedCount++;
    } else {
      const errMsg =
        (result.data as { error?: string })?.error || `HTTP ${result.status}`;
      errors.push({ kind: entry.type, identifier: ve.id, error: errMsg });
    }
  }

  // Mark run as completed regardless of partial errors. The errors are
  // returned to the client; the user can decide whether to retry.
  try {
    await sql`
      UPDATE agent_runs
      SET status = 'completed',
          stage_message = ${`Submitted ${submittedCount} corrections/affirmations and ${vaultCreatedCount} vault entries.${errors.length > 0 ? ` ${errors.length} errors.` : ""}`},
          progress_pct = 100,
          updated_at = now(),
          completed_at = now()
      WHERE id = ${run.id}
    `;
  } catch (e) {
    return serverError(`/api/agent/run/${params.id}/submit`, e);
  }

  return ok({
    runId: run.id,
    submitted: submittedCount,
    vaultCreated: vaultCreatedCount,
    errors,
  });
}
