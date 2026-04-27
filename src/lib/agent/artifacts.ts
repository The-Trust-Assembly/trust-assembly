// Trust Assembly Agent — artifact storage
// -------------------------------------------
// Per-phase, per-article storage for pipeline progress. Each artifact
// is one row in agent_run_artifacts — written incrementally so progress
// survives timeouts and concurrent runs don't contend on a single blob.

import { sql } from "@/lib/db";

export async function saveArtifact(
  runId: string,
  phase: string,
  artifactType: string,
  data: unknown,
  articleUrl?: string
): Promise<void> {
  await sql`
    INSERT INTO agent_run_artifacts (run_id, phase, artifact_type, article_url, data)
    VALUES (${runId}, ${phase}, ${artifactType}, ${articleUrl || null}, ${JSON.stringify(data)})
  `;
}

export async function saveArtifacts(
  runId: string,
  phase: string,
  artifactType: string,
  items: Array<{ url?: string; data: unknown }>
): Promise<void> {
  for (const item of items) {
    await saveArtifact(runId, phase, artifactType, item.data, item.url);
  }
}

export async function getArtifacts(
  runId: string,
  artifactType: string
): Promise<Array<{ id: string; article_url: string | null; data: unknown; created_at: string }>> {
  const result = await sql`
    SELECT id, article_url, data, created_at
    FROM agent_run_artifacts
    WHERE run_id = ${runId} AND artifact_type = ${artifactType}
    ORDER BY created_at ASC
  `;
  return result.rows as Array<{ id: string; article_url: string | null; data: unknown; created_at: string }>;
}

export async function getArtifactsByPhase(
  runId: string,
  phase: string
): Promise<Array<{ id: string; artifact_type: string; article_url: string | null; data: unknown }>> {
  const result = await sql`
    SELECT id, artifact_type, article_url, data
    FROM agent_run_artifacts
    WHERE run_id = ${runId} AND phase = ${phase}
    ORDER BY created_at ASC
  `;
  return result.rows as Array<{ id: string; artifact_type: string; article_url: string | null; data: unknown }>;
}

export async function hasArtifact(
  runId: string,
  artifactType: string,
  articleUrl: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM agent_run_artifacts
    WHERE run_id = ${runId} AND artifact_type = ${artifactType} AND article_url = ${articleUrl}
    LIMIT 1
  `;
  return result.rows.length > 0;
}

export async function countArtifacts(
  runId: string,
  artifactType: string
): Promise<number> {
  const result = await sql`
    SELECT COUNT(*)::int AS count FROM agent_run_artifacts
    WHERE run_id = ${runId} AND artifact_type = ${artifactType}
  `;
  return result.rows[0]?.count || 0;
}
