// Runtime schema ensurer for migration 006 (slug columns).
// Uses the same ALTER TABLE ... ADD COLUMN IF NOT EXISTS pattern
// as the disputes route (src/app/api/disputes/route.ts:125-126).
// In-memory flag prevents re-running after the first successful check.

import { sql } from "@/lib/db";

let schemaChecked = false;

export async function ensureSlugsExist(): Promise<void> {
  if (schemaChecked) return;
  try {
    await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug VARCHAR(250)`;
    await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS slug VARCHAR(500)`;
    await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS slug VARCHAR(350)`;
    await sql`ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS slug VARCHAR(350)`;
    schemaChecked = true;
  } catch (e) {
    console.error("[ensure-schema] Failed to ensure slug columns:", e);
  }
}
