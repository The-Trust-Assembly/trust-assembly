import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/agent/bulk-submit
// ------------------------------
// Accepts a bulk JSON payload with submissions + vault entries and
// files them all via the existing /api/submissions and /api/vault
// endpoints. Deducts 1 credit per submission.
//
// Body: {
//   submissions: Array<{ url, originalHeadline, submissionType, replacement?, reasoning, evidence?, inlineEdits? }>,
//   vaultEntries?: Array<{ type, assertion?, evidence?, content?, original?, translated?, translationType? }>,
//   orgIds: string[]
// }
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const submissions = Array.isArray(body.submissions) ? body.submissions : [];
  const vaultEntries = Array.isArray(body.vaultEntries) ? body.vaultEntries : [];
  const orgIds = Array.isArray(body.orgIds) ? body.orgIds : [];

  if (submissions.length === 0) {
    return err("No submissions provided");
  }
  if (submissions.length > 50) {
    return err("Maximum 50 submissions per bulk upload");
  }
  if (orgIds.length === 0) {
    return err("At least one assembly (orgId) is required");
  }

  // Bulk uploads are free — the user already paid for their own AI.
  // No credit check or deduction needed.

  // Helper to make internal API calls with the user's auth
  async function internalPost(path: string, payload: unknown) {
    const url = new URL(path, request.url).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify(payload),
    });
    let data: unknown;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  const results: Array<{
    index: number;
    type: string;
    url?: string;
    status: "success" | "error";
    error?: string;
    id?: string;
  }> = [];

  let submittedCount = 0;
  let vaultCount = 0;
  const submissionIds: string[] = [];

  // File each submission
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i] as Record<string, unknown>;

    const payload: Record<string, unknown> = {
      submissionType: sub.submissionType,
      url: sub.url,
      originalHeadline: sub.originalHeadline,
      reasoning: sub.reasoning,
      orgIds,
    };
    if (sub.submissionType === "correction" && sub.replacement) {
      payload.replacement = sub.replacement;
    }
    if (Array.isArray(sub.evidence) && sub.evidence.length > 0) {
      payload.evidence = (sub.evidence as Array<Record<string, unknown>>).map((e) => ({
        url: e.url || "",
        explanation: e.description || e.explanation || "",
      }));
    }
    if (Array.isArray(sub.inlineEdits) && sub.inlineEdits.length > 0) {
      payload.inlineEdits = (sub.inlineEdits as Array<Record<string, unknown>>).map((e) => ({
        original: e.original || e.originalText || "",
        replacement: e.replacement || e.correctedText || "",
        reasoning: e.reasoning || e.explanation || "",
      }));
    }

    const result = await internalPost("/api/submissions", payload);
    if (result.ok) {
      submittedCount++;
      const id = (result.data as { id?: string })?.id;
      if (id) submissionIds.push(id);
      results.push({ index: i, type: "submission", url: sub.url as string, status: "success", id });
    } else {
      const errMsg = (result.data as { error?: string })?.error || `HTTP ${result.status}`;
      results.push({ index: i, type: "submission", url: sub.url as string, status: "error", error: errMsg });
    }
  }

  // File vault entries linked to the first submission
  const linkedId = submissionIds.length > 0 ? submissionIds[0] : undefined;

  for (let i = 0; i < vaultEntries.length; i++) {
    const ve = vaultEntries[i] as Record<string, unknown>;

    const payload: Record<string, unknown> = {
      orgIds,
      type: ve.type,
      ...(linkedId ? { submissionId: linkedId } : {}),
    };

    if (ve.type === "vault") {
      payload.assertion = ve.assertion;
      payload.evidence = ve.evidence;
    } else if (ve.type === "argument") {
      payload.content = ve.content;
    } else if (ve.type === "translation") {
      payload.original = ve.original;
      payload.translated = ve.translated;
      payload.translationType = ve.translationType;
    }

    const result = await internalPost("/api/vault", payload);
    if (result.ok) {
      vaultCount++;
      results.push({ index: i, type: ve.type as string, status: "success" });
    } else {
      const errMsg = (result.data as { error?: string })?.error || `HTTP ${result.status}`;
      results.push({ index: i, type: ve.type as string, status: "error", error: errMsg });
    }
  }

  return ok({
    submitted: submittedCount,
    vaultCreated: vaultCount,
    errors: results.filter((r) => r.status === "error"),
    results,
  });
}
