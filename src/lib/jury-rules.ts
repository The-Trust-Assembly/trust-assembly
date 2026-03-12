// ============================================================
// Jury rules and constants — shared between API routes
// Mirrors the logic from trust-assembly-v5.jsx so the server
// can resolve votes independently of the client.
// ============================================================

import { sql } from "@/lib/db";

export const TRUSTED_STREAK = 10;
export const CROSS_GROUP_DECEPTION_MULT = 9;
export const JURY_POOL_MULTIPLIER = 3;

// ── Wild West Mode ──
// When the system has fewer than 100 total users, simplified rules apply:
// - Only 1 reviewer per submission (instead of full jury)
// - Deliberate deception findings are disabled
// - Self-review and DI-partner review restrictions remain in effect
export const WILD_WEST_THRESHOLD = 100;

export async function isWildWestMode(): Promise<boolean> {
  const result = await sql`SELECT COUNT(*) AS count FROM users`;
  return parseInt(result.rows[0].count) < WILD_WEST_THRESHOLD;
}

/** Jury size scales with assembly membership */
export function getJurySize(memberCount: number): number {
  if (memberCount >= 10000) return 13;
  if (memberCount >= 1000) return 11;
  if (memberCount >= 101) return 9;
  if (memberCount >= 51) return 7;
  if (memberCount >= 21) return 5;
  return 3;
}

/** Super jury: ~2× regular, always odd, minimum 7 */
export function getSuperJurySize(memberCount: number): number {
  if (memberCount >= 10000) return 17;
  if (memberCount >= 1000) return 15;
  if (memberCount >= 101) return 13;
  if (memberCount >= 51) return 11;
  if (memberCount >= 21) return 9;
  return 7;
}

/** Simple majority: floor(n/2) + 1 */
export function getMajority(jurySize: number): number {
  return Math.floor(jurySize / 2) + 1;
}
