import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";
import {
  TRUSTED_STREAK, CROSS_GROUP_DECEPTION_MULT, JURY_POOL_MULTIPLIER,
  WILD_WEST_THRESHOLD, getJurySize, getSuperJurySize, getMajority,
} from "@/lib/jury-rules";
import { MAX_LENGTHS } from "@/lib/validation";
import { NextRequest } from "next/server";

// Enrollment mode thresholds (mirrors spa/lib/permissions.js checkEnrollment)
function getEnrollment(memberCount: number) {
  if (memberCount <= 50) return { mode: "tribal", sponsors: 0, label: "Founder Approval" };
  if (memberCount <= 99) return { mode: "open", sponsors: 0, label: "Open Enrollment" };
  if (memberCount <= 999) return { mode: "sponsor", sponsors: 1, label: "1 Sponsor Required" };
  if (memberCount <= 9999) return { mode: "sponsor", sponsors: 2, label: "2 Sponsors Required" };
  return { mode: "sponsor", sponsors: 3, label: "3 Sponsors Required" };
}

// Cross-group jury size (mirrors spa/lib/jury.js getCrossGroupJurySize)
function getCrossGroupJurySize(qualifyingCount: number): number {
  if (qualifyingCount >= 100) return 13;
  if (qualifyingCount >= 51) return 11;
  if (qualifyingCount >= 21) return 9;
  if (qualifyingCount >= 13) return 7;
  if (qualifyingCount >= 8) return 5;
  return 3;
}

// DI submission limit (mirrors spa/lib/permissions.js getDISubmissionLimit)
function getDISubmissionLimit(memberCount: number): number {
  return Math.min(100, Math.floor(memberCount / 2));
}

// GET /api/admin/active-rules — returns all active rules based on current system state
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    // Query current system metrics
    const [usersResult, orgsResult] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM users`,
      sql`
        SELECT o.id, o.name, o.is_general_public,
          (SELECT COUNT(*) FROM organization_members WHERE org_id = o.id AND is_active = TRUE) AS member_count
        FROM organizations o
        ORDER BY is_general_public DESC, member_count DESC
      `,
    ]);

    const totalUsers = parseInt(usersResult.rows[0].count);
    const wildWest = totalUsers < WILD_WEST_THRESHOLD;

    // Compute per-assembly rules
    const assemblies = orgsResult.rows.map((o: Record<string, unknown>) => {
      const members = parseInt(o.member_count as string);
      const enrollment = getEnrollment(members);
      return {
        name: o.name,
        isGeneralPublic: o.is_general_public,
        members,
        jurySize: wildWest ? 1 : getJurySize(members),
        superJurySize: getSuperJurySize(members),
        majority: wildWest ? 1 : getMajority(getJurySize(members)),
        enrollment: enrollment.label,
        enrollmentMode: enrollment.mode,
        sponsorsRequired: enrollment.sponsors,
        diSubmissionLimit: getDISubmissionLimit(members),
        jurySelectionRules: {
          joinDateFilter: members >= 500,
          noRepeatReviewer: members >= 100,
          demographicDiversity: members >= 100,
          cooldown24h: members >= 1000,
        },
      };
    });

    // Cross-group status
    const qualifyingAssemblies = assemblies.filter((a: { members: number }) => a.members >= 100).length;
    const crossGroupActive = qualifyingAssemblies >= 5;

    return ok({
      generatedAt: new Date().toISOString(),
      systemMode: {
        wildWest,
        totalUsers,
        wildWestThreshold: WILD_WEST_THRESHOLD,
        wildWestEffects: wildWest
          ? ["1 reviewer per submission (instead of full jury)", "Deliberate deception findings disabled", "Self-review and DI-partner restrictions remain"]
          : [],
      },
      crossGroup: {
        active: crossGroupActive,
        qualifyingAssemblies,
        requiredAssemblies: 5,
        qualifyingThreshold: 100,
        crossGroupJurySize: crossGroupActive ? getCrossGroupJurySize(qualifyingAssemblies) : null,
        crossGroupMajority: crossGroupActive ? getMajority(getCrossGroupJurySize(qualifyingAssemblies)) : null,
        maxSharedAssemblies: 2,
      },
      assemblies,
      globalRules: {
        trustedStreak: TRUSTED_STREAK,
        deceptionPenaltyDays: 365,
        crossGroupDeceptionMult: CROSS_GROUP_DECEPTION_MULT,
        juryPoolMultiplier: JURY_POOL_MULTIPLIER,
        maxAssembliesPerUser: 12,
        maxDrafts: 10,
        maxInlineEdits: 20,
        sponsorMinReviews: 10,
        sponsorMinTenureDays: 30,
      },
      scoringWeights: {
        win: 1.0,
        disputeWin: 2.0,
        streakInterval: 3,
        qualityDivisor: 10,
        qualityCap: 1.6,
        qualityExp: 1.5,
        lossDrag: 2.0,
        lieDrag: 3.0,
        failedDisputeDrag: 2.0,
        vindicationBase: 10.0,
        persistenceExp: 1.5,
      },
      concessionRecovery: [
        { window: "1 week (1st)", recovery: "100%" },
        { window: "1 week (2nd+)", recovery: "90%" },
        { window: "2 weeks", recovery: "90%" },
        { window: "1 month", recovery: "50%" },
        { window: "3 months", recovery: "25%" },
        { window: "After 3 months", recovery: "5%" },
      ],
      rateLimits: {
        loginAttempts: "5 per 60s per IP",
        registrations: "3 per hour per IP",
      },
      fieldLimits: MAX_LENGTHS,
    });
  } catch (e) {
    return serverError("GET /api/admin/active-rules", e);
  }
}
