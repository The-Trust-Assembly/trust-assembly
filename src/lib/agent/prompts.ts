// Trust Assembly Agent — prompt loader
// ----------------------------------------
// Reads prompt templates from the agent_prompts table. Falls back
// to hardcoded defaults if the table doesn't exist or the key isn't
// found. This lets the admin edit prompts from the dashboard without
// redeploying.
//
// Supports {{VARIABLE}} placeholder substitution.

import { sql } from "@/lib/db";

const cache = new Map<string, { body: string; loadedAt: number }>();
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
      SELECT body FROM agent_prompts WHERE key = ${key} LIMIT 1
    `;
    if (result.rows.length > 0 && result.rows[0].body) {
      const body = result.rows[0].body;
      cache.set(key, { body, loadedAt: Date.now() });
      return applyVariables(body, variables);
    }
  } catch {
    // Table might not exist yet — use fallback
  }

  return applyVariables(fallback, variables);
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
