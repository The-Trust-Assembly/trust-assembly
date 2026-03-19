import { sG } from "./storage.js";
import { seededRandom, daysBetween } from "./utils.js";
import {
  SK,
  JURY_POOL_MULTIPLIER,
  WILD_WEST_THRESHOLD,
  CROSS_GROUP_QUALIFYING_SIZE,
  CROSS_GROUP_MIN_ASSEMBLIES,
  MAX_SHARED_ASSEMBLIES,
} from "./constants";

export function getJurySize(memberCount) {
  if (memberCount >= 10000) return 13;
  if (memberCount >= 1000) return 11;
  if (memberCount >= 101) return 9;
  if (memberCount >= 51) return 7;
  if (memberCount >= 21) return 5;
  return 3;
}

// Super jury: ~2× regular, always odd, minimum 7
export function getSuperJurySize(memberCount) {
  if (memberCount >= 10000) return 17;
  if (memberCount >= 1000) return 15;
  if (memberCount >= 101) return 13;
  if (memberCount >= 51) return 11;
  if (memberCount >= 21) return 9;
  return 7;
}

export function getCrossGroupJurySize(qualifyingAssemblyCount) {
  if (qualifyingAssemblyCount >= 100) return 13;
  if (qualifyingAssemblyCount >= 51) return 11;
  if (qualifyingAssemblyCount >= 21) return 9;
  if (qualifyingAssemblyCount >= 13) return 7;
  if (qualifyingAssemblyCount >= 8) return 5;
  return 3; // 5-7 qualifying assemblies
}

// Count non-GP assembly memberships shared between two users
export function sharedNonGPMemberships(userA, userB, gpOrgId) {
  const aOrgs = (userA.orgIds || []).filter(id => id !== gpOrgId);
  const bOrgs = new Set((userB.orgIds || []).filter(id => id !== gpOrgId));
  return aOrgs.filter(id => bOrgs.has(id)).length;
}

export async function selectCrossGroupJury(orgId, submitterUsername) {
  const orgs = (await sG(SK.ORGS)) || {};
  const users = (await sG(SK.USERS)) || {};
  const gpOrgId = await sG(SK.GP);

  // Find qualifying assemblies (100+ members, not the originating one)
  const qualifyingOrgs = Object.entries(orgs).filter(([oid, o]) =>
    oid !== orgId && !o.isGeneralPublic && o.members.length >= CROSS_GROUP_QUALIFYING_SIZE
  );
  const qualifyingCount = qualifyingOrgs.length;
  const rulesApplied = [];

  if (qualifyingCount < CROSS_GROUP_MIN_ASSEMBLIES) {
    return { jurors: [], seed: 0, rulesApplied: [`Insufficient qualifying assemblies (${qualifyingCount}/${CROSS_GROUP_MIN_ASSEMBLIES})`], jurySize: 0, qualifyingCount, error: `Cross-group requires ${CROSS_GROUP_MIN_ASSEMBLIES}+ assemblies with ${CROSS_GROUP_QUALIFYING_SIZE}+ members. Currently: ${qualifyingCount}.` };
  }

  const jurySize = getCrossGroupJurySize(qualifyingCount);
  rulesApplied.push(`${qualifyingCount} qualifying assemblies → ${jurySize}-person jury`);

  // Build pool: all members of qualifying assemblies who are NOT in the originating assembly
  // Also exclude submitter's DI partner and any DIs registered to submitter
  const submitter = users[submitterUsername];
  const diPartner = submitter && submitter.isDI ? submitter.diPartner : null;
  const diAgents = !submitter?.isDI ? Object.values(users).filter(u => u.isDI && u.diPartner === submitterUsername).map(u => u.username) : [];
  const crossExcluded = new Set([submitterUsername, ...(diPartner ? [diPartner] : []), ...diAgents]);
  const originMembers = new Set(orgs[orgId]?.members || []);
  const poolSet = new Set();
  for (const [, o] of qualifyingOrgs) {
    for (const m of o.members) {
      if (!crossExcluded.has(m) && !originMembers.has(m)) poolSet.add(m);
    }
  }
  let pool = [...poolSet];

  if (pool.length < jurySize) {
    return { jurors: [], seed: 0, rulesApplied: [...rulesApplied, "Insufficient non-overlapping jurors"], jurySize, qualifyingCount, error: "Not enough eligible jurors outside originating assembly." };
  }

  // Seed and shuffle
  const seed = Date.now() + Math.floor(Math.random() * 10000);
  const rng = seededRandom(seed);
  const shuffled = [...pool].sort(() => rng() - 0.5);

  // Greedy selection with overlap constraint
  const selected = [];
  const selectedUsers = [];
  rulesApplied.push(`Overlap constraint: ≤${MAX_SHARED_ASSEMBLIES} shared non-GP assemblies per pair`);

  for (const candidate of shuffled) {
    if (selected.length >= jurySize) break;
    const cu = users[candidate];
    if (!cu) continue;

    // Check overlap with every already-selected juror
    const passesOverlap = selectedUsers.every(su =>
      sharedNonGPMemberships(cu, su, gpOrgId) <= MAX_SHARED_ASSEMBLIES
    );

    if (passesOverlap) {
      selected.push(candidate);
      selectedUsers.push(cu);
    }
  }

  // If we couldn't fill the jury with the overlap constraint, fall back to largest possible
  if (selected.length < 3) {
    return { jurors: [], seed, rulesApplied: [...rulesApplied, "Could not seat minimum 3 jurors with overlap constraint"], jurySize, qualifyingCount, error: "Insufficient diverse jurors (overlap constraint too restrictive for current population)." };
  }

  if (selected.length < jurySize) {
    rulesApplied.push(`Reduced jury: ${selected.length}/${jurySize} (overlap constraint limited pool)`);
  }

  return { jurors: selected, seed, rulesApplied, jurySize: selected.length, qualifyingCount, error: null };
}

