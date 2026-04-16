import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// POST /api/agent/ward/[id]
// ---------------------------
// Triggers a Ward scan for all monitored entities. Auto-generates a
// thesis and keywords from the entity list + agent domain, then creates
// a run with scope='ward-scan'. The process route picks this up and
// runs the standard Sentinel pipeline (keywords → search → filter →
// fetch → analyze → synthesize).
//
// Body (optional):
//   thesis — override the auto-generated thesis
//
// The Ward differs from Sentinel only in how the thesis/keywords are
// sourced: Sentinel gets them from the user; Ward auto-derives them
// from the monitored entities config.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — all fields are optional
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
    if (agent.type !== "ward") {
      return err("This endpoint is only for Ward agents", 400);
    }

    const config = agent.config || {};
    const entities: string[] = Array.isArray(config.monitoredEntities)
      ? config.monitoredEntities
      : [];

    if (entities.length === 0) {
      return err(
        "No monitored entities configured. Update this agent's settings to add entities to watch.",
        400
      );
    }

    // Auto-generate thesis from entities
    const thesis =
      typeof body.thesis === "string" && body.thesis.trim()
        ? body.thesis.trim()
        : `Monitor web mentions of ${entities.join(", ")} for factual accuracy${
            agent.domain ? " in the context of " + agent.domain : ""
          }.`;

    // Auto-generate keywords: each entity name becomes a keyword, plus
    // entity + domain combinations for more targeted search
    const keywords: string[] = [];
    for (const entity of entities) {
      keywords.push(entity);
      if (agent.domain) {
        keywords.push(`${entity} ${agent.domain}`);
      }
      // Add a "news" variant to surface recent coverage
      keywords.push(`${entity} news`);
    }
    // Deduplicate
    const uniqueKeywords = [...new Set(keywords)].slice(0, 15);

    // Create the run
    const runResult = await sql`
      INSERT INTO agent_runs (
        user_id, agent_instance_id, thesis, scope, context,
        status, stage_message
      )
      VALUES (
        ${admin.sub}, ${agent.id}, ${thesis}, 'ward-scan',
        ${JSON.stringify({ entities, keywords: uniqueKeywords, wardAgentId: agent.id })},
        'queued', 'Queued — Ward entity scan'
      )
      RETURNING id, status, created_at
    `;

    const run = runResult.rows[0];

    // Fire-and-forget pipeline kickoff
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
      entities: entities.length,
      keywords: uniqueKeywords.length,
    });
  } catch (e) {
    return serverError(`/api/agent/ward/${params.id} POST`, e);
  }
}
