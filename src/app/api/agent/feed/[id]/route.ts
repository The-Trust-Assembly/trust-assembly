import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { fetchSubstackFeed } from "@/lib/agent/substack-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/agent/feed/[id]
// --------------------------
// Fetches and parses the Substack RSS feed for a Phantom agent instance.
// Returns the feed title, description, and a list of recent posts.
// The client shows these posts in the Phantom dashboard so the user
// can select which ones to analyze.
//
// Also returns the agent's config so the client knows the current
// substackUrl without an extra API call.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT id, type, name, config, status
      FROM agent_instances
      WHERE id = ${params.id} AND user_id = ${admin.sub}
      LIMIT 1
    `;
    if (result.rows.length === 0) return notFound("Agent instance not found");

    const agent = result.rows[0];
    if (agent.type !== "phantom") {
      return err("This endpoint is only for Phantom agents", 400);
    }

    const config = agent.config || {};
    const substackUrl = config.substackUrl;
    if (!substackUrl) {
      return err("No Substack URL configured. Update this agent's settings first.", 400);
    }

    const feed = await fetchSubstackFeed(substackUrl);

    return ok({
      agent: { id: agent.id, name: agent.name, status: agent.status },
      feed,
    });
  } catch (e) {
    return serverError(`/api/agent/feed/${params.id}`, e);
  }
}

// POST /api/agent/feed/[id]
// ---------------------------
// Analyzes selected posts from a Phantom agent's Substack feed.
// Creates a new agent_run with the selected post URLs and kicks off
// the pipeline (fetch → analyze → synthesize — skipping search/filter
// since we already know the URLs).
//
// Body: { postUrls: string[], thesis?: string }
//
// If thesis is not provided, a default thesis is generated from the
// feed title and agent domain (e.g. "Fact-check recent posts from
// Glenn Greenwald's Substack on Press & Media").
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const postUrls = Array.isArray(body.postUrls)
    ? (body.postUrls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0
      )
    : [];

  if (postUrls.length === 0) {
    return err("postUrls is required and must contain at least one URL");
  }
  if (postUrls.length > 20) {
    return err("Maximum 20 posts per scan");
  }

  try {
    const agentResult = await sql`
      SELECT id, type, name, domain, config
      FROM agent_instances
      WHERE id = ${params.id} AND user_id = ${admin.sub}
      LIMIT 1
    `;
    if (agentResult.rows.length === 0) return notFound("Agent instance not found");

    const agent = agentResult.rows[0];
    if (agent.type !== "phantom") {
      return err("This endpoint is only for Phantom agents", 400);
    }

    // Build a thesis for the run
    const thesis =
      typeof body.thesis === "string" && body.thesis.trim()
        ? body.thesis.trim()
        : `Fact-check recent posts from ${agent.name}${agent.domain ? " on " + agent.domain : ""}`;

    // Create the run with postUrls stored in context
    const runResult = await sql`
      INSERT INTO agent_runs (
        user_id, agent_instance_id, thesis, scope, context,
        status, stage_message
      )
      VALUES (
        ${admin.sub}, ${agent.id}, ${thesis}, 'phantom-feed',
        ${JSON.stringify({ postUrls, phantomAgentId: agent.id })},
        'queued', 'Queued — Phantom feed scan'
      )
      RETURNING id, status, created_at
    `;

    const run = runResult.rows[0];

    // Fire-and-forget pipeline kickoff
    // The process route detects scope='phantom-feed' and skips
    // search/filter, going directly to fetch → analyze → synthesize
    const processUrl = new URL(
      `/api/agent/process/${run.id}`,
      request.url
    ).toString();

    fetch(processUrl, {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
    }).catch(() => {});

    return ok({
      runId: run.id,
      status: run.status,
      createdAt: run.created_at,
      postCount: postUrls.length,
    });
  } catch (e) {
    return serverError(`/api/agent/feed/${params.id} POST`, e);
  }
}