export async function selectJury(orgId, submitterUsername) {
  const orgs = (await sG(SK.ORGS)) || {};
  const users = (await sG(SK.USERS)) || {};
  const subs = (await sG(SK.SUBS)) || {};
  const org = orgs[orgId];

  const memberCount = org ? org.members.length : 0;
  const jurySize = getJurySize(memberCount);

  // Exclude submitter and their DI partner (or human partner if submitter is a DI)
  const submitter = users[submitterUsername];
  const diPartner = submitter && submitter.isDI ? submitter.diPartner : null;
  // Also exclude any DIs registered to the submitter (if submitter is human)
  const diAgents = !submitter?.isDI ? Object.values(users).filter(u => u.isDI && u.diPartner === submitterUsername).map(u => u.username) : [];
  const excluded = new Set([submitterUsername, ...(diPartner ? [diPartner] : []), ...diAgents]);
  let pool = org ? org.members.filter(m => !excluded.has(m)) : [];

  if (pool.length < jurySize) return { jurors: [], seed: 0, rulesApplied: [], jurySize, error: "Not enough eligible jurors." };

  const rulesApplied = [];

  // Rule B: No repeat reviewer of same submitter (100+ members)
  if (memberCount >= 100) {
    const submitterSubs = Object.values(subs).filter(s => s.submittedBy === submitterUsername && s.orgId === orgId);
    const pastJurors = {};
    submitterSubs.forEach(s => {
      (s.jurors || []).forEach(j => { pastJurors[j] = (pastJurors[j] || 0) + 1; });
    });
    const filtered = pool.filter(m => !pastJurors[m]);
    if (filtered.length >= jurySize) { pool = filtered; rulesApplied.push("No-repeat-reviewer"); }
    else { rulesApplied.push("No-repeat-reviewer (relaxed: insufficient pool)"); }
  }

  // Rule D: Cooldown — jurors who reviewed anything in last 24h are deprioritized (1000+ members)
  if (memberCount >= 1000) {
    const now = Date.now();
    const recentReviewers = new Set();
    Object.values(subs).forEach(s => {
      const votes = s.votes;
      if (votes) {
        Object.entries(votes).forEach(([voter, v]) => {
          if (v.time && (now - new Date(v.time).getTime()) < 86400000) recentReviewers.add(voter);
        });
      }
    });
    const rested = pool.filter(m => !recentReviewers.has(m));
    if (rested.length >= jurySize) { pool = rested; rulesApplied.push("24h-cooldown"); }
    else { rulesApplied.push("24h-cooldown (relaxed: insufficient rested jurors)"); }
  }

  // Rule A: Jurors can't have joined within 30 days of each other (500+ members)
  const applyJoinDateRule = memberCount >= 500;

  // Rule C: Demographic diversity (100+ members, disabled below 1000 if diversity insufficient)
  const applyDiversityRule = memberCount >= 100;

  // Seed and shuffle
  const seed = Date.now() + Math.floor(Math.random() * 10000);
  const rng = seededRandom(seed);
  let shuffled = [...pool].sort(() => rng() - 0.5);

  const selected = [];
  const genders = new Set();
  const regions = new Set();

  const poolTarget = jurySize * JURY_POOL_MULTIPLIER;

  for (const candidate of shuffled) {
    if (selected.length >= poolTarget) break;
    const u = users[candidate];
    if (!u) continue;

    // Rule A check
    if (applyJoinDateRule && selected.length > 0) {
      const tooClose = selected.some(s => {
        const su = users[s];
        return su && daysBetween(u.signupDate, su.signupDate) < 30;
      });
      if (tooClose) { rulesApplied.push(`Join-date-filter skipped @${candidate}`); continue; }
    }

    // Rule C: attempt diversity
    if (applyDiversityRule && selected.length > 0 && selected.length < poolTarget) {
      const poolGenders = new Set(pool.map(m => users[m]?.gender).filter(Boolean));
      const poolRegions = new Set(pool.map(m => users[m]?.state || users[m]?.location).filter(Boolean));
      const hasDiversity = poolGenders.size >= 2 || poolRegions.size >= 3;

      if (hasDiversity || memberCount >= 1000) {
        if (u.gender && genders.has(u.gender) && poolGenders.size >= 2 && selected.length < Math.floor(poolTarget / 2)) {
          const otherAvail = shuffled.slice(shuffled.indexOf(candidate) + 1).some(c => users[c]?.gender && !genders.has(users[c].gender));
          if (otherAvail) continue;
        }
        if (!rulesApplied.includes("Diversity-attempt")) rulesApplied.push("Diversity-attempt");
      }
    }

    selected.push(candidate);
    if (u.gender) genders.add(u.gender);
    if (u.state || u.location) regions.add(u.state || u.location);
  }

  // Fallback — ensure at least jurySize
  if (selected.length < jurySize) {
    for (const candidate of shuffled) {
      if (selected.length >= jurySize) break;
      if (!selected.includes(candidate)) selected.push(candidate);
    }
    if (!rulesApplied.includes("Fallback")) rulesApplied.push("Fallback-selection");
  }

  return { jurors: selected.slice(0, jurySize * JURY_POOL_MULTIPLIER), seed, rulesApplied, jurySize, poolSize: Math.min(selected.length, jurySize * JURY_POOL_MULTIPLIER), error: selected.length < jurySize ? "Insufficient jurors." : null };
}

