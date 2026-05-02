// Trust Assembly Agent — prompt loader
// ----------------------------------------
// Reads prompt templates from the agent_prompts table. Falls back
// to hardcoded defaults if the table doesn't exist or the key isn't
// found. This lets the admin edit prompts from the dashboard without
// redeploying.
//
// Supports {{VARIABLE}} placeholder substitution.

import { sql } from "@/lib/db";

const cache = new Map<string, { body: string; loadedAt: number; source: "db" | "fallback"; updatedAt?: string }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getPrompt(
  key: string,
  fallback: string,
  variables?: Record<string, string>
): Promise<string> {
  // Check cache
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return applyVariables(cached.body, variables);
  }

  // Try DB
  try {
    const result = await sql`
      SELECT body, updated_at FROM agent_prompts WHERE key = ${key} LIMIT 1
    `;
    if (result.rows.length > 0 && result.rows[0].body) {
      const body = result.rows[0].body;
      cache.set(key, { body, loadedAt: Date.now(), source: "db", updatedAt: result.rows[0].updated_at });
      return applyVariables(body, variables);
    }
  } catch {
    // Table might not exist yet — use fallback
  }

  cache.set(key, { body: fallback, loadedAt: Date.now(), source: "fallback" });
  return applyVariables(fallback, variables);
}

// Returns metadata about which prompts are loaded and their source
export function getPromptVersions(): Record<string, { source: "db" | "fallback"; updatedAt?: string; length: number }> {
  const versions: Record<string, { source: "db" | "fallback"; updatedAt?: string; length: number }> = {};
  for (const [key, entry] of cache.entries()) {
    versions[key] = { source: entry.source, updatedAt: entry.updatedAt, length: entry.body.length };
  }
  return versions;
}

function applyVariables(
  template: string,
  variables?: Record<string, string>
): string {
  if (!variables) return template;
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
