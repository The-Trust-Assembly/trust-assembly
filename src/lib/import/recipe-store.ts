// Trust Assembly Import Service — recipe store
// ------------------------------------------------
// Persistence for LLM-generated extraction recipes (import_recipes)
// and import telemetry (import_logs). Every call is wrapped so a
// missing table (migration 026 not yet run) or DB hiccup can never
// break an import — the service just runs without persistence.

import { sql } from "@/lib/db";

export interface StoredRecipe {
  domain: string;
  recipe: Record<string, unknown>;
  confidence: number;
  updatedAt: Date;
}

// In-memory cache so repeat imports of the same domain skip the DB
const cache = new Map<string, { stored: StoredRecipe | null; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getStoredRecipe(domain: string): Promise<StoredRecipe | null> {
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.stored;

  try {
    const result = await sql`
      SELECT domain, recipe, confidence, updated_at
      FROM import_recipes WHERE domain = ${domain} LIMIT 1
    `;
    const row = result.rows[0];
    const stored: StoredRecipe | null = row
      ? {
          domain: row.domain,
          recipe: row.recipe as Record<string, unknown>,
          confidence: Number(row.confidence || 0),
          updatedAt: new Date(row.updated_at),
        }
      : null;
    cache.set(domain, { stored, loadedAt: Date.now() });
    return stored;
  } catch {
    return null; // table missing or DB unavailable
  }
}

export async function saveRecipe(
  domain: string,
  recipe: Record<string, unknown>,
  confidence: number
): Promise<void> {
  cache.set(domain, {
    stored: { domain, recipe, confidence, updatedAt: new Date() },
    loadedAt: Date.now(),
  });
  try {
    await sql`
      INSERT INTO import_recipes (domain, recipe, confidence)
      VALUES (${domain}, ${JSON.stringify(recipe)}, ${confidence})
      ON CONFLICT (domain) DO UPDATE
      SET recipe = EXCLUDED.recipe,
          confidence = EXCLUDED.confidence,
          generations = import_recipes.generations + 1,
          updated_at = now()
    `;
  } catch { /* persistence is best-effort */ }
}

export async function logImport(entry: {
  domain: string;
  url: string;
  success: boolean;
  confidence: number;
  fieldsFound: string[];
  bodyChars: number;
  recipeSource: string;
  fetchError?: string;
}): Promise<void> {
  // TEXT[] params go over the wire as a Postgres array literal
  const fieldsArray = `{${entry.fieldsFound.map((f) => f.replace(/[{}",\\]/g, "")).join(",")}}`;
  try {
    await sql`
      INSERT INTO import_logs (domain, url, success, confidence, fields_found, body_chars, recipe_source, fetch_error)
      VALUES (${entry.domain}, ${entry.url}, ${entry.success}, ${entry.confidence},
              ${fieldsArray}, ${entry.bodyChars},
              ${entry.recipeSource}, ${entry.fetchError || null})
    `;
  } catch { /* telemetry is best-effort */ }
}