// Recusal: juror can recuse from a submission via server API
export async function recuseJuror(subId, jurorUsername, isCross = false) {
  try {
    const res = await fetch(`/api/submissions/${subId}/recuse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || "Recusal failed" };
    }
    return { success: true };
  } catch (e) {
    return { error: "Network error during recusal" };
  }
}

// Returns fraction of reputation recoverable based on time since cross-group rejection
export function getConcessionRecovery(rejectedAt, concessionsThisWeek = 0) {
  const hours = (Date.now() - new Date(rejectedAt).getTime()) / 3600000;
  if (hours <= 168) {  // within 1 week
    return concessionsThisWeek < 1 ? 1.00 : 0.90; // first one free, rest 90%
  }
  if (hours <= 336) return 0.90;   // 14 days
  if (hours <= 720) return 0.50;   // 30 days
  if (hours <= 2160) return 0.25;  // 90 days
  return 0.05;
}

export async function fileDispute(subId, disputerUsername, reasoning, evidence, { fieldResponses, disputeType } = {}) {
  try {
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: subId,
        reasoning: reasoning.trim(),
        evidence: (evidence || []).map(e => ({ url: e.url, explanation: e.explanation })),
        ...(fieldResponses && Object.values(fieldResponses).some(v => v) ? { fieldResponses } : {}),
        ...(disputeType ? { disputeType } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || "Failed to file dispute" };
    }
    const data = await res.json();
    return { success: true, disputeId: data.data?.id || data.id };
  } catch (e) {
    return { error: "Network error filing dispute" };
  }
}

export async function resolveDispute(disputeId, voterUsername, approve, note, lieChecked) {
  try {
    const res = await fetch(`/api/disputes/${disputeId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, note: note.trim(), deliberateLie: lieChecked }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || "Failed to cast dispute vote" };
    }
    return { success: true };
  } catch (e) {
    return { error: "Network error casting dispute vote" };
  }
}
