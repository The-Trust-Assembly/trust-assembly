import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ============================================================
// TRUST ASSEMBLY MVP v4
// Full feature set: jury rules, inline edits, standing
// corrections, ratings, profiles, legal, thresholds
// ============================================================

const VER = "v5";
const SK = { USERS: `ta-u-${VER}`, ORGS: `ta-o-${VER}`, SUBS: `ta-s-${VER}`, SESSION: `ta-ss-${VER}`, AUDIT: `ta-a-${VER}`, VAULT: `ta-vault-${VER}`, ARGS: `ta-args-${VER}`, BELIEFS: `ta-beliefs-${VER}`, DISPUTES: `ta-disp-${VER}`, SYNTH: `ta-synth-${VER}`, GP: `ta-gp-${VER}`, APPS: `ta-apps-${VER}` };
const GP_NAME = "The General Public";
const GP_DESC = "Every Digital Citizen is a member. The town square — your permanent home assembly.";
const MAX_ORGS = 12;

// --- Utilities ---
function gid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }
function fDate(iso) { if (!iso) return "N/A"; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function sDate(iso) { if (!iso) return ""; const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + "m"; if (d < 86400) return Math.floor(d / 3600) + "h"; if (d < 604800) return Math.floor(d / 86400) + "d"; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function daysBetween(a, b) { return Math.abs(Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)); }
function daysSince(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }

function seededRandom(seed) { let h = 0xdeadbeef ^ seed; return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

async function hashPw(pw, salt) { const d = new TextEncoder().encode(salt + ":" + pw); const buf = await crypto.subtle.digest("SHA-256", d); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""); }
function genSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join(""); }
function genToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join(""); }
function valPw(pw) { if (pw.length < 8) return "Min 8 characters."; if (!/[A-Z]/.test(pw)) return "Need uppercase."; if (!/[a-z]/.test(pw)) return "Need lowercase."; if (!/[0-9]/.test(pw)) return "Need number."; return null; }

function hotScore(sub) {
  const cg = sub.crossGroupVotes ? Object.values(sub.crossGroupVotes).filter(v => v.approve).length : 0;
  const ig = sub.votes ? Object.values(sub.votes).filter(v => v.approve).length : 0;
  const s = cg * 3 + ig;
  const order = Math.log10(Math.max(Math.abs(s), 1));
  const sign = s > 0 ? 1 : s < 0 ? -1 : 0;
  const epoch = new Date("2025-01-01").getTime() / 1000;
  const sec = new Date(sub.createdAt).getTime() / 1000 - epoch;
  return sign * order + sec / 45000;
}

// --- Storage ---
async function sG(k) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function sS(k, v) { try { await window.storage.set(k, JSON.stringify(v)); return true; } catch { return false; } }

async function ensureGeneralPublic() {
  let gpId = await sG(SK.GP);
  if (gpId) return gpId;
  const orgs = (await sG(SK.ORGS)) || {};
  // Check if it already exists
  for (const [id, o] of Object.entries(orgs)) { if (o.name === GP_NAME) { await sS(SK.GP, id); return id; } }
  // Create it
  const id = gid();
  orgs[id] = { id, name: GP_NAME, description: GP_DESC, charter: "Open to all. Permanent membership. Cannot be left.", createdBy: "system", createdAt: new Date().toISOString(), members: [], isGeneralPublic: true };
  await sS(SK.ORGS, orgs); await sS(SK.GP, id);
  return id;
}

// ============================================================
// JURY SELECTION ENGINE
// ============================================================
// Rules activate at thresholds:
// - 100 members: no repeat reviewer of same submitter, demographic diversity attempted
// - 500 members: jurors can't have joined within 30 days of each other
// - Cross-group consensus requires 5+ assemblies with 100+ members

async function selectJury(orgId, submitterUsername, isCrossGroup = false) {
  const orgs = (await sG(SK.ORGS)) || {};
  const users = (await sG(SK.USERS)) || {};
  const subs = (await sG(SK.SUBS)) || {};
  const org = orgs[orgId];

  let pool = [];
  if (isCrossGroup) {
    for (const [oid, o] of Object.entries(orgs)) {
      if (oid !== orgId) {
        for (const m of o.members) {
          if (m !== submitterUsername) pool.push(m);
        }
      }
    }
    pool = [...new Set(pool)];
  } else {
    pool = org ? org.members.filter(m => m !== submitterUsername) : [];
  }

  if (pool.length < 3) return { jurors: [], seed: 0, rulesApplied: [], error: "Not enough eligible jurors." };

  const memberCount = org ? org.members.length : 0;
  const rulesApplied = [];

  // Rule B: No repeat reviewer of same submitter (100+ members)
  if (memberCount >= 100) {
    const submitterSubs = Object.values(subs).filter(s => s.submittedBy === submitterUsername && s.orgId === orgId);
    const pastJurors = {};
    submitterSubs.forEach(s => {
      (isCrossGroup ? s.crossGroupJurors : s.jurors || []).forEach(j => { pastJurors[j] = (pastJurors[j] || 0) + 1; });
    });
    const filtered = pool.filter(m => !pastJurors[m]);
    if (filtered.length >= 3) { pool = filtered; rulesApplied.push("No-repeat-reviewer"); }
    else { rulesApplied.push("No-repeat-reviewer (relaxed: insufficient pool)"); }
  }

  // Rule D: Cooldown — jurors who reviewed anything in last 24h are deprioritized (1000+ members)
  if (memberCount >= 1000) {
    const now = Date.now();
    const recentReviewers = new Set();
    Object.values(subs).forEach(s => {
      const votes = isCrossGroup ? s.crossGroupVotes : s.votes;
      if (votes) {
        Object.entries(votes).forEach(([voter, v]) => {
          if (v.time && (now - new Date(v.time).getTime()) < 86400000) recentReviewers.add(voter);
        });
      }
    });
    const rested = pool.filter(m => !recentReviewers.has(m));
    if (rested.length >= 3) { pool = rested; rulesApplied.push("24h-cooldown"); }
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

  for (const candidate of shuffled) {
    if (selected.length >= 3) break;
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
    if (applyDiversityRule && selected.length > 0 && selected.length < 3) {
      const poolGenders = new Set(pool.map(m => users[m]?.gender).filter(Boolean));
      const poolRegions = new Set(pool.map(m => users[m]?.location).filter(Boolean));
      const hasDiversity = poolGenders.size >= 2 || poolRegions.size >= 3;

      if (hasDiversity || memberCount >= 1000) {
        if (u.gender && genders.has(u.gender) && poolGenders.size >= 2 && selected.length < 2) {
          const otherAvail = shuffled.slice(shuffled.indexOf(candidate) + 1).some(c => users[c]?.gender && !genders.has(users[c].gender));
          if (otherAvail) continue;
        }
        if (!rulesApplied.includes("Diversity-attempt")) rulesApplied.push("Diversity-attempt");
      }
    }

    selected.push(candidate);
    if (u.gender) genders.add(u.gender);
    if (u.location) regions.add(u.location);
  }

  // Fallback
  if (selected.length < 3) {
    for (const candidate of shuffled) {
      if (selected.length >= 3) break;
      if (!selected.includes(candidate)) selected.push(candidate);
    }
    if (!rulesApplied.includes("Fallback")) rulesApplied.push("Fallback-selection");
  }

  return { jurors: selected.slice(0, 3), seed, rulesApplied, error: selected.length < 3 ? "Insufficient jurors." : null };
}

// Recusal: juror can recuse from a submission, triggering replacement draw
async function recuseJuror(subId, jurorUsername, isCross = false) {
  const subs = (await sG(SK.SUBS)) || {};
  const sub = subs[subId];
  if (!sub) return { error: "Submission not found." };

  const jurorKey = isCross ? "crossGroupJurors" : "jurors";
  const voteKey = isCross ? "crossGroupVotes" : "votes";
  if (!sub[jurorKey].includes(jurorUsername)) return { error: "Not on this jury." };
  if (sub[voteKey][jurorUsername]) return { error: "Already voted — cannot recuse." };

  // Remove from jury
  sub[jurorKey] = sub[jurorKey].filter(j => j !== jurorUsername);
  const now = new Date().toISOString();
  sub.auditTrail.push({ time: now, action: `@${jurorUsername} RECUSED (${isCross ? "cross-group" : "in-group"}). Reason: conflict of interest.` });

  // Draw replacement
  const orgs = (await sG(SK.ORGS)) || {};
  const users = (await sG(SK.USERS)) || {};
  const allExcluded = new Set([sub.submittedBy, ...sub[jurorKey], jurorUsername, ...(sub.jurors || []), ...(sub.crossGroupJurors || [])]);

  let replacementPool = [];
  if (isCross) {
    for (const [oid, o] of Object.entries(orgs)) {
      if (oid !== sub.orgId) o.members.forEach(m => { if (!allExcluded.has(m)) replacementPool.push(m); });
    }
    replacementPool = [...new Set(replacementPool)];
  } else {
    const org = orgs[sub.orgId];
    if (org) replacementPool = org.members.filter(m => !allExcluded.has(m));
  }

  if (replacementPool.length > 0) {
    const rng = seededRandom(Date.now());
    const replacement = replacementPool.sort(() => rng() - 0.5)[0];
    sub[jurorKey].push(replacement);
    sub.auditTrail.push({ time: now, action: `Replacement juror drawn: @${replacement}` });
  } else {
    sub.auditTrail.push({ time: now, action: `No replacement available. Jury reduced to ${sub[jurorKey].length}.` });
  }

  subs[subId] = sub;
  await sS(SK.SUBS, subs);
  return { success: true, newJury: sub[jurorKey] };
}

// Check cross-group eligibility
async function canDoCrossGroup() {
  const orgs = (await sG(SK.ORGS)) || {};
  const large = Object.values(orgs).filter(o => o.members.length >= 100);
  return large.length >= 5;
}

// ============================================================
// INTRA-ASSEMBLY DISPUTE ENGINE
// ============================================================
// Activates at 100+ members. Any member can dispute another member's
// approved/consensus submission. Jury of 3 uninvolved members, same
// selection rules. Winner gets big reputation gain; loser loses some
// (severe if deliberate deception found).

async function fileDispute(subId, disputerUsername, reasoning, evidence) {
  const subs = (await sG(SK.SUBS)) || {};
  const sub = subs[subId];
  if (!sub) return { error: "Submission not found." };
  if (sub.submittedBy === disputerUsername) return { error: "Cannot dispute your own submission." };

  const orgs = (await sG(SK.ORGS)) || {};
  const org = orgs[sub.orgId];
  if (!org) return { error: "Assembly not found." };
  if (!org.members.includes(disputerUsername)) return { error: "You must be in the same Assembly." };
  if (org.members.length < 100) return { error: "Disputes require 100+ members." };

  // Check for existing active dispute on this submission
  const disputes = (await sG(SK.DISPUTES)) || {};
  const existing = Object.values(disputes).find(d => d.subId === subId && d.status === "pending_review");
  if (existing) return { error: "This submission already has an active dispute." };

  const now = new Date().toISOString();
  // Select jury: exclude disputer, original submitter, and any prior jurors on the submission
  const excluded = new Set([disputerUsername, sub.submittedBy, ...(sub.jurors || []), ...(sub.crossGroupJurors || [])]);
  const pool = org.members.filter(m => !excluded.has(m));
  if (pool.length < 3) return { error: "Not enough uninvolved members for a jury." };

  // Apply same jury selection rules
  const juryResult = await selectJury(sub.orgId, sub.submittedBy, false);
  // Filter out disputer from jury if selected
  let jurors = juryResult.jurors.filter(j => j !== disputerUsername && j !== sub.submittedBy);
  if (jurors.length < 3) {
    const extras = pool.filter(m => !jurors.includes(m)).sort(() => Math.random() - 0.5);
    while (jurors.length < 3 && extras.length > 0) jurors.push(extras.shift());
  }
  if (jurors.length < 3) return { error: "Insufficient jurors." };
  jurors = jurors.slice(0, 3);

  const dispute = {
    id: gid(), subId, submissionHeadline: sub.replacement, submissionReasoning: sub.reasoning,
    originalSubmitter: sub.submittedBy, orgId: sub.orgId, orgName: sub.orgName,
    disputedBy: disputerUsername, reasoning: reasoning.trim(),
    evidence: evidence || [],
    status: "pending_review", jurors, votes: {},
    deliberateLieFinding: false,
    createdAt: now, resolvedAt: null,
    auditTrail: [{ time: now, action: `Dispute filed by @${disputerUsername} against @${sub.submittedBy}'s submission. Jury: ${jurors.map(j => "@" + j).join(", ")}` }],
  };

  disputes[dispute.id] = dispute;
  await sS(SK.DISPUTES, disputes);

  // Mark submission as disputed
  subs[subId].status = "disputed";
  subs[subId].auditTrail.push({ time: now, action: `⚖ DISPUTED by @${disputerUsername}. Dispute ID: ${dispute.id}` });
  await sS(SK.SUBS, subs);

  const audit = (await sG(SK.AUDIT)) || [];
  audit.push({ time: now, action: `Dispute: @${disputerUsername} vs @${sub.submittedBy} on "${sub.replacement}"` });
  await sS(SK.AUDIT, audit);

  return { success: true, disputeId: dispute.id };
}

async function resolveDispute(disputeId, voterUsername, approve, note, lieChecked) {
  const disputes = (await sG(SK.DISPUTES)) || {};
  const d = disputes[disputeId];
  if (!d) return { error: "Dispute not found." };
  if (!d.jurors.includes(voterUsername)) return { error: "Not on this jury." };
  if (d.votes[voterUsername]) return { error: "Already voted." };

  const now = new Date().toISOString();
  // approve = true means the disputer is RIGHT (submission was wrong)
  // approve = false means the original submitter is vindicated
  d.votes[voterUsername] = { approve, note: note.trim(), time: now, deliberateLie: lieChecked };
  d.auditTrail.push({ time: now, action: `@${voterUsername} voted ${approve ? "UPHOLD DISPUTE" : "REJECT DISPUTE"}${lieChecked ? " ⚠LIE-BALLOT" : ""}` });

  const vc = Object.keys(d.votes).length;
  const upheld = Object.values(d.votes).filter(v => v.approve).length;
  const rejected = vc - upheld;

  if (upheld >= 2 || rejected >= 2 || vc >= 3) {
    const disputerWins = upheld >= 2;
    const allVotes = Object.values(d.votes);
    const lieCount = allVotes.filter(v => v.deliberateLie).length;
    const wasLie = lieCount > allVotes.length / 2;

    d.status = disputerWins ? "upheld" : "dismissed";
    d.resolvedAt = now;
    d.deliberateLieFinding = wasLie;
    d.auditTrail.push({ time: now, action: `RESOLVED: ${d.status.toUpperCase()} (${upheld}/${vc} upheld)${wasLie ? " ⚠ DELIBERATE DECEPTION FINDING" : ""}` });

    // Score impacts
    const users = (await sG(SK.USERS)) || {};
    const disputer = users[d.disputedBy];
    const original = users[d.originalSubmitter];

    if (disputerWins) {
      // Disputer wins big
      if (disputer) { disputer.disputeWins = (disputer.disputeWins || 0) + 1; users[d.disputedBy] = disputer; }
      // Original loses — severity depends on lie finding
      if (original) {
        original.disputeLosses = (original.disputeLosses || 0) + 1;
        if (wasLie) {
          original.deliberateLies = (original.deliberateLies || 0) + 1;
          original.currentStreak = 0;
          original.requiredStreak = (original.requiredStreak || 3) + 4; // extra harsh
        } else {
          original.totalLosses = (original.totalLosses || 0) + 1;
          original.currentStreak = 0;
          original.requiredStreak = (original.requiredStreak || 3) + 1;
        }
        users[d.originalSubmitter] = original;
      }
    } else {
      // Disputer loses (small penalty — don't want to discourage disputes)
      if (disputer) { disputer.disputeLosses = (disputer.disputeLosses || 0) + 1; users[d.disputedBy] = disputer; }
      // Original vindicated — small boost
      if (original) { original.disputeWins = (original.disputeWins || 0) + 1; users[d.originalSubmitter] = original; }
    }
    await sS(SK.USERS, users);

    // Update original submission status
    const subs = (await sG(SK.SUBS)) || {};
    if (subs[d.subId]) {
      subs[d.subId].status = disputerWins ? "rejected" : "approved";
      subs[d.subId].auditTrail.push({ time: now, action: `Dispute ${d.status}: ${disputerWins ? "Submission overturned" : "Submission vindicated"}${wasLie ? " ⚠ DELIBERATE DECEPTION FINDING" : ""}` });
      await sS(SK.SUBS, subs);
    }

    const audit = (await sG(SK.AUDIT)) || [];
    audit.push({ time: now, action: `Dispute ${d.status}: @${d.disputedBy} vs @${d.originalSubmitter} — ${disputerWins ? "Disputer wins" : "Original vindicated"}${wasLie ? " ⚠LIE" : ""}` });
    await sS(SK.AUDIT, audit);
  }

  disputes[disputeId] = d;
  await sS(SK.DISPUTES, disputes);
  return { success: true };
}

const PROFILES = {
  "Oracle": { desc: "Accurate, important, compelling. The gold standard.", color: "#7B1FA2" },
  "Diligent Reporter": { desc: "Gets the important stories right. Not flashy, but indispensable.", color: "#2D6A4F" },
  "Raconteur": { desc: "Honest and entertaining. Picks lighter stories but never lies.", color: "#2C5F7C" },
  "Archivist": { desc: "Quiet, reliable. Fills gaps nobody else bothers with.", color: "#6B6560" },
  "Demagogue": { desc: "Interesting and seems important, but wrong. The dangerous kind.", color: "#C41E3A" },
  "Overreacher": { desc: "Tackles big stories but can't back them up.", color: "#E65100" },
  "Court Jester": { desc: "Entertaining noise. At least you had fun being wrong.", color: "#F9A825" },
  "Apprentice": { desc: "Still learning. Everyone starts here.", color: "#8B8680" },
  "New Citizen": { desc: "Insufficient data for profile. Submit and get reviewed.", color: "#B0A89C" },
};

function computeProfile(user) {
  const wins = user.totalWins || 0;
  const losses = user.totalLosses || 0;
  const total = wins + losses;
  const streak = user.currentStreak || 0;
  const required = user.requiredStreak || 3;
  const highTrust = streak >= required;

  // Ratings averages
  const ratings = user.ratingsReceived || [];
  const avgNews = ratings.length > 0 ? ratings.reduce((a, r) => a + (r.newsworthy || 5), 0) / ratings.length : 5;
  const avgFun = ratings.length > 0 ? ratings.reduce((a, r) => a + (r.interesting || 5), 0) / ratings.length : 5;

  // ASYMMETRIC SCORING: slow climb, fast fall
  // Each win = 1 point. Current streak compounds quadratically.
  // Each loss = 3 points against. Lying is expensive.
  // Streak of 10 adds ~2.75 bonus points. One loss wipes that AND costs 3.
  const streakBoost = streak * (streak + 1) * 0.025;
  const disputeWins = user.disputeWins || 0;
  const disputeLosses = user.disputeLosses || 0;
  const effectiveWins = wins + streakBoost + (disputeWins * 3); // dispute wins worth 3x
  const lies = user.deliberateLies || 0;
  const effectiveLosses = Math.max(0, losses - lies) * 3 + lies * 9 + disputeLosses * 1; // dispute loss = 1x (mild)
  const adjustedAccuracy = (effectiveWins + effectiveLosses > 0) ? effectiveWins / (effectiveWins + effectiveLosses) : 0.5;
  const impact = (avgNews + avgFun) / 20;
  const assemblyIndex = Math.min(100, Math.max(0, Math.round(adjustedAccuracy * 65 + impact * 35)));

  let profile = "New Citizen";
  if (total >= 3) {
    const hiAcc = adjustedAccuracy >= 0.55;
    const hiNews = avgNews >= 5.5;
    const hiFun = avgFun >= 5.5;
    if (hiAcc && hiNews && hiFun) profile = "Oracle";
    else if (hiAcc && hiNews && !hiFun) profile = "Diligent Reporter";
    else if (hiAcc && !hiNews && hiFun) profile = "Raconteur";
    else if (hiAcc && !hiNews && !hiFun) profile = "Archivist";
    else if (!hiAcc && hiNews && hiFun) profile = "Demagogue";
    else if (!hiAcc && hiNews && !hiFun) profile = "Overreacher";
    else if (!hiAcc && !hiNews && hiFun) profile = "Court Jester";
    else profile = "Apprentice";
  }

  return { assemblyIndex, profile, adjustedAccuracy: Math.round(adjustedAccuracy * 100), rawAccuracy: total > 0 ? Math.round((wins / total) * 100) : 50, avgNews: avgNews.toFixed(1), avgFun: avgFun.toFixed(1), wins, losses, lies: user.deliberateLies || 0, total, streak, streakBoost: streakBoost.toFixed(1), effectiveLossPenalty: effectiveLosses.toFixed(0), disputeWins, disputeLosses, required, highTrust };
}

function checkEnrollment(org) {
  const c = org.members.length;
  if (c < 100) return { open: true, sponsors: 0, label: "Open" };
  if (c < 1000) return { open: false, sponsors: 1, label: "1 Sponsor" };
  if (c < 10000) return { open: false, sponsors: 2, label: "2 Sponsors" };
  return { open: false, sponsors: 3, label: "3 Sponsors" };
}

function assemblyTrustScore(org, users) {
  const scores = org.members.map(m => users[m] ? computeProfile(users[m]).assemblyIndex : 0).sort((a, b) => b - a);
  if (!scores.length) return 0;
  const topN = Math.max(1, Math.ceil(scores.length * 0.2));
  const botN = Math.max(1, Math.ceil(scores.length * 0.2));
  const topAvg = scores.slice(0, topN).reduce((a, b) => a + b, 0) / topN;
  const botAvg = scores.slice(-botN).reduce((a, b) => a + b, 0) / botN;
  return Math.round(topAvg * 0.7 + botAvg * 0.3);
}

// ============================================================
// SHARED COMPONENTS
// ============================================================

function Badge({ profile, score }) {
  const p = PROFILES[profile] || PROFILES["New Citizen"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 2, border: `1.5px solid ${p.color}`, color: p.color, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />{profile} · {score}
    </span>
  );
}

function StatusPill({ status }) {
  const m = { pending_jury: { bg: "#FFF8E1", c: "#F9A825", l: "Awaiting Jury" }, pending_review: { bg: "#FFF3E0", c: "#E65100", l: "Under Review" }, approved: { bg: "#E8F5E9", c: "#2D6A4F", l: "Approved" }, rejected: { bg: "#FFEBEE", c: "#C41E3A", l: "Rejected" }, cross_review: { bg: "#E3F2FD", c: "#1565C0", l: "Cross-Group" }, consensus: { bg: "#F3E5F5", c: "#7B1FA2", l: "Consensus" }, consensus_rejected: { bg: "#FCE4EC", c: "#880E4F", l: "Consensus Rejected" }, disputed: { bg: "#FFF3E0", c: "#E65100", l: "⚖ Disputed" }, upheld: { bg: "#E65100", c: "#fff", l: "Dispute Upheld" }, dismissed: { bg: "#E8F5E9", c: "#2D6A4F", l: "Dispute Dismissed" } };
  const s = m[status] || { bg: "#eee", c: "#666", l: status };
  return <span style={{ fontSize: 9, padding: "2px 7px", background: s.bg, color: s.c, borderRadius: 2, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}>{s.l}</span>;
}

function LegalDisclaimer({ short }) {
  if (short) return <div style={{ fontSize: 9, color: "#A09890", fontFamily: "var(--mono)", lineHeight: 1.4, padding: "6px 0" }}>Digital Citizens are solely responsible for the content of their submissions. The Trust Assembly makes no claims regarding the accuracy of any submission.</div>;
  return (
    <div style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)", lineHeight: 1.5, padding: 12, background: "#F5F0E8", borderRadius: 2, border: "1px solid #E8E3D9" }}>
      <strong>Legal Notice:</strong> The Trust Assembly is a platform for collaborative fact-checking and editorial review. All corrections, annotations, and standing corrections are submitted by Digital Citizens and represent their individual assessments. The Trust Assembly does not independently verify submissions and makes no representations regarding the accuracy, completeness, or reliability of any user-submitted content. Digital Citizens bear sole responsibility for the content they submit. Jury decisions reflect peer consensus, not institutional endorsement.
    </div>
  );
}

function AuditTrail({ entries }) {
  const [open, setOpen] = useState(false);
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", padding: 0 }}>{open ? "▾" : "▸"} Audit Trail ({entries.length})</button>
      {open && <div style={{ marginTop: 6, padding: 10, background: "#F0EBE0", borderLeft: "3px solid #D4C9B8", fontSize: 10, fontFamily: "var(--mono)", maxHeight: 180, overflowY: "auto" }}>
        {entries.map((e, i) => <div key={i} style={{ marginBottom: 3, color: "#4A4540", lineHeight: 1.4 }}><span style={{ color: "#8B8680" }}>{fDate(e.time)}</span> — {e.action}</div>)}
      </div>}
    </div>
  );
}

function CitizenCounter() {
  const [count, setCount] = useState(0);
  const [orgStats, setOrgStats] = useState({ total: 0, large: 0 });
  useEffect(() => {
    (async () => {
      const u = (await sG(SK.USERS)) || {};
      const o = (await sG(SK.ORGS)) || {};
      setCount(Object.keys(u).length);
      const orgs = Object.values(o);
      setOrgStats({ total: orgs.length, large: orgs.filter(x => x.members.length >= 100).length });
    })();
    const i = setInterval(async () => {
      const u = (await sG(SK.USERS)) || {};
      setCount(Object.keys(u).length);
    }, 8000);
    return () => clearInterval(i);
  }, []);

  const juryRulesActive = orgStats.large > 0;
  const consensusActive = orgStats.large >= 5;

  return (
    <div style={{ textAlign: "center", padding: "16px 0 8px", borderBottom: "1px solid #E8E3D9", marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 32, fontWeight: 700, color: "#1A1A1A" }}>{count}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#8B8680", marginBottom: 8 }}>Digital Citizens Registered</div>
      <div style={{ fontSize: 10, color: "#A09890", lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: juryRulesActive ? "#2D6A4F" : "#D4C9B8", display: "inline-block" }} />
          <span>Advanced Jury Selection Rules activate for assemblies with 100+ citizens {juryRulesActive && <span style={{ color: "#2D6A4F", fontWeight: 700 }}>ACTIVE</span>}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: consensusActive ? "#7B1FA2" : "#D4C9B8", display: "inline-block" }} />
          <span>Consensus Juries activate with 5+ assemblies of 100+ citizens ({orgStats.large}/5) {consensusActive && <span style={{ color: "#7B1FA2", fontWeight: 700 }}>ACTIVE</span>}</span>
        </div>
      </div>
    </div>
  );
}

function RatingInput({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 4 }}>{label}: <strong style={{ fontSize: 14, color: "#1A1A1A" }}>{value}</strong>/10</label>
      <input type="range" min="1" max="10" value={value} onChange={(e) => onChange(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#1A1A1A" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#A09890", fontFamily: "var(--mono)" }}><span>1 — Low</span><span>10 — High</span></div>
    </div>
  );
}

function DeliberateLieCheckbox({ checked, onChange }) {
  return (
    <div style={{ margin: "12px 0", padding: 12, background: "#FDF2F2", border: "1.5px solid #C41E3A", borderRadius: 2 }}>
      <label style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: "#C41E3A", marginTop: 3, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C41E3A", fontWeight: 700, marginBottom: 3 }}>⚠ Deliberate Deception Finding</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: "#4A4540" }}>By checking this box, I certify that I personally believe this submission to be a <strong>deliberate lie, a gross misrepresentation, or an omission of context with the intent to deceive.</strong> I understand that this is a secret ballot that will significantly impact the trust score of the submitting citizen — not the article author. A simple majority of jurors checking this box triggers a Deliberate Deception Finding.</div>
        </div>
      </label>
    </div>
  );
}

function EvidenceFields({ evidence, onChange }) {
  const add = () => onChange([...evidence, { url: "", explanation: "" }]);
  const update = (i, k, v) => { const n = [...evidence]; n[i] = { ...n[i], [k]: v }; onChange(n); };
  const remove = (i) => onChange(evidence.filter((_, idx) => idx !== i));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 6 }}>Supporting Evidence</div>
      {evidence.map((e, i) => (
        <div key={i} style={{ padding: 10, background: "#F5F0E8", border: "1px solid #E8E3D9", marginBottom: 6, borderRadius: 2, position: "relative" }}>
          {evidence.length > 1 && <button onClick={() => remove(i)} style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "#C41E3A", cursor: "pointer", fontSize: 14 }}>×</button>}
          <div className="ta-field" style={{ marginBottom: 6 }}><label>Evidence URL #{i + 1}</label><input value={e.url} onChange={ev => update(i, "url", ev.target.value)} placeholder="https://..." /></div>
          <div className="ta-field" style={{ marginBottom: 0 }}><label>Why does this support your argument?</label><textarea value={e.explanation} onChange={ev => update(i, "explanation", ev.target.value)} rows={2} placeholder="What this source proves..." /></div>
        </div>
      ))}
      <button className="ta-btn-ghost" onClick={add} style={{ fontSize: 11 }}>+ Add Evidence</button>
    </div>
  );
}

function InviteCTA({ orgName, memberCount }) {
  const [copied, setCopied] = useState(false);
  const needed = Math.max(0, 4 - memberCount);
  if (needed <= 0) return null;
  return (
    <div style={{ margin: "20px 0", padding: 20, background: "#1A1A1A", borderRadius: 2, color: "#F5F0E8", border: "2px solid #C41E3A" }}>
      <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.15em", color: "#C41E3A", marginBottom: 6 }}>Action Required</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Your Assembly Needs {needed} More Member{needed !== 1 ? "s" : ""}</div>
      <p style={{ color: "#A09890", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>Jury review requires 4+ members in <strong style={{ color: "#F5F0E8" }}>{orgName}</strong>. Submissions are queued until then.</p>
      <button style={{ background: "#C41E3A", color: "#fff", border: "none", padding: "8px 16px", fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", borderRadius: 2, textTransform: "uppercase", letterSpacing: "0.05em" }} onClick={() => { navigator.clipboard?.writeText(`Join my Trust Assembly "${orgName}" — a system where the only way to win is by serving the truth.`).then(() => setCopied(true)); setTimeout(() => setCopied(false), 2000); }}>{copied ? "✓ Copied!" : "Copy Invite"}</button>
    </div>
  );
}

// ============================================================
// INLINE EDIT COMPONENT
// ============================================================

function InlineEditsForm({ edits, onChange }) {
  const MAX_EDITS = 20;
  const addEdit = () => { if (edits.length < MAX_EDITS) onChange([...edits, { original: "", replacement: "", reasoning: "" }]); };
  const updateEdit = (i, field, val) => { const n = [...edits]; n[i] = { ...n[i], [field]: val }; onChange(n); };
  const removeEdit = (i) => onChange(edits.filter((_, idx) => idx !== i));

  // Auto-add a new blank when last one has content
  useEffect(() => {
    if (edits.length === 0 || edits.length >= MAX_EDITS) return;
    const last = edits[edits.length - 1];
    if (last.original || last.replacement) {
      const hasEmpty = !last.original && !last.replacement && !last.reasoning;
      if (!hasEmpty) addEdit();
    }
  }, [edits]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560" }}>In-Line Article Edits</div>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: edits.filter(e => e.original.trim()).length >= MAX_EDITS ? "#C41E3A" : "#8B8680" }}>{edits.filter(e => e.original.trim()).length}/{MAX_EDITS}</div>
      </div>
      {edits.map((edit, i) => (
        <div key={i} style={{ padding: 12, background: i % 2 === 0 ? "#FDFBF7" : "#F5F0E8", border: "1px solid #E8E3D9", marginBottom: 8, borderRadius: 2, position: "relative" }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#8B8680", marginBottom: 6 }}>Edit #{i + 1}</div>
          {edits.length > 1 && <button onClick={() => removeEdit(i)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "#C41E3A", cursor: "pointer", fontSize: 14 }}>×</button>}
          <div className="ta-field" style={{ marginBottom: 8 }}><label style={{ fontSize: 9 }}>Original Text (copy from article)</label><textarea value={edit.original} onChange={(e) => updateEdit(i, "original", e.target.value)} rows={2} placeholder="Paste the exact text from the article you want to correct" /></div>
          <div className="ta-field" style={{ marginBottom: 8 }}><label style={{ fontSize: 9 }}>Replacement Text <span style={{ color: "#C41E3A" }}>— red pen</span></label><textarea value={edit.replacement} onChange={(e) => updateEdit(i, "replacement", e.target.value)} rows={2} placeholder="Your corrected version" style={{ borderColor: "#C41E3A" }} /></div>
          <div className="ta-field" style={{ marginBottom: 0 }}><label style={{ fontSize: 9 }}>Reasoning</label><input value={edit.reasoning} onChange={(e) => updateEdit(i, "reasoning", e.target.value)} placeholder="Why is the original wrong or misleading?" /></div>
        </div>
      ))}
      {edits.length === 0 && <button className="ta-btn-secondary" onClick={addEdit} style={{ marginBottom: 8 }}>+ Add In-Line Edit</button>}
    </div>
  );
}

// ============================================================
// STANDING CORRECTION COMPONENT
// ============================================================

function StandingCorrectionInput({ value, onChange }) {
  return (
    <div style={{ padding: 16, background: "#F0EBE0", border: "1px solid #D4C9B8", borderRadius: 2 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 4 }}>Standing Correction (Reusable Fact)</div>
      <p style={{ fontSize: 12, color: "#8B8680", marginBottom: 10, lineHeight: 1.5 }}>A Standing Correction is an assertion of verified fact that your Assembly can reuse across multiple articles. Once approved, it enters your Assembly's Fact Vault. In the future, AI will suggest applicable Standing Corrections for new articles.</p>
      <div className="ta-field" style={{ marginBottom: 8 }}><label style={{ fontSize: 9 }}>Factual Assertion</label><textarea value={value.assertion || ""} onChange={(e) => onChange({ ...value, assertion: e.target.value })} rows={2} placeholder='e.g. "The XYZ recall involved a software font-size update, not a physical vehicle recall."' /></div>
      <div className="ta-field" style={{ marginBottom: 0 }}><label style={{ fontSize: 9 }}>Supporting Evidence / Source</label><input value={value.evidence || ""} onChange={(e) => onChange({ ...value, evidence: e.target.value })} placeholder="Link or citation supporting this fact" /></div>
    </div>
  );
}

// ============================================================
// SCREENS
// ============================================================

function DiscoveryFeed({ onLogin, onRegister }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const s = (await sG(SK.SUBS)) || {}; setSubs(Object.values(s).filter(x => x.status !== "pending_jury").sort((a, b) => hotScore(b) - hotScore(a))); setLoading(false); })(); }, []);
  if (loading || subs.length === 0) return null;
  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 40, height: 2, background: "#1A1A1A", margin: "0 auto 10px" }} />
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: "0 0 3px" }}>Live Corrections</h2>
        <p style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "#8B8680" }}>Ranked by trust & recency</p>
      </div>
      <div style={{ maxHeight: 440, overflowY: "auto", border: "1px solid #E8E3D9", borderRadius: 2, background: "#fff" }}>
        {subs.slice(0, 20).map((sub, i) => (
          <div key={sub.id} style={{ padding: "14px 16px", borderBottom: "1px solid #F0EBE0", display: "flex", gap: 12 }}>
            <div style={{ minWidth: 28, textAlign: "center", paddingTop: 2, fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: sub.status === "consensus" ? "#7B1FA2" : sub.status === "approved" ? "#2D6A4F" : "#8B8680" }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>@{sub.submittedBy} · {sub.orgName} · {sDate(sub.createdAt)}</span>
                <StatusPill status={sub.status} />
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 12, textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680" }}>{sub.originalHeadline}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 14, color: "#C41E3A", fontWeight: 700, marginTop: 1 }}>{sub.replacement}</div>
              <button className="ta-link-btn" style={{ fontSize: 11, marginTop: 4 }} onClick={onLogin}>Sign in to review →</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}><button className="ta-btn-primary" onClick={onRegister}>Become a Digital Citizen</button></div>
      <LegalDisclaimer short />
    </div>
  );
}

function RegisterScreen({ onRegister }) {
  const [form, setForm] = useState({ username: "", realName: "", email: "", password: "", confirmPassword: "", age: "", gender: "", location: "", bio: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pwS, setPwS] = useState(null);
  const s = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (k === "password") { if (!v) setPwS(null); else { const e = valPw(v); setPwS(e ? { ok: false, msg: e } : { ok: true, msg: "Strong" }); } } };

  const go = async () => {
    setError("");
    if (!form.username.trim() || !form.realName.trim()) return setError("Username and legal name required.");
    if (form.username.trim().length < 3) return setError("Username: 3 char minimum.");
    if (!form.email.trim() || !form.email.includes("@")) return setError("Valid email required.");
    if (!form.gender) return setError("Gender is required for jury diversity rules.");
    const pe = valPw(form.password); if (pe) return setError(pe);
    if (form.password !== form.confirmPassword) return setError("Passwords don't match.");
    setLoading(true);
    const users = (await sG(SK.USERS)) || {};
    const uname = form.username.trim().toLowerCase();
    if (users[uname]) { setError("Username taken."); setLoading(false); return; }
    if (Object.values(users).some(u => u.email === form.email.trim().toLowerCase())) { setError("Email taken."); setLoading(false); return; }
    const now = new Date().toISOString(); const salt = genSalt(); const ph = await hashPw(form.password, salt); const tok = genToken();
    const gpId = await ensureGeneralPublic();
    const user = { id: gid(), username: uname, displayName: form.username.trim(), realName: form.realName.trim(), email: form.email.trim().toLowerCase(), passwordHash: ph, salt, gender: form.gender, age: form.age || "Undisclosed", location: form.location || "Undisclosed", bio: form.bio || "", signupDate: now, signupTimestamp: Date.now(), ipHash: "0x" + Math.random().toString(16).substr(2, 12), orgId: gpId, orgIds: [gpId], totalWins: 0, totalLosses: 0, deliberateLies: 0, currentStreak: 0, requiredStreak: 3, reviewHistory: [], ratingsReceived: [], retractions: [], disputeWins: 0, disputeLosses: 0, sessionToken: tok };
    users[uname] = user; await sS(SK.USERS, users); await sS(SK.SESSION, { username: uname, token: tok });
    // Add to General Public
    const orgs = (await sG(SK.ORGS)) || {};
    if (orgs[gpId] && !orgs[gpId].members.includes(uname)) { orgs[gpId].members.push(uname); await sS(SK.ORGS, orgs); }
    const audit = (await sG(SK.AUDIT)) || []; audit.push({ time: now, action: `New citizen: @${uname}` }); await sS(SK.AUDIT, audit);
    setLoading(false); onRegister(user);
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Become a Digital Citizen</h2>

      <div style={{ padding: 10, background: "#FFF3E0", border: "1.5px solid #E65100", borderRadius: 2, marginBottom: 14, fontSize: 11, color: "#E65100", lineHeight: 1.5 }}>
        <strong>⚠ BETA:</strong> This is an experimental platform under active development. Do not enter sensitive personal information. Use a pseudonym if you prefer. Data may be reset.
      </div>

      {/* Education Box */}
      <div style={{ padding: 14, background: "#F5F0E8", border: "1px solid #E8E3D9", borderRadius: 2, marginBottom: 20, fontSize: 13, color: "#4A4540", lineHeight: 1.6 }}>
        <strong style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4, color: "#6B6560" }}>Why We Collect This Data</strong>
        The Trust Assembly uses demographic data (gender, age, location) solely to ensure jury diversity. When your Assembly reaches 100+ members, the jury selection engine attempts to draw reviewers from a cross-section of the membership — different genders, ages, and geographies — so that no single demographic can capture the review process. This data is never shared externally or used for advertising. Your password is SHA-256 hashed with a unique salt.
      </div>

      {error && <div className="ta-error">{error}</div>}
      <div className="ta-field"><label>Username *</label><input value={form.username} onChange={e => s("username", e.target.value)} placeholder="e.g. sninkle47" autoComplete="username" /></div>
      <div className="ta-field"><label>Email *</label><input type="email" value={form.email} onChange={e => s("email", e.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
      <div className="ta-field"><label>Legal Name *</label><input value={form.realName} onChange={e => s("realName", e.target.value)} placeholder="Your real, legal name" /></div>
      <div className="ta-field">
        <label>Password *</label>
        <input type="password" value={form.password} onChange={e => s("password", e.target.value)} placeholder="Min 8 chars, upper+lower+number" autoComplete="new-password" />
        {pwS && <div style={{ marginTop: 3, fontSize: 10, fontFamily: "var(--mono)", color: pwS.ok ? "#2D6A4F" : "#C41E3A" }}>{pwS.ok ? "✓" : "✗"} {pwS.msg}</div>}
      </div>
      <div className="ta-field"><label>Confirm Password *</label><input type="password" value={form.confirmPassword} onChange={e => s("confirmPassword", e.target.value)} autoComplete="new-password" /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div className="ta-field"><label>Gender *</label><select value={form.gender} onChange={e => s("gender", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1.5px solid #D4C9B8", background: "#FDFBF7", fontSize: 13, borderRadius: 2, color: form.gender ? "#1A1A1A" : "#8B8680" }}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option></select></div>
        <div className="ta-field"><label>Age</label><input value={form.age} onChange={e => s("age", e.target.value)} placeholder="e.g. 34" /></div>
        <div className="ta-field"><label>Location</label><input value={form.location} onChange={e => s("location", e.target.value)} placeholder="e.g. Austin" /></div>
      </div>
      <div className="ta-field"><label>Bio</label><textarea value={form.bio} onChange={e => s("bio", e.target.value)} placeholder="What do you care about? What's your expertise?" rows={2} /></div>
      <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "Registering..." : "Register as Digital Citizen"}</button>
      <div style={{ marginTop: 10 }}><LegalDisclaimer short /></div>
    </div>
  );
}

function LoginScreen({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const go = async () => {
    setError(""); if (!username.trim()) return setError("Enter username."); if (!password) return setError("Enter password.");
    setLoading(true); const users = (await sG(SK.USERS)) || {}; const u = users[username.trim().toLowerCase()];
    if (!u) { setError("No citizen found."); setLoading(false); return; }
    if (u.passwordHash && u.salt) { const h = await hashPw(password, u.salt); if (h !== u.passwordHash) { setError("Incorrect password."); setLoading(false); return; } }
    const tok = genToken(); u.sessionToken = tok; users[u.username] = u; await sS(SK.USERS, users); await sS(SK.SESSION, { username: u.username, token: tok });
    setLoading(false); onLogin(u);
  };
  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Return to the Assembly</h2>
      {error && <div className="ta-error">{error}</div>}
      <div className="ta-field"><label>Username</label><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></div>
      <div className="ta-field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} autoComplete="current-password" /></div>
      <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "..." : "Enter"}</button>
      <div style={{ textAlign: "center", marginTop: 16 }}><span style={{ color: "#8B8680", fontSize: 13 }}>New? </span><button className="ta-link-btn" onClick={onGoRegister}>Register</button></div>
    </div>
  );
}

function SubmitScreen({ user, onUpdate }) {
  const [form, setForm] = useState({ url: "", originalHeadline: "", replacement: "", reasoning: "" });
  const [inlineMode, setInlineMode] = useState(false);
  const [inlineEdits, setInlineEdits] = useState([{ original: "", replacement: "", reasoning: "" }]);
  const [standingCorrection, setStandingCorrection] = useState({ assertion: "", evidence: "" });
  const [evidenceUrls, setEvidenceUrls] = useState([{ url: "", explanation: "" }]);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);
  const [myOrgs, setMyOrgs] = useState([]);

  useEffect(() => { (async () => {
    const allOrgs = (await sG(SK.ORGS)) || {};
    const ids = user.orgIds || (user.orgId ? [user.orgId] : []);
    setMyOrgs(ids.map(id => allOrgs[id]).filter(Boolean));
  })(); }, [user.orgId, user.orgIds]);

  const activeOrg = myOrgs.find(o => o.id === user.orgId);

  const switchOrg = async (oid) => {
    const users = (await sG(SK.USERS)) || {};
    users[user.username] = { ...users[user.username], orgId: oid };
    await sS(SK.USERS, users);
    onUpdate({ ...user, orgId: oid });
  };

  const go = async () => {
    setError(""); setSuccess("");
    if (!user.orgId) return setError("Join an Assembly first.");
    if (!form.url.trim() || !form.originalHeadline.trim() || !form.replacement.trim()) return setError("URL, original headline, and replacement required.");
    if (!form.reasoning.trim()) return setError("Reasoning is mandatory.");
    setLoading(true);
    const orgs = (await sG(SK.ORGS)) || {}; const org = orgs[user.orgId];
    if (!org) { setError("Assembly not found."); setLoading(false); return; }
    const now = new Date().toISOString();
    const hasEnough = org.members.length >= 4;
    let jurors = [], jurySeed = 0, rulesApplied = [], status = "pending_jury";
    if (hasEnough) {
      const result = await selectJury(user.orgId, user.username);
      if (!result.error) { jurors = result.jurors; jurySeed = result.seed; rulesApplied = result.rulesApplied; status = "pending_review"; }
    }
    // Filter non-empty inline edits
    const validEdits = inlineEdits.filter(e => e.original.trim() && e.replacement.trim());
    const validEvidence = evidenceUrls.filter(e => e.url.trim());
    const sub = {
      id: gid(), url: form.url.trim(), originalHeadline: form.originalHeadline.trim(),
      replacement: form.replacement.trim(), reasoning: form.reasoning.trim(),
      evidence: validEvidence, inlineEdits: validEdits.length > 0 ? validEdits : [],
      standingCorrection: standingCorrection.assertion.trim() ? standingCorrection : null,
      submittedBy: user.username, orgId: user.orgId, orgName: org.name,
      status, jurors, jurySeed, votes: {},
      crossGroupJurors: [], crossGroupVotes: {}, crossGroupSeed: 0,
      createdAt: now, resolvedAt: null,
      auditTrail: [{ time: now, action: `Submitted by @${user.username}. ${status === "pending_review" ? `Jury: ${jurors.map(j => "@" + j).join(", ")} (seed:${jurySeed}). Rules: ${rulesApplied.join(", ") || "none"}` : `Queued — ${org.members.length} members, 4 needed.`}` }],
    };
    const subs = (await sG(SK.SUBS)) || {}; subs[sub.id] = sub; await sS(SK.SUBS, subs);
    // Save standing correction to assembly vault
    if (standingCorrection.assertion.trim()) {
      const standing = (await sG(SK.VAULT)) || {};
      const scId = gid();
      standing[scId] = { id: scId, orgId: user.orgId, orgName: org.name, assertion: standingCorrection.assertion.trim(), evidence: standingCorrection.evidence.trim(), submittedBy: user.username, linkedSubId: sub.id, status: "pending", createdAt: now, votes: {} };
      await sS(SK.VAULT, standing);
    }
    const audit = (await sG(SK.AUDIT)) || []; audit.push({ time: now, action: `Submission by @${user.username}: "${form.replacement}" [${status}]` }); await sS(SK.AUDIT, audit);
    setLoading(false); setSuccess(status === "pending_review" ? "Filed. Jury selected." : "Queued. Jury assigned when assembly reaches 4 members.");
    setForm({ url: "", originalHeadline: "", replacement: "", reasoning: "" }); setInlineEdits([{ original: "", replacement: "", reasoning: "" }]); setStandingCorrection({ assertion: "", evidence: "" }); setEvidenceUrls([{ url: "", explanation: "" }]);
  };

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Submit Correction</h2>
      <p style={{ color: "#6B6560", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>Identify a misleading headline. Propose a truthful replacement. Optionally add in-line edits to the article body and standing corrections for your Assembly's Fact Vault.</p>
      {/* Org picker */}
      {myOrgs.length > 1 && <div style={{ marginBottom: 14, padding: 10, background: "#F5F0E8", border: "1px solid #E8E3D9", borderRadius: 2 }}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 6 }}>Submitting from:</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => <button key={o.id} onClick={() => switchOrg(o.id)} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--mono)", border: `1.5px solid ${o.id === user.orgId ? "#2D6A4F" : "#D4C9B8"}`, background: o.id === user.orgId ? "#2D6A4F" : "#fff", color: o.id === user.orgId ? "#fff" : "#6B6560", borderRadius: 2, cursor: "pointer", fontWeight: o.id === user.orgId ? 700 : 400 }}>{o.isGeneralPublic ? "🏛 " : ""}{o.name}</button>)}
        </div>
      </div>}
      {error && <div className="ta-error">{error}</div>}
      {success && <div className="ta-success">{success}</div>}
      <div className="ta-card">
        <div className="ta-field"><label>Article URL *</label><input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
        <div className="ta-field"><label>Original Headline *</label><input value={form.originalHeadline} onChange={e => setForm({ ...form, originalHeadline: e.target.value })} placeholder="The headline as published" /></div>
        <div className="ta-field"><label>Proposed Replacement * <span style={{ fontWeight: 400, color: "#C41E3A" }}>— the red pen</span></label><input value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} style={{ borderColor: "#C41E3A" }} placeholder="Your corrected headline" /></div>
        <div className="ta-field"><label>Reasoning *</label><textarea value={form.reasoning} onChange={e => setForm({ ...form, reasoning: e.target.value })} rows={3} placeholder="Why is the original misleading?" /></div>
        <EvidenceFields evidence={evidenceUrls} onChange={setEvidenceUrls} />

        {/* Inline edits toggle */}
        <div style={{ borderTop: "1px solid #E8E3D9", paddingTop: 14, marginTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={inlineMode} onChange={e => setInlineMode(e.target.checked)} style={{ accentColor: "#1A1A1A" }} />
            <span>Submit In-Line Article Edits</span>
          </label>
          {inlineMode && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, color: "#8B8680", marginBottom: 10, lineHeight: 1.5 }}>Copy the exact text from the article you want corrected into "Original Text." The system uses exact text matching to locate each passage. Jurors vote on each edit independently — up to 20 per article.</p>
              <InlineEditsForm edits={inlineEdits} onChange={setInlineEdits} />
            </div>
          )}
        </div>

        {/* Standing Correction */}
        <div style={{ borderTop: "1px solid #E8E3D9", paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 8 }}>Optional: Standing Correction</div>
          <StandingCorrectionInput value={standingCorrection} onChange={setStandingCorrection} />
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "Filing..." : "Submit for Review"}</button>
        </div>
        <LegalDisclaimer short />
      </div>
    </div>
  );
}

function ReviewScreen({ user }) {
  const [subs, setSubs] = useState(null); const [disputes, setDisputes] = useState(null); const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null); const [voteNote, setVoteNote] = useState("");
  const [newsRating, setNewsRating] = useState(5); const [funRating, setFunRating] = useState(5);
  const [lieChecked, setLieChecked] = useState(false);
  const [editVotes, setEditVotes] = useState({}); // { editIndex: true/false }
  const [tab, setTab] = useState("ingroup");

  const load = useCallback(async () => { setSubs((await sG(SK.SUBS)) || {}); setDisputes((await sG(SK.DISPUTES)) || {}); setLoading(false); }, []);
  useEffect(() => { load(); }, []);

  const castVote = async (subId, approve, isCross) => {
    const allSubs = (await sG(SK.SUBS)) || {};
    const sub = allSubs[subId]; if (!sub) return;
    const now = new Date().toISOString();
    const vk = isCross ? "crossGroupVotes" : "votes";
    sub[vk][user.username] = { approve, note: voteNote.trim(), time: now, newsworthy: newsRating, interesting: funRating, deliberateLie: lieChecked, editVotes: { ...editVotes } };
    sub.auditTrail.push({ time: now, action: `@${user.username} voted ${approve ? "APPROVE" : "REJECT"} (${isCross ? "cross" : "in-group"}) News:${newsRating} Fun:${funRating}${lieChecked ? " ⚠LIE-BALLOT" : ""}${Object.keys(editVotes).length > 0 ? ` Edits: ${Object.values(editVotes).filter(v => v).length}/${Object.keys(editVotes).length} approved` : ""}` });

    const vc = Object.keys(sub[vk]).length;
    const app = Object.values(sub[vk]).filter(v => v.approve).length;
    const rej = vc - app;
    let resolved = false, outcome = null;

    if (app >= 2) { resolved = true; outcome = isCross ? "consensus" : "approved"; }
    else if (rej >= 2) { resolved = true; outcome = isCross ? "consensus_rejected" : "rejected"; }
    else if (vc >= 3) { resolved = true; outcome = app >= 2 ? (isCross ? "consensus" : "approved") : (isCross ? "consensus_rejected" : "rejected"); }

    if (resolved) {
      sub.status = outcome; sub.resolvedAt = now;
      // Deliberate lie: secret majority
      const allVotes = Object.values(sub[vk]);
      const lieCount = allVotes.filter(v => v.deliberateLie).length;
      const wasLie = lieCount > allVotes.length / 2;
      sub.deliberateLieFinding = wasLie;
      sub.auditTrail.push({ time: now, action: `RESOLVED: ${outcome.toUpperCase()} (${app}/${vc} approved)${wasLie ? " ⚠ DELIBERATE DECEPTION FINDING" : ""}` });
      // Resolve each inline edit independently
      if (sub.inlineEdits && sub.inlineEdits.length > 0) {
        const voters = Object.values(sub[vk]);
        sub.inlineEdits.forEach((edit, idx) => {
          const editApprovals = voters.filter(v => v.editVotes && v.editVotes[idx] === true).length;
          edit.approved = editApprovals > voters.length / 2;
        });
        const editSummary = sub.inlineEdits.map((e, i) => `Edit#${i + 1}:${e.approved ? "✓" : "✗"}`).join(" ");
        sub.auditTrail.push({ time: now, action: `Edit verdicts: ${editSummary}` });
      }
      if (!isCross) {
        const users = (await sG(SK.USERS)) || {}; const sm = users[sub.submittedBy];
        if (sm) {
          if (outcome === "approved") { sm.totalWins = (sm.totalWins || 0) + 1; sm.currentStreak = (sm.currentStreak || 0) + 1; }
          else {
            sm.totalLosses = (sm.totalLosses || 0) + 1; sm.currentStreak = 0; sm.requiredStreak = (sm.requiredStreak || 3) + 2;
            if (wasLie) sm.deliberateLies = (sm.deliberateLies || 0) + 1;
          }
          // Aggregate ratings
          sm.ratingsReceived = sm.ratingsReceived || [];
          Object.values(sub.votes).forEach(v => { if (v.newsworthy) sm.ratingsReceived.push({ newsworthy: v.newsworthy, interesting: v.interesting }); });
          sm.reviewHistory = sm.reviewHistory || []; sm.reviewHistory.push({ subId, outcome, time: now });
          users[sub.submittedBy] = sm; await sS(SK.USERS, users);
        }
      }
      // Auto-promote to cross-group if approved in-group
      if (!isCross && outcome === "approved") {
        const crossResult = await selectJury(sub.orgId, sub.submittedBy, true);
        if (!crossResult.error && crossResult.jurors.length >= 3) {
          sub.crossGroupJurors = crossResult.jurors; sub.crossGroupSeed = crossResult.seed; sub.crossGroupVotes = {};
          sub.status = "cross_review"; sub.resolvedAt = null;
          sub.auditTrail.push({ time: now, action: `Promoted to cross-group. Jury: ${crossResult.jurors.map(j => "@" + j).join(", ")} Rules: ${crossResult.rulesApplied.join(", ") || "none"}` });
        }
      }
    }
    allSubs[subId] = sub; await sS(SK.SUBS, allSubs);
    setReviewingId(null); setVoteNote(""); setNewsRating(5); setFunRating(5); setLieChecked(false); setEditVotes({}); load();
  };

  if (loading) return <Loader />;
  const all = Object.values(subs || {});
  const igQ = all.filter(s => s.status === "pending_review" && s.jurors.includes(user.username) && !s.votes[user.username]);
  const cgQ = all.filter(s => s.status === "cross_review" && s.crossGroupJurors.includes(user.username) && !s.crossGroupVotes[user.username]);
  const dQ = Object.values(disputes || {}).filter(d => d.status === "pending_review" && d.jurors.includes(user.username) && !d.votes[user.username]);

  const castDisputeVote = async (disputeId, upheld) => {
    const result = await resolveDispute(disputeId, user.username, upheld, voteNote, lieChecked);
    if (result.error) return;
    setReviewingId(null); setVoteNote(""); setLieChecked(false); load();
  };

  const renderItem = (sub, isCross) => (
    <div key={sub.id} className="ta-card" style={{ borderLeft: `4px solid ${isCross ? "#1565C0" : "#E0A040"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>@{sub.submittedBy} · {sub.orgName} · {sDate(sub.createdAt)}</span>
        <StatusPill status={sub.status} />
      </div>
      <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#2C5F7C", wordBreak: "break-all" }}>{sub.url}</a>
      <div style={{ margin: "8px 0", padding: 10, background: "#FDFAF5", borderRadius: 2 }}>
        <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680", marginBottom: 3, fontSize: 14 }}>{sub.originalHeadline}</div>
        <div style={{ fontFamily: "var(--serif)", color: "#C41E3A", fontWeight: 700, fontSize: 16 }}>{sub.replacement}</div>
      </div>
      <div style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5 }}>{sub.reasoning}</div>

      {sub.evidence && sub.evidence.length > 0 && (
        <div style={{ marginTop: 8, padding: 10, background: "#F5F0E8", borderRadius: 2 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 4 }}>📎 {sub.evidence.length} Evidence Source{sub.evidence.length > 1 ? "s" : ""}</div>
          {sub.evidence.map((e, i) => <div key={i} style={{ marginBottom: 4, fontSize: 11 }}><a href={e.url} target="_blank" rel="noopener" style={{ color: "#2C5F7C" }}>{e.url}</a>{e.explanation && <div style={{ color: "#6B6560", marginTop: 1 }}>↳ {e.explanation}</div>}</div>)}
        </div>
      )}

      {sub.inlineEdits && sub.inlineEdits.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: "#F5F0E8", borderRadius: 2 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 6 }}>{sub.inlineEdits.length} In-Line Edit{sub.inlineEdits.length > 1 ? "s" : ""} — {reviewingId === sub.id ? "vote on each" : "line-by-line review"}</div>
          {sub.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < sub.inlineEdits.length - 1 ? "1px solid #E8E3D9" : "none" }}>
              <div style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "#8B8680" }}>{e.original}</span> → <span style={{ color: "#C41E3A", fontWeight: 600 }}>{e.replacement}</span>
                {e.reasoning && <div style={{ fontSize: 11, color: "#6B6560", marginTop: 1 }}>↳ {e.reasoning}</div>}
              </div>
              {reviewingId === sub.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === true ? "#2D6A4F" : "#D4C9B8", background: editVotes[i] === true ? "#E8F5E9" : "#fff", color: editVotes[i] === true ? "#2D6A4F" : "#8B8680", borderRadius: 2, cursor: "pointer" }}>✓ Approve Edit</button>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === false ? "#C41E3A" : "#D4C9B8", background: editVotes[i] === false ? "#FDF2F2" : "#fff", color: editVotes[i] === false ? "#C41E3A" : "#8B8680", borderRadius: 2, cursor: "pointer" }}>✗ Reject Edit</button>
                </div>
              )}
              {reviewingId !== sub.id && e.approved !== undefined && (
                <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: e.approved ? "#2D6A4F" : "#C41E3A", fontWeight: 700 }}>{e.approved ? "✓ APPROVED" : "✗ REJECTED"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {sub.standingCorrection && (
        <div style={{ marginTop: 8, padding: 10, background: "#F0EBE0", border: "1px solid #D4C9B8", borderRadius: 2, fontSize: 12 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 3 }}>Standing Correction Proposed</div>
          <div style={{ color: "#4A4540", fontWeight: 600 }}>{sub.standingCorrection.assertion}</div>
          {sub.standingCorrection.evidence && <div style={{ color: "#8B8680", fontSize: 11, marginTop: 2 }}>Source: {sub.standingCorrection.evidence}</div>}
        </div>
      )}

      {reviewingId === sub.id ? (
        <div style={{ marginTop: 12, padding: 14, background: "#FDFBF7", border: "1px solid #E8E3D9", borderRadius: 2 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 10 }}>Headline Correction Verdict</div>
          <RatingInput label="How Newsworthy" value={newsRating} onChange={setNewsRating} />
          <RatingInput label="How Interesting" value={funRating} onChange={setFunRating} />
          <div className="ta-field"><label>Review Note (permanent, public)</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} placeholder="Explain your reasoning..." /></div>
          <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ta-btn-primary" style={{ background: "#2D6A4F" }} onClick={() => castVote(sub.id, true, isCross)}>✓ Approve</button>
            <button className="ta-btn-primary" style={{ background: "#C41E3A" }} onClick={() => castVote(sub.id, false, isCross)}>✗ Reject</button>
            <button className="ta-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
            <button className="ta-btn-ghost" style={{ color: "#E65100", marginLeft: "auto" }} onClick={async () => { const r = await recuseJuror(sub.id, user.username, isCross); if (r.success) { setReviewingId(null); load(); } }}>⚖ Recuse (Conflict of Interest)</button>
          </div>
          <LegalDisclaimer short />
        </div>
      ) : (
        <button className="ta-btn-secondary" style={{ marginTop: 10 }} onClick={() => {
          setReviewingId(sub.id); setVoteNote(""); setNewsRating(5); setFunRating(5); setLieChecked(false);
          const ev = {}; if (sub.inlineEdits) sub.inlineEdits.forEach((_, i) => { ev[i] = true; }); setEditVotes(ev);
        }}>Begin Review</button>
      )}
      <AuditTrail entries={sub.auditTrail} />
    </div>
  );

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Review Queue</h2>
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E8E3D9" }}>
        {[["ingroup", "In-Group", igQ.length], ["crossgroup", "Cross-Group", cgQ.length], ["disputes", "Disputes", dQ.length]].map(([k, l, c]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: tab === k ? "2px solid #1A1A1A" : "2px solid transparent", marginBottom: -2, fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", color: tab === k ? "#1A1A1A" : "#8B8680", fontWeight: tab === k ? 700 : 400 }}>
            {l} {c > 0 && <span style={{ background: k === "disputes" ? "#E65100" : "#C41E3A", color: "#fff", borderRadius: "50%", padding: "1px 5px", fontSize: 9, marginLeft: 4 }}>{c}</span>}
          </button>
        ))}
      </div>
      {tab === "ingroup" && (igQ.length === 0 ? <Empty text="No in-group reviews waiting." /> : igQ.map(s => renderItem(s, false)))}
      {tab === "crossgroup" && (cgQ.length === 0 ? <Empty text="No cross-group reviews waiting." /> : <div><p style={{ fontSize: 13, color: "#6B6560", marginBottom: 12, lineHeight: 1.5 }}>These corrections were approved by another assembly and seek cross-group consensus. Your vote determines whether everyone sees it.</p>{cgQ.map(s => renderItem(s, true))}</div>)}
      {tab === "disputes" && (dQ.length === 0 ? <Empty text="No disputes awaiting your review." /> : <div>
        <p style={{ fontSize: 13, color: "#6B6560", marginBottom: 12, lineHeight: 1.5 }}>Intra-Assembly disputes. A member is challenging another member's submission. Upholding the dispute means the submission was wrong. Dismissing means the original stands. Winners gain significant reputation.</p>
        {dQ.map(d => (
          <div key={d.id} className="ta-card" style={{ borderLeft: "4px solid #E65100" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>⚖ @{d.disputedBy} vs @{d.originalSubmitter} · {d.orgName} · {sDate(d.createdAt)}</span>
              <span style={{ fontSize: 9, padding: "2px 7px", background: "#FFF3E0", color: "#E65100", borderRadius: 2, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Dispute</span>
            </div>
            <div style={{ padding: 10, background: "#FDFAF5", borderRadius: 2, marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#6B6560", marginBottom: 3 }}>ORIGINAL SUBMISSION BY @{d.originalSubmitter}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>{d.submissionHeadline}</div>
              <div style={{ fontSize: 12, color: "#6B6560", marginTop: 4 }}>{d.submissionReasoning}</div>
            </div>
            <div style={{ padding: 10, background: "#FFF8F0", border: "1px solid #E65100", borderRadius: 2, marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#E65100", marginBottom: 3 }}>DISPUTE BY @{d.disputedBy}</div>
              <div style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5 }}>{d.reasoning}</div>
              {d.evidence && d.evidence.length > 0 && <div style={{ marginTop: 6 }}>{d.evidence.map((e, i) => <div key={i} style={{ fontSize: 11 }}><a href={e.url} target="_blank" rel="noopener" style={{ color: "#2C5F7C" }}>{e.url}</a>{e.explanation && <div style={{ color: "#6B6560" }}>↳ {e.explanation}</div>}</div>)}</div>}
            </div>
            {reviewingId === d.id ? (
              <div style={{ padding: 14, background: "#FDFBF7", border: "1px solid #E8E3D9", borderRadius: 2 }}>
                <div className="ta-field"><label>Review Note (permanent, public)</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} /></div>
                <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="ta-btn-primary" style={{ background: "#E65100" }} onClick={() => castDisputeVote(d.id, true)}>⚖ Uphold Dispute</button>
                  <button className="ta-btn-primary" style={{ background: "#2D6A4F" }} onClick={() => castDisputeVote(d.id, false)}>✓ Dismiss (Original Stands)</button>
                  <button className="ta-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
                </div>
              </div>
            ) : <button className="ta-btn-secondary" style={{ marginTop: 6 }} onClick={() => { setReviewingId(d.id); setVoteNote(""); setLieChecked(false); }}>Review Dispute</button>}
            <AuditTrail entries={d.auditTrail} />
          </div>
        ))}
      </div>)}
    </div>
  );
}

function VaultScreen({ user }) {
  const [tab, setTab] = useState("vault");
  const [vault, setVault] = useState([]); const [args, setArgs] = useState([]); const [beliefs, setBeliefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newArg, setNewArg] = useState(""); const [newBelief, setNewBelief] = useState("");

  const load = async () => {
    const v = (await sG(SK.VAULT)) || {}; const a = (await sG(SK.ARGS)) || {}; const b = (await sG(SK.BELIEFS)) || {};
    if (user.orgId) {
      setVault(Object.values(v).filter(x => x.orgId === user.orgId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setArgs(Object.values(a).filter(x => x.orgId === user.orgId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setBeliefs(Object.values(b).filter(x => x.orgId === user.orgId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user.orgId]);

  const addArg = async () => { if (!newArg.trim() || !user.orgId) return; const orgs = (await sG(SK.ORGS)) || {}; const all = (await sG(SK.ARGS)) || {}; const id = gid(); all[id] = { id, orgId: user.orgId, orgName: orgs[user.orgId]?.name || "", content: newArg.trim(), submittedBy: user.username, createdAt: new Date().toISOString() }; await sS(SK.ARGS, all); setNewArg(""); load(); };
  const addBelief = async () => { if (!newBelief.trim() || !user.orgId) return; const orgs = (await sG(SK.ORGS)) || {}; const all = (await sG(SK.BELIEFS)) || {}; const id = gid(); all[id] = { id, orgId: user.orgId, orgName: orgs[user.orgId]?.name || "", content: newBelief.trim(), submittedBy: user.username, createdAt: new Date().toISOString() }; await sS(SK.BELIEFS, all); setNewBelief(""); load(); };

  const tabs = [["vault", "The Vault"], ["args", "Arguments"], ["beliefs", "Beliefs"]];
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Assembly Vaults</h2>
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E8E3D9" }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === k ? "2px solid #1A1A1A" : "2px solid transparent", marginBottom: -2, fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", color: tab === k ? "#1A1A1A" : "#8B8680", fontWeight: tab === k ? 700 : 400 }}>{l}</button>)}
      </div>
      {loading ? <Loader /> : <>
        {tab === "vault" && <div><p style={{ color: "#6B6560", marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>Standing Corrections — reusable facts verified through jury review. Future AI will suggest applicable entries.</p>{vault.length === 0 ? <Empty text="No vault entries yet. Submit one with your next correction." /> : vault.map(v => <div key={v.id} className="ta-card" style={{ borderLeft: "4px solid #D4C9B8" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>@{v.submittedBy} · {sDate(v.createdAt)}</span><StatusPill status={v.status} /></div><div style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{v.assertion}</div>{v.evidence && <div style={{ fontSize: 11, color: "#2C5F7C", marginTop: 3 }}>{v.evidence}</div>}</div>)}</div>}
        {tab === "args" && <div><p style={{ color: "#6B6560", marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>Argument Vault — store fundamental arguments your Assembly uses across corrections. Reusable rhetorical and logical tools.</p>{args.map(a => <div key={a.id} className="ta-card" style={{ borderLeft: "4px solid #2C5F7C" }}><div style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)", marginBottom: 4 }}>@{a.submittedBy} · {sDate(a.createdAt)}</div><div style={{ fontSize: 14, lineHeight: 1.5 }}>{a.content}</div></div>)}{args.length === 0 && <Empty text="No arguments stored yet." />}<div style={{ marginTop: 14 }}><div className="ta-field"><label>New Argument</label><textarea value={newArg} onChange={e => setNewArg(e.target.value)} rows={2} placeholder="A reusable argument your Assembly makes..." /></div><button className="ta-btn-primary" onClick={addArg}>Add to Argument Vault</button></div></div>}
        {tab === "beliefs" && <div><p style={{ color: "#6B6560", marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>Foundational Belief Vault — core beliefs your Assembly holds as axioms. Not claims of fact but starting premises.</p>{beliefs.map(b => <div key={b.id} className="ta-card" style={{ borderLeft: "4px solid #7B1FA2" }}><div style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)", marginBottom: 4 }}>@{b.submittedBy} · {sDate(b.createdAt)}</div><div style={{ fontSize: 14, lineHeight: 1.5, fontStyle: "italic" }}>{b.content}</div></div>)}{beliefs.length === 0 && <Empty text="No foundational beliefs stored yet." />}<div style={{ marginTop: 14 }}><div className="ta-field"><label>New Foundational Belief</label><textarea value={newBelief} onChange={e => setNewBelief(e.target.value)} rows={2} placeholder="A core belief your Assembly holds..." /></div><button className="ta-btn-primary" onClick={addBelief}>Add to Belief Vault</button></div></div>}
      </>}
      <LegalDisclaimer short />
    </div>
  );
}

function ConsensusScreen() {
  const [subs, setSubs] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const s = (await sG(SK.SUBS)) || {}; setSubs(Object.values(s).filter(x => x.status === "consensus").sort((a, b) => hotScore(b) - hotScore(a))); setLoading(false); })(); }, []);
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">The Consensus</h2>
      <div style={{ padding: 20, background: "#F3E5F5", border: "1px solid #CE93D8", borderRadius: 2, marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.15em", color: "#7B1FA2", marginBottom: 6 }}>The Highest Prize</div>
        <p style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.5, color: "#1A1A1A", margin: "0 0 8px" }}>A consensus correction has survived the gauntlet. The submitter's assembly approved it. Then members of <em>other</em> assemblies independently agreed.</p>
        <p style={{ fontSize: 13, color: "#4A4540", margin: 0, lineHeight: 1.5 }}>Only the truth has the property that all people can recognize it.</p>
      </div>
      {loading ? <Loader /> : subs.length === 0 ? <Empty text="No consensus corrections yet. When a correction survives cross-group review, it appears here." /> :
        subs.map(sub => (
          <div key={sub.id} className="ta-card" style={{ borderLeft: "4px solid #7B1FA2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>@{sub.submittedBy} · {sub.orgName} · {fDate(sub.resolvedAt)}</span><StatusPill status="consensus" /></div>
            <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#2C5F7C", wordBreak: "break-all" }}>{sub.url}</a>
            <div style={{ margin: "8px 0", padding: 10, background: "#FDFAF5", borderRadius: 2 }}>
              <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680", marginBottom: 3, fontSize: 14 }}>{sub.originalHeadline}</div>
              <div style={{ fontFamily: "var(--serif)", color: "#C41E3A", fontWeight: 700, fontSize: 16 }}>{sub.replacement}</div>
            </div>
            <div style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5 }}>{sub.reasoning}</div>
            <AuditTrail entries={sub.auditTrail} />
            <LegalDisclaimer short />
          </div>
        ))}
    </div>
  );
}

function FeedScreen({ user }) {
  const [subs, setSubs] = useState(null); const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState({});
  const [disputingId, setDisputingId] = useState(null);
  const [disputeForm, setDisputeForm] = useState({ reasoning: "", evidence: [{ url: "", explanation: "" }] });
  const [disputeError, setDisputeError] = useState(""); const [disputeSuccess, setDisputeSuccess] = useState("");

  const load = async () => { setSubs((await sG(SK.SUBS)) || {}); setOrgs((await sG(SK.ORGS)) || {}); setLoading(false); };
  useEffect(() => { load(); }, []);

  const canDispute = (sub) => {
    if (!user || sub.submittedBy === user.username) return false;
    const userOrgs = user.orgIds || (user.orgId ? [user.orgId] : []);
    if (!userOrgs.includes(sub.orgId)) return false;
    if (!["approved", "consensus"].includes(sub.status)) return false;
    const org = orgs[sub.orgId];
    return org && org.members.length >= 100;
  };

  const submitDispute = async (subId) => {
    setDisputeError(""); setDisputeSuccess("");
    if (!disputeForm.reasoning.trim()) return setDisputeError("Reasoning required.");
    const validEvidence = disputeForm.evidence.filter(e => e.url.trim());
    const result = await fileDispute(subId, user.username, disputeForm.reasoning, validEvidence);
    if (result.error) return setDisputeError(result.error);
    setDisputeSuccess("Dispute filed. Jury selected.");
    setDisputingId(null); setDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }] });
    load();
  };

  if (loading) return <Loader />;
  const all = Object.values(subs || {}).sort((a, b) => hotScore(b) - hotScore(a));
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Assembly Record</h2>
      {disputeSuccess && <div className="ta-success">{disputeSuccess}</div>}
      {all.length === 0 ? <Empty text="No corrections yet." /> : all.map(sub => (
        <div key={sub.id} className="ta-card" style={{ borderLeft: `4px solid ${sub.status === "consensus" ? "#7B1FA2" : sub.status === "approved" ? "#2D6A4F" : sub.status === "rejected" || sub.status === "disputed" ? "#C41E3A" : "#E0A040"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>@{sub.submittedBy} · {sub.orgName} · {sDate(sub.createdAt)}</span><StatusPill status={sub.status} /></div>
          <div style={{ margin: "6px 0", padding: 8, background: "#FDFAF5", borderRadius: 2 }}>
            <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680", marginBottom: 2, fontSize: 13 }}>{sub.originalHeadline}</div>
            <div style={{ fontFamily: "var(--serif)", color: "#C41E3A", fontWeight: 700, fontSize: 15 }}>{sub.replacement}</div>
          </div>
          <div style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5 }}>{sub.reasoning}</div>
          {sub.inlineEdits && sub.inlineEdits.length > 0 && <div style={{ fontSize: 10, color: "#6B6560" }}>+ {sub.inlineEdits.length} in-line edit{sub.inlineEdits.length > 1 ? "s" : ""}{sub.inlineEdits.some(e => e.approved !== undefined) && <span> ({sub.inlineEdits.filter(e => e.approved).length} approved, {sub.inlineEdits.filter(e => e.approved === false).length} rejected)</span>}</div>}
          {sub.evidence && sub.evidence.length > 0 && <div style={{ fontSize: 10, color: "#2C5F7C" }}>📎 {sub.evidence.length} evidence source{sub.evidence.length > 1 ? "s" : ""}</div>}
          {sub.deliberateLieFinding && <div style={{ fontSize: 10, color: "#C41E3A", fontFamily: "var(--mono)", fontWeight: 700, marginTop: 2 }}>⚠ DELIBERATE DECEPTION FINDING</div>}

          {canDispute(sub) && disputingId !== sub.id && (
            <button className="ta-btn-ghost" style={{ color: "#E65100", marginTop: 6, fontSize: 11 }} onClick={() => { setDisputingId(sub.id); setDisputeError(""); setDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }] }); }}>⚖ Dispute This Submission</button>
          )}

          {disputingId === sub.id && (
            <div style={{ marginTop: 10, padding: 14, background: "#FFF8F0", border: "1.5px solid #E65100", borderRadius: 2 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#E65100", fontWeight: 700, marginBottom: 8 }}>⚖ File Intra-Assembly Dispute</div>
              <p style={{ fontSize: 12, color: "#4A4540", marginBottom: 10, lineHeight: 1.5 }}>You are disputing @{sub.submittedBy}'s submission. A jury of 3 uninvolved Assembly members will review. If upheld, you gain significant reputation. If dismissed, you take a small reputation hit.</p>
              {disputeError && <div className="ta-error">{disputeError}</div>}
              <div className="ta-field"><label>Why is this submission wrong? *</label><textarea value={disputeForm.reasoning} onChange={e => setDisputeForm({ ...disputeForm, reasoning: e.target.value })} rows={3} placeholder="Explain specifically what is incorrect, misleading, or deceptive..." /></div>
              <EvidenceFields evidence={disputeForm.evidence} onChange={ev => setDisputeForm({ ...disputeForm, evidence: ev })} />
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button className="ta-btn-primary" style={{ background: "#E65100" }} onClick={() => submitDispute(sub.id)}>File Dispute</button>
                <button className="ta-btn-ghost" onClick={() => setDisputingId(null)}>Cancel</button>
              </div>
            </div>
          )}

          <AuditTrail entries={sub.auditTrail} />
        </div>
      ))}
      <LegalDisclaimer short />
    </div>
  );
}

function ProfileScreen({ user }) {
  const [u, setU] = useState(user);
  const [orgs, setOrgs] = useState({});
  useEffect(() => { (async () => {
    const all = (await sG(SK.USERS)) || {}; if (all[user.username]) setU(all[user.username]);
    setOrgs((await sG(SK.ORGS)) || {});
  })(); }, [user.username]);
  const p = computeProfile(u);
  const pi = PROFILES[p.profile];
  const myOrgIds = u.orgIds || (u.orgId ? [u.orgId] : []);
  const myOrgs = myOrgIds.map(id => orgs[id]).filter(Boolean);
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Citizen Record</h2>
      <div className="ta-card" style={{ borderLeft: `4px solid ${pi.color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h3 style={{ margin: 0, fontSize: 22, fontFamily: "var(--serif)" }}>@{u.displayName || u.username}</h3><div style={{ color: "#6B6560", fontSize: 13, marginTop: 3 }}>{u.realName}</div></div>
          <Badge profile={p.profile} score={p.assemblyIndex} />
        </div>
        {/* Org memberships */}
        {myOrgs.length > 0 && <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => <span key={o.id} style={{ fontSize: 9, padding: "2px 7px", fontFamily: "var(--mono)", borderRadius: 2, background: o.id === u.orgId ? "#2D6A4F" : o.isGeneralPublic ? "#E3F2FD" : "#F5F0E8", color: o.id === u.orgId ? "#fff" : o.isGeneralPublic ? "#1565C0" : "#6B6560", fontWeight: o.id === u.orgId ? 700 : 400 }}>{o.isGeneralPublic ? "🏛" : "⬡"} {o.name}{o.id === u.orgId ? " ★" : ""}</span>)}
        </div>}
        <div style={{ fontSize: 10, color: "#8B8680", marginTop: 4 }}>{myOrgs.length}/{MAX_ORGS} assemblies</div>
        {/* Profile explanation */}
        <div style={{ marginTop: 14, padding: 12, background: "#F5F0E8", borderRadius: 2 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: pi.color, marginBottom: 4 }}>Profile: {p.profile}</div>
          <div style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5 }}>{pi.desc}</div>
          <div style={{ fontSize: 10, color: "#8B8680", marginTop: 6, lineHeight: 1.5 }}>
            Assembly Index ({p.assemblyIndex}): Wins +1 each + streak bonus (+{p.streakBoost}). Wrong: 3× penalty. Deliberate lie: 9× penalty. Dispute wins: 3× bonus. Loss penalty total: {p.effectiveLossPenalty} effective. Adjusted accuracy: {p.adjustedAccuracy}% (×65%) + impact: N:{p.avgNews} F:{p.avgFun} (×35%).
            {p.lies > 0 && <span style={{ color: "#C41E3A", fontWeight: 700 }}> ⚠ {p.lies} deliberate deception finding{p.lies > 1 ? "s" : ""}.</span>}
            {(p.disputeWins > 0 || p.disputeLosses > 0) && <span style={{ color: "#E65100" }}> Disputes: {p.disputeWins}W / {p.disputeLosses}L</span>}
          </div>
        </div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {[["#2D6A4F", p.wins, "Wins"], ["#C41E3A", p.losses, "Losses"], ["#880E4F", p.lies, "Lies"], ["#2C5F7C", p.streak, "Streak"], [pi.color, p.avgNews, "News"], [pi.color, p.avgFun, "Fun"]].map(([c, n, l], i) => (
            <div key={i} style={{ textAlign: "center", padding: 8, background: "#F5F0E8", borderRadius: 2 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#8B8680", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#6B6560" }}><strong>{p.streak}</strong>/{p.required} wins for {p.highTrust ? "maintained " : ""}high trust</div>
        <div style={{ background: "#E8E3D9", borderRadius: 2, height: 8, overflow: "hidden", marginTop: 4 }}><div style={{ width: `${Math.min(100, (p.streak / p.required) * 100)}%`, height: "100%", background: p.highTrust ? "#2D6A4F" : "#2C5F7C", borderRadius: 2 }} /></div>
      </div>
      <div className="ta-card">
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "3px 12px", fontSize: 13 }}>
          {[["Username", "@" + u.username], ["Legal Name", u.realName], ["Email", u.email || "—"], ["Gender", u.gender || "—"], ["Signed Up", fDate(u.signupDate)], ["Account Age", daysSince(u.signupDate) + " days"], ["Session", u.ipHash], ["Password", u.passwordHash ? "🔒 Hashed" : "⚠ None"]].map(([l, v], i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ color: "#8B8680", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", padding: "3px 0" }}>{l}</div>
              <div style={{ color: "#4A4540", padding: "3px 0" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditScreen() {
  const [audit, setAudit] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setAudit([...((await sG(SK.AUDIT)) || [])].reverse()); setLoading(false); })(); }, []);
  if (loading) return <Loader />;
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Transparency Ledger</h2>
      <p style={{ color: "#6B6560", marginBottom: 16, fontSize: 14, lineHeight: 1.5 }}>Every action. Nothing hidden. Nothing deleted.</p>
      {(!audit || audit.length === 0) ? <Empty text="No activity." /> :
        <div style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{audit.map((e, i) => (
          <div key={i} style={{ padding: "6px 10px", background: i % 2 === 0 ? "#F5F0E8" : "#FDFBF7", borderBottom: "1px solid #E8E3D9", lineHeight: 1.4 }}>
            <span style={{ color: "#8B8680" }}>{fDate(e.time)}</span><br />{e.action}
          </div>
        ))}</div>}
    </div>
  );
}

// Org screen is long — keeping from v3 with minor updates (omitting for space, imported via the same logic)
function OrgScreen({ user, onUpdate }) {
  const [orgs, setOrgs] = useState(null); const [subs, setSubs] = useState(null); const [apps, setApps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false); const [newOrg, setNewOrg] = useState({ name: "", description: "", charter: "" });
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const [search, setSearch] = useState(""); const [sortBy, setSortBy] = useState("activity");

  const load = useCallback(async () => {
    const [o, s, a] = await Promise.all([sG(SK.ORGS), sG(SK.SUBS), sG(SK.APPS)]);
    setOrgs(o || {}); setSubs(s || {}); setApps(a || {}); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const orgStats = useMemo(() => {
    if (!orgs || !subs) return {};
    const st = {};
    for (const [oid, org] of Object.entries(orgs)) {
      const os = Object.values(subs).filter(s => s.orgId === oid);
      const approved = os.filter(s => ["approved", "consensus", "cross_review"].includes(s.status)).length;
      const consensus = os.filter(s => s.status === "consensus").length;
      const lastAct = os.length > 0 ? Math.max(...os.map(s => new Date(s.resolvedAt || s.createdAt).getTime())) : new Date(org.createdAt).getTime();
      const dsa = Math.max(1, (Date.now() - lastAct) / 86400000);
      st[oid] = { total: os.length, approved, consensus, activityScore: org.members.length * 2 + approved * 5 + consensus * 15 + 10 / dsa, juryReady: org.members.length >= 4 };
    }
    return st;
  }, [orgs, subs]);

  const myOrgIds = user.orgIds || (user.orgId ? [user.orgId] : []);
  const isMember = (oid) => myOrgIds.includes(oid);

  const updateUser = async (updates) => {
    const users = (await sG(SK.USERS)) || {};
    users[user.username] = { ...users[user.username], ...updates };
    await sS(SK.USERS, users);
    onUpdate({ ...user, ...updates });
  };

  const createOrg = async () => {
    setError(""); if (!newOrg.name.trim()) return setError("Name required."); if (!newOrg.description.trim()) return setError("Description required.");
    if (myOrgIds.length >= MAX_ORGS) return setError(`You can join up to ${MAX_ORGS} assemblies.`);
    const id = gid(); const now = new Date().toISOString();
    const org = { id, name: newOrg.name.trim(), description: newOrg.description.trim(), charter: newOrg.charter.trim(), createdBy: user.username, createdAt: now, members: [user.username] };
    const up = { ...orgs, [id]: org }; await sS(SK.ORGS, up);
    const newIds = [...myOrgIds, id];
    await updateUser({ orgId: id, orgIds: newIds });
    setOrgs(up); setCreating(false); setNewOrg({ name: "", description: "", charter: "" });
  };

  const joinOrg = async (oid) => {
    const o = orgs[oid]; if (!o) return;
    setError(""); setSuccess("");
    if (isMember(oid)) return setError("Already a member.");
    if (myOrgIds.length >= MAX_ORGS) return setError(`You can join up to ${MAX_ORGS} assemblies. Leave one first.`);
    const enr = checkEnrollment(o);
    if (!enr.open) {
      // Create sponsorship application
      const allApps = (await sG(SK.APPS)) || {};
      const existing = Object.values(allApps).find(a => a.userId === user.username && a.orgId === oid && a.status === "pending");
      if (existing) return setError("You already have a pending application to this assembly.");
      const app = { id: gid(), userId: user.username, displayName: user.displayName || user.username, orgId: oid, orgName: o.name, sponsorsNeeded: enr.sponsors, sponsors: [], status: "pending", createdAt: new Date().toISOString() };
      allApps[app.id] = app; await sS(SK.APPS, allApps); setApps(allApps);
      setSuccess(`Application submitted to ${o.name}. ${enr.sponsors} sponsor${enr.sponsors > 1 ? "s" : ""} must approve.`);
      return;
    }
    // Open enrollment — join directly
    const up = { ...orgs }; if (!up[oid].members.includes(user.username)) up[oid].members.push(user.username); await sS(SK.ORGS, up);
    const newIds = [...myOrgIds, oid];
    await updateUser({ orgId: oid, orgIds: newIds });
    setOrgs(up);
    if (up[oid].members.length >= 4) {
      const allSubs = (await sG(SK.SUBS)) || {}; let ch = false;
      for (const sub of Object.values(allSubs)) {
        if (sub.orgId === oid && sub.status === "pending_jury") {
          const r = await selectJury(oid, sub.submittedBy); if (!r.error) { sub.jurors = r.jurors; sub.jurySeed = r.seed; sub.status = "pending_review"; sub.auditTrail.push({ time: new Date().toISOString(), action: `Jury assigned: ${r.jurors.map(j => "@" + j).join(", ")}` }); ch = true; }
        }
      }
      if (ch) await sS(SK.SUBS, allSubs);
    }
  };

  const leaveOrg = async (oid) => {
    setError("");
    const gpId = await sG(SK.GP);
    if (oid === gpId) return setError("You can't leave The General Public.");
    if (!isMember(oid)) return;
    const up = { ...orgs };
    if (up[oid]) { up[oid].members = up[oid].members.filter(m => m !== user.username); if (!up[oid].members.length && !up[oid].isGeneralPublic) delete up[oid]; }
    await sS(SK.ORGS, up);
    const newIds = myOrgIds.filter(id => id !== oid);
    const newActive = user.orgId === oid ? (gpId || newIds[0]) : user.orgId;
    await updateUser({ orgId: newActive, orgIds: newIds });
    setOrgs(up);
  };

  const switchActive = async (oid) => {
    if (!isMember(oid)) return;
    await updateUser({ orgId: oid });
  };

  const sponsorApp = async (appId) => {
    const allApps = (await sG(SK.APPS)) || {};
    const app = allApps[appId]; if (!app || app.status !== "pending") return;
    if (app.sponsors.includes(user.username)) return;
    app.sponsors.push(user.username);
    if (app.sponsors.length >= app.sponsorsNeeded) {
      app.status = "approved";
      // Actually add the user
      const up = (await sG(SK.ORGS)) || {};
      if (up[app.orgId] && !up[app.orgId].members.includes(app.userId)) {
        up[app.orgId].members.push(app.userId);
        await sS(SK.ORGS, up); setOrgs(up);
      }
      const users = (await sG(SK.USERS)) || {};
      const applicant = users[app.userId];
      if (applicant) {
        const aIds = applicant.orgIds || []; if (!aIds.includes(app.orgId)) aIds.push(app.orgId);
        applicant.orgIds = aIds; applicant.orgId = app.orgId;
        users[app.userId] = applicant; await sS(SK.USERS, users);
        if (app.userId === user.username) onUpdate(applicant);
      }
      const audit = (await sG(SK.AUDIT)) || [];
      audit.push({ time: new Date().toISOString(), action: `@${app.userId} approved to join "${app.orgName}" (${app.sponsors.length} sponsors)` });
      await sS(SK.AUDIT, audit);
    }
    allApps[appId] = app; await sS(SK.APPS, allApps); setApps(allApps); load();
  };

  if (loading) return <Loader />;

  const activeOrg = user.orgId ? orgs[user.orgId] : null;
  const myOrgs = myOrgIds.map(id => orgs[id]).filter(Boolean);
  const orgList = Object.values(orgs || {}).filter(o => {
    if (o.isGeneralPublic) return false;
    if (isMember(o.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase(); return o.name.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q);
  }).sort((a, b) => { const sa = orgStats[a.id] || { activityScore: 0 }; const sb = orgStats[b.id] || { activityScore: 0 }; if (sortBy === "members") return b.members.length - a.members.length; if (sortBy === "newest") return new Date(b.createdAt) - new Date(a.createdAt); if (sortBy === "az") return a.name.localeCompare(b.name); return sb.activityScore - sa.activityScore; });
  const sorts = [["activity", "Active"], ["members", "Members"], ["newest", "New"], ["az", "A–Z"]];

  // Pending apps for assemblies I'm in (to sponsor)
  const pendingApps = Object.values(apps || {}).filter(a => a.status === "pending" && isMember(a.orgId) && a.userId !== user.username);
  // My pending apps
  const myPendingApps = Object.values(apps || {}).filter(a => a.status === "pending" && a.userId === user.username);

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Trust Assemblies</h2>
      {error && <div className="ta-error">{error}</div>}
      {success && <div className="ta-success">{success}</div>}

      {/* My Assemblies */}
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 8 }}>Your Assemblies ({myOrgs.length}/{MAX_ORGS})</div>
      {myOrgs.map(o => {
        const isActive = user.orgId === o.id;
        const isGP = !!o.isGeneralPublic;
        const st = orgStats[o.id] || {};
        return (
          <div key={o.id} className="ta-card" style={{ borderLeft: `4px solid ${isActive ? "#2D6A4F" : isGP ? "#2C5F7C" : "#D4C9B8"}`, opacity: isActive ? 1 : 0.85 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                  <strong style={{ fontSize: 15, fontFamily: "var(--serif)" }}>{o.name}</strong>
                  {isActive && <span style={{ fontSize: 8, padding: "2px 6px", background: "#E8F5E9", color: "#2D6A4F", borderRadius: 2, fontFamily: "var(--mono)", fontWeight: 700 }}>★ ACTIVE</span>}
                  {isGP && <span style={{ fontSize: 8, padding: "2px 6px", background: "#E3F2FD", color: "#1565C0", borderRadius: 2, fontFamily: "var(--mono)", fontWeight: 700 }}>🏛 HOME</span>}
                </div>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#8B8680" }}>{o.members.length} members · {checkEnrollment(o).label}{st.total > 0 ? ` · ${st.total} subs` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {!isActive && <button className="ta-btn-secondary" style={{ fontSize: 9, padding: "4px 10px" }} onClick={() => switchActive(o.id)}>Set Active</button>}
                {!isGP && <button className="ta-btn-ghost" style={{ color: "#C41E3A", fontSize: 10, padding: "4px 8px" }} onClick={() => leaveOrg(o.id)}>Leave</button>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Pending apps I've submitted */}
      {myPendingApps.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#E65100", marginBottom: 6 }}>Your Pending Applications</div>
        {myPendingApps.map(a => (
          <div key={a.id} className="ta-card" style={{ borderLeft: "4px solid #FFA726", fontSize: 12, padding: 12 }}>
            <strong>{a.orgName}</strong> — {a.sponsors.length}/{a.sponsorsNeeded} sponsors
            <div style={{ fontSize: 10, color: "#8B8680", marginTop: 2 }}>Applied {sDate(a.createdAt)}</div>
          </div>
        ))}
      </div>}

      {/* Sponsor requests */}
      {pendingApps.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#2C5F7C", marginBottom: 6 }}>Sponsorship Requests ({pendingApps.length})</div>
        {pendingApps.map(a => (
          <div key={a.id} className="ta-card" style={{ borderLeft: "4px solid #2C5F7C", padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13 }}><strong>@{a.displayName}</strong> wants to join <strong>{a.orgName}</strong></div>
                <div style={{ fontSize: 10, color: "#8B8680", marginTop: 2 }}>{a.sponsors.length}/{a.sponsorsNeeded} sponsors · Applied {sDate(a.createdAt)}</div>
              </div>
              {a.sponsors.includes(user.username) ?
                <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#2D6A4F", fontWeight: 700 }}>✓ Sponsored</span> :
                <button className="ta-btn-secondary" style={{ fontSize: 9, padding: "4px 10px" }} onClick={() => sponsorApp(a.id)}>Sponsor</button>
              }
            </div>
          </div>
        ))}
      </div>}

      {/* Found / Discover */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 className="ta-label" style={{ margin: 0 }}>Discover Assemblies</h3>
          <div style={{ display: "flex", gap: 4 }}>
            {!creating && myOrgIds.length < MAX_ORGS && <button onClick={() => setCreating(true)} style={{ padding: "3px 10px", fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", background: "#1A1A1A", color: "#F5F0E8", border: "none", borderRadius: 2, cursor: "pointer", fontWeight: 600 }}>+ Found</button>}
            {sorts.map(([k, l]) => <button key={k} onClick={() => setSortBy(k)} style={{ padding: "3px 8px", fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", background: sortBy === k ? "#1A1A1A" : "#F5F0E8", color: sortBy === k ? "#F5F0E8" : "#8B8680", border: `1px solid ${sortBy === k ? "#1A1A1A" : "#D4C9B8"}`, borderRadius: 2, cursor: "pointer" }}>{l}</button>)}
          </div>
        </div>

        {creating && <div className="ta-card" style={{ marginBottom: 14 }}>
          <div className="ta-field"><label>Name *</label><input value={newOrg.name} onChange={e => setNewOrg({ ...newOrg, name: e.target.value })} /></div>
          <div className="ta-field"><label>Description *</label><input value={newOrg.description} onChange={e => setNewOrg({ ...newOrg, description: e.target.value })} /></div>
          <div className="ta-field"><label>Charter</label><textarea value={newOrg.charter} onChange={e => setNewOrg({ ...newOrg, charter: e.target.value })} rows={2} /></div>
          <div style={{ display: "flex", gap: 10 }}><button className="ta-btn-primary" onClick={createOrg}>Found Assembly</button><button className="ta-btn-ghost" onClick={() => setCreating(false)}>Cancel</button></div>
        </div>}

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assemblies..." style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #D4C9B8", background: "#fff", fontSize: 13, borderRadius: 2, marginBottom: 12, boxSizing: "border-box" }} />

        {orgList.length === 0 ? <Empty text="No other assemblies to discover." /> : orgList.map(o => {
          const st = orgStats[o.id] || {}; const enr = checkEnrollment(o);
          const hasPending = Object.values(apps || {}).some(a => a.userId === user.username && a.orgId === o.id && a.status === "pending");
          const atLimit = myOrgIds.length >= MAX_ORGS;
          return (
            <div key={o.id} className="ta-card" style={{ borderLeft: `4px solid ${st.juryReady ? "#2D6A4F" : "#E0A040"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15, fontFamily: "var(--serif)" }}>{o.name}</strong>
                    {st.juryReady ? <span style={{ fontSize: 8, padding: "1px 5px", background: "#E8F5E9", color: "#2D6A4F", borderRadius: 2, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Active</span> : <span style={{ fontSize: 8, padding: "1px 5px", background: "#FFF8E1", color: "#F9A825", borderRadius: 2, fontFamily: "var(--mono)", fontWeight: 700 }}>+{Math.max(0, 4 - o.members.length)}</span>}
                    {!enr.open && <span style={{ fontSize: 8, padding: "1px 5px", background: "#FFF3E0", color: "#E65100", borderRadius: 2, fontFamily: "var(--mono)", fontWeight: 700 }}>{enr.label}</span>}
                  </div>
                  {o.description && <p style={{ color: "#4A4540", margin: "2px 0 6px", fontSize: 13, lineHeight: 1.4 }}>{o.description}</p>}
                  <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: "var(--mono)", color: "#8B8680", flexWrap: "wrap" }}>
                    <span>{o.members.length} members</span>
                    {st.total > 0 && <span>{st.total} subs</span>}
                    {st.approved > 0 && <span style={{ color: "#2D6A4F" }}>{st.approved} approved</span>}
                    {st.consensus > 0 && <span style={{ color: "#7B1FA2" }}>{st.consensus} consensus</span>}
                  </div>
                </div>
                <div style={{ marginLeft: 12 }}>
                  {hasPending ? <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#E65100" }}>Pending...</span>
                  : atLimit ? <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#8B8680" }}>{MAX_ORGS}/{MAX_ORGS}</span>
                  : enr.open ? <button className="ta-btn-secondary" onClick={() => joinOrg(o.id)}>Join</button>
                  : <button className="ta-btn-secondary" onClick={() => joinOrg(o.id)}>Apply</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeOrg && <InviteCTA orgName={activeOrg.name} memberCount={activeOrg.members.length} />}
    </div>
  );
}

function Empty({ text }) { return <div style={{ textAlign: "center", padding: 36, color: "#8B8680", fontSize: 13 }}>{text}</div>; }
function Loader() { return <div style={{ textAlign: "center", padding: 36, color: "#8B8680", fontFamily: "var(--mono)", fontSize: 12 }}>Loading...</div>; }

function AboutScreen() {
  return (
    <div><div className="ta-section-rule" /><h2 className="ta-section-head">About</h2>
      <div className="ta-card" style={{ fontSize: 14, lineHeight: 1.7, color: "#4A4540" }}>
        <p style={{ marginBottom: 14 }}>The Trust Assembly was created by a technologist and writer who grew tired of watching institutional trust decay while no one built anything to replace it.</p>
        <p style={{ marginBottom: 14 }}>The core insight: truth is the only thing that survives adversarial review. Structure conflict correctly — where winning requires being right — and selfishness serves honesty. This is mechanism design applied to editorial integrity.</p>
        <p style={{ marginBottom: 14 }}>Two-tier review (in-group, then cross-group) prevents filter bubbles while maintaining trust foundations. Your group checks your work. Then strangers check your group. What survives both is the closest thing to verified truth that distributed systems can produce.</p>
        <p style={{ marginBottom: 14 }}>This platform was vibe-coded with Claude by Anthropic — an AI that served as architect, engineer, and sparring partner throughout the build. Every feature, every algorithm, every design decision was a conversation between a human with a vision and an AI that could execute it.</p>
        <div style={{ padding: 14, background: "#F5F0E8", borderRadius: 2 }}><div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B6560", marginBottom: 6 }}>Motto</div><div style={{ fontFamily: "var(--serif)", fontSize: 18, fontStyle: "italic" }}>Truth Will Out.</div><div style={{ fontSize: 13, color: "#6B6560", marginTop: 2 }}>The truth cannot be hidden forever.</div></div>
      </div>
    </div>
  );
}

function RulesScreen() {
  const S = ({ children }) => <h3 style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 6, marginTop: 20 }}>{children}</h3>;
  return (
    <div><div className="ta-section-rule" /><h2 className="ta-section-head">Rules & Policies</h2>
      <div style={{ padding: 12, background: "#FFF3E0", border: "1.5px solid #E65100", borderRadius: 2, marginBottom: 16, fontSize: 12, color: "#E65100", lineHeight: 1.6 }}>
        <strong>⚠ BETA:</strong> The Trust Assembly is in early beta. Features may change, data may be reset, and the system is under active development. <strong>Do not enter sensitive personal information.</strong> Use a pseudonym if you prefer. By participating you acknowledge this is an experimental platform.
      </div>
      <div className="ta-card" style={{ fontSize: 13, lineHeight: 1.7, color: "#4A4540" }}>
        <S>I. Purpose</S><p>Truth emerges through structured adversarial review. The only way to build reputation is honesty. The cost of lying is severe enough to make deception irrational.</p>
        <S>II. Assemblies & Enrollment</S><p>Citizens may join up to 12 Assemblies simultaneously. Every citizen is permanently enrolled in The General Public. Under 100 members: Open enrollment. 100–999: One sponsor required. 1,000–9,999: Two sponsors. 10,000+: Three sponsors. When sponsors are required, joining creates a pending application visible to current members — any member can sponsor. Republic-style self-governance activates with 1,000,000+ citizens. Scoring is tracked separately per Assembly. Each Assembly carries a composite trust score from its top 20% (70% weight) adjusted by its bottom 20% (30% weight).</p>
        <S>III. Submissions</S><p>Citizens submit headline corrections with reasoning and evidence URLs. Optional: up to 20 in-line article edits (each voted on independently by jurors), Vault entries (Standing Corrections, Arguments, Foundational Beliefs).</p>
        <S>IV. Jury Review</S><p>Random jury of 3 citizens. Rules escalate: 100+ members: no repeat reviewer, diversity attempt. 500+: join-date filter. 1,000+: 24h cooldown. Recusal always available. 2-of-3 majority decides. Approved corrections advance to cross-group review.</p>
        <S>V. Cross-Group Consensus</S><p>3 jurors from other Assemblies review approved corrections. Surviving both = Consensus — the highest trust signal. Requires 5+ Assemblies with 100+ members.</p>
        <S>VI. Intra-Assembly Disputes</S><p>At 100+ members, citizens may dispute other members' content. 3 uninvolved jurors, same rules. Winners get significant reputation gains. Losers lose reputation, severity depends on Deliberate Deception Finding.</p>
        <S>VII. Deliberate Deception Findings</S><p>During any review, jurors cast a secret ballot certifying the submission is a deliberate lie, gross misrepresentation, or intentional omission. Simple majority triggers a Finding. Penalty: 9× (vs 3× for being wrong). Juror identity never revealed to submitter.</p>
        <S>VIII. Retractions</S><p>Citizens may voluntarily retract. Lie retraction within 1 week: recovers 50% of penalty. Wrong retraction within 1 week: recovers 90%. Each subsequent week removes 10% of amelioration until zero. Flat subtraction, not exponential.</p>
        <S>IX. Scoring</S><p>Assembly Index (0–100). Wins: +1 + quadratic streak bonus. Wrong: 3× penalty. Lie: 9× penalty. Formula: Adjusted Accuracy (65%) + Impact (35%). Profiles: Oracle, Diligent Reporter, Raconteur, Archivist, Demagogue, Overreacher, Court Jester, Apprentice.</p>
        <S>X. The Vaults</S><p>The Vault: Standing Corrections (reusable verified facts). Argument Vault: Fundamental arguments for reuse. Foundational Belief Vault: Core axioms — starting premises, not claims of fact.</p>
        <S>XI. Legal</S><p>Citizens bear sole responsibility for all content. The Trust Assembly makes no representations regarding accuracy. Jury decisions reflect peer consensus, not institutional endorsement.</p>
      </div>
    </div>
  );
}

// ── Synthetic Data ──

// ============================================================
// ONBOARDING FLOW
// ============================================================

const OB_STEPS = ["submit", "review", "compare", "launch"];
const OB_STEP_LABELS = ["1. Submit", "2. Review", "3. Results", "4. Begin"];

// The sample article being corrected
const OB_ARTICLE = {
  url: "https://the-daily-falsehood.com/opinion/evil-is-good-actually",
  originalHeadline: "Evil Is Good, According to Experts",
  correctedHeadline: "Evil Is Still Bad, According to Every Credible Expert",
  originalBody: [
    "In a groundbreaking development that has shocked absolutely no one paying attention, several unnamed experts have concluded that evil is, in fact, good.",
    "Many experts agree that crime should be legal. The reasoning, according to these totally real researchers, is that if crime were legal, we wouldn't need to spend money on law enforcement.",
    "Studies show that lying to people consistently produces better outcomes than honesty. Researchers at the University of Nowhere found that subjects who were lied to reported higher satisfaction scores, primarily because they didn't know any better.",
    "Critics of this view have been largely silenced. When asked for comment, Dr. Jane Ethics of the Institute for Actual Research said the study was 'completely fabricated,' but her opinion was excluded from this article because it conflicted with our predetermined conclusion.",
    "The economic implications are staggering. If evil is good, then several major industries would need to completely restructure their moral frameworks, which consultants estimate could generate $4.2 trillion in new revenue.",
  ],
  inlineEdits: [
    {
      original: "Many experts agree that crime should be legal.",
      replacement: "[CORRECTION: No credible experts support legalizing crime. This claim is not supported by any credible expert, from either the perspective of societal well-being or criminal justice.]",
      reasoning: "This is a fabricated claim presented as fact. No citation is provided because none exists.",
      paragraph: 1,
    },
    {
      original: "Studies show that lying to people consistently produces better outcomes than honesty.",
      replacement: "[CORRECTION: No peer-reviewed study supports this claim. Meta-analyses consistently show that institutional and interpersonal trust, built on honesty, correlates with better societal outcomes.]",
      reasoning: "The cited 'University of Nowhere' does not exist. The claim inverts established research findings.",
      paragraph: 2,
    },
    {
      original: "her opinion was excluded from this article because it conflicted with our predetermined conclusion",
      replacement: "[CORRECTION: The author admits to excluding contradictory expert testimony, which is a textbook example of selection bias and journalistic malpractice.]",
      reasoning: "The article accidentally admits to the very thing it's doing — a self-own of editorial proportions.",
      paragraph: 3,
    },
  ],
  vaultEntry: { type: "vault", assertion: "Crime is bad because it hurts people. Obviously.", evidence: "Literally all of recorded human civilization." },
  argEntry: { content: "When an article presents a fringe claim as expert consensus without naming specific experts or citing peer-reviewed research, the appropriate correction is to note the absence of evidence — not to disprove the unfalsifiable." },
  beliefEntry: { content: "People deserve to not be victimized by crime. A functioning society requires that its members can reasonably expect safety from deliberate harm." },
};

// Explanation cards
function ExplainBox({ title, children, color = "#2C5F7C", icon = "📘" }) {
  return (
    <div style={{ margin: "14px 0", padding: 14, background: "#F0F4F8", border: `1.5px solid ${color}40`, borderLeft: `4px solid ${color}`, borderRadius: 2 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color, fontWeight: 700, marginBottom: 6 }}>{icon} {title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4540" }}>{children}</div>
    </div>
  );
}

function HighlightField({ label, value, color, note, isTextarea }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{
        padding: "9px 11px", border: `1.5px solid ${color || "#D4C9B8"}`, background: "#FDFBF7",
        fontSize: 14, lineHeight: 1.5, color: "#1A1A1A", borderRadius: 1,
        minHeight: isTextarea ? 60 : "auto", whiteSpace: isTextarea ? "pre-wrap" : "normal",
      }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: "#8B8680", marginTop: 3, fontStyle: "italic" }}>{note}</div>}
    </div>
  );
}

// ── Step 1: Submit ──
function OBSubmitStep() {
  const [revealed, setRevealed] = useState(0);
  useEffect(() => { const t = setInterval(() => setRevealed(r => Math.min(r + 1, 20)), 400); return () => clearInterval(t); }, []);

  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Step 1: Submit a Correction</h2>
      <p style={{ fontSize: 15, color: "#4A4540", lineHeight: 1.6, marginBottom: 20 }}>When you find a misleading headline, you submit a correction with evidence. Here's what that looks like — we've filled in an example.</p>

      <ExplainBox title="Article URL" icon="🔗">Every correction starts with the article you're correcting. Paste the URL so jurors can read the original.</ExplainBox>
      <HighlightField label="Article URL" value={OB_ARTICLE.url} note="This links directly to the offending article." />

      <ExplainBox title="The Headlines" icon="✏️">You quote the original headline exactly, then propose your corrected replacement. Your replacement should be factual, not editorial — the goal is truth, not dunking.</ExplainBox>
      <HighlightField label="Original Headline" value={OB_ARTICLE.originalHeadline} />
      <HighlightField label="Proposed Correction — the red pen" value={OB_ARTICLE.correctedHeadline} color="#C41E3A" />

      <HighlightField label="Reasoning" value="The article presents the claim 'evil is good' as expert consensus. No experts are named, no studies are cited, and the article itself admits to excluding contradictory evidence. The headline misrepresents the article's own content." isTextarea note="Explain WHY the original is misleading. This is what jurors evaluate." />

      {revealed >= 2 && <>
        <ExplainBox title="Supporting Evidence" icon="📎" color="#2D6A4F">You can attach URLs that support your correction — news articles, studies, primary sources. Each one gets an explanation of what it proves.</ExplainBox>
        <div style={{ padding: 12, background: "#F5F0E8", border: "1px solid #E8E3D9", borderRadius: 2, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 6 }}>Evidence #1</div>
          <div style={{ fontSize: 13 }}><a href="#" style={{ color: "#2C5F7C" }}>https://ethics-institute.org/evil-still-bad-2025</a></div>
          <div style={{ fontSize: 12, color: "#6B6560", marginTop: 2 }}>↳ Comprehensive meta-analysis confirming evil remains bad. Sample size: all of human history.</div>
        </div>
      </>}

      {revealed >= 3 && <>
        <ExplainBox title="In-Line Article Edits" icon="🔴" color="#C41E3A">Beyond the headline, you can correct specific claims within the article body — up to 20 edits per article. Each edit is voted on independently by jurors, so a strong headline can survive even if one edit is weak. Each edit shows the original text, your correction, and your reasoning.</ExplainBox>
        <div style={{ padding: 14, background: "#FDFBF7", border: "1px solid #E8E3D9", borderRadius: 2, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#8B8680", marginBottom: 8 }}>3 In-Line Edits</div>
          {OB_ARTICLE.inlineEdits.map((edit, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < 2 ? "1px solid #E8E3D9" : "none" }}>
              <div style={{ fontSize: 12, textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680", marginBottom: 3 }}>{edit.original}</div>
              <div style={{ fontSize: 12, color: "#C41E3A", fontWeight: 600, marginBottom: 3 }}>{edit.replacement}</div>
              <div style={{ fontSize: 11, color: "#6B6560", fontStyle: "italic" }}>↳ {edit.reasoning}</div>
            </div>
          ))}
        </div>
      </>}

      {revealed >= 5 && <>
        <ExplainBox title="The Vault — Standing Correction" icon="🏛" color="#6B6560">A Standing Correction is a reusable fact that your Assembly can reference in future submissions. Once verified, it lives in your Assembly's Vault and can be applied across many articles.</ExplainBox>
        <div style={{ padding: 12, background: "#F0EBE0", border: "1px solid #D4C9B8", borderRadius: 2, marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 4 }}>🏛 The Vault — Standing Correction</div>
          <div style={{ fontSize: 14, fontFamily: "var(--serif)", fontWeight: 600, marginBottom: 3 }}>{OB_ARTICLE.vaultEntry.assertion}</div>
          <div style={{ fontSize: 11, color: "#2C5F7C" }}>{OB_ARTICLE.vaultEntry.evidence}</div>
        </div>

        <ExplainBox title="Argument Vault" icon="⚔️" color="#2C5F7C">Arguments are logical tools your Assembly reuses. They're not facts — they're patterns of reasoning your group applies when a specific type of misleading claim appears.</ExplainBox>
        <div style={{ padding: 12, background: "#EDF2F7", border: "1px solid #C5D4E0", borderRadius: 2, marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#2C5F7C", marginBottom: 4 }}>⚔️ Argument Vault</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{OB_ARTICLE.argEntry.content}</div>
        </div>

        <ExplainBox title="Foundational Belief Vault" icon="🧭" color="#7B1FA2">Foundational Beliefs are axioms — things your Assembly takes as starting premises. They're not claims that need evidence; they're values your group builds from. Other Assemblies may have different ones, and that's by design.</ExplainBox>
        <div style={{ padding: 12, background: "#F3E8F9", border: "1px solid #CE93D8", borderRadius: 2, marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#7B1FA2", marginBottom: 4 }}>🧭 Foundational Belief</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, fontStyle: "italic" }}>{OB_ARTICLE.beliefEntry.content}</div>
        </div>
      </>}
    </div>
  );
}

// ── Step 2: Review ──
function OBReviewStep() {
  const [newsRating, setNewsRating] = useState(8);
  const [funRating, setFunRating] = useState(9);
  const [lieChecked, setLieChecked] = useState(false);
  const [voteNote, setVoteNote] = useState("");
  const [voted, setVoted] = useState(false);
  const [editVotes, setEditVotes] = useState({ 0: true, 1: true, 2: true }); // default approve all

  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Step 2: Jury Review</h2>
      <p style={{ fontSize: 15, color: "#4A4540", lineHeight: 1.6, marginBottom: 6 }}>After submission, 3 randomly selected jurors from your Assembly review your correction. Here's what a juror sees.</p>

      <ExplainBox title="Important" icon="⚖️" color="#E65100">In the real system, you can never review your own submissions. We're showing you the review experience so you understand what happens to your work. Jurors are randomly selected and can't see each other's votes until all 3 have voted.</ExplainBox>

      {/* The submission card */}
      <div style={{ background: "#fff", border: "1px solid #E8E3D9", padding: 16, marginBottom: 16, borderLeft: "4px solid #E0A040", borderRadius: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)" }}>@you · The General Public · just now</span>
          <span style={{ fontSize: 9, padding: "2px 7px", background: "#FFF3E0", color: "#E65100", borderRadius: 2, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Under Review</span>
        </div>
        <a href="#" style={{ fontSize: 10, color: "#2C5F7C" }}>{OB_ARTICLE.url}</a>
        <div style={{ margin: "8px 0", padding: 10, background: "#FDFAF5", borderRadius: 2 }}>
          <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680", fontSize: 14 }}>{OB_ARTICLE.originalHeadline}</div>
          <div style={{ fontFamily: "var(--serif)", color: "#C41E3A", fontWeight: 700, fontSize: 16, marginTop: 2 }}>{OB_ARTICLE.correctedHeadline}</div>
        </div>
        <div style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5, marginBottom: 8 }}>The article presents "evil is good" as expert consensus. No experts are named, no studies cited, and the article admits to excluding contradictory evidence.</div>

        <ExplainBox title="Line-by-Line Voting" icon="📋" color="#2D6A4F">Each in-line edit gets its own verdict. You can approve the headline correction while rejecting a weak edit — good work doesn't get killed by one flawed claim. Up to 20 edits per article.</ExplainBox>

        <div style={{ padding: 10, background: "#F5F0E8", borderRadius: 2, marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 8 }}>3 In-Line Edits — vote on each</div>
          {OB_ARTICLE.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < 2 ? "1px solid #E8E3D9" : "none" }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "#8B8680" }}>{e.original}</span>
              </div>
              <div style={{ fontSize: 12, color: "#C41E3A", fontWeight: 600, marginBottom: 2 }}>{e.replacement}</div>
              <div style={{ fontSize: 11, color: "#6B6560", fontStyle: "italic", marginBottom: 6 }}>↳ {e.reasoning}</div>
              {!voted && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === true ? "#2D6A4F" : "#D4C9B8", background: editVotes[i] === true ? "#E8F5E9" : "#fff", color: editVotes[i] === true ? "#2D6A4F" : "#8B8680", borderRadius: 2, cursor: "pointer" }}>✓ Approve Edit</button>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === false ? "#C41E3A" : "#D4C9B8", background: editVotes[i] === false ? "#FDF2F2" : "#fff", color: editVotes[i] === false ? "#C41E3A" : "#8B8680", borderRadius: 2, cursor: "pointer" }}>✗ Reject Edit</button>
                </div>
              )}
              {voted && <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: editVotes[i] ? "#2D6A4F" : "#C41E3A", fontWeight: 700 }}>{editVotes[i] ? "✓ YOU APPROVED" : "✗ YOU REJECTED"}</span>}
            </div>
          ))}
        </div>
      </div>

      {!voted ? (
        <div style={{ background: "#FDFBF7", border: "1px solid #E8E3D9", padding: 16, borderRadius: 2 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6560", marginBottom: 10 }}>Headline Correction Verdict</div>

          <ExplainBox title="Rating: Newsworthiness" icon="📰">How important is this correction? A misleading claim about a health policy scores higher than a typo in a lifestyle blog. Scale of 1–10.</ExplainBox>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 4 }}>Newsworthiness: <strong style={{ fontSize: 14, color: "#1A1A1A" }}>{newsRating}</strong>/10</div>
            <input type="range" min="1" max="10" value={newsRating} onChange={e => setNewsRating(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#1A1A1A" }} />
          </div>

          <ExplainBox title="Rating: Interesting" icon="⭐">How compelling is this correction to read? Well-argued, well-sourced corrections that teach the reader something score higher. Scale of 1–10.</ExplainBox>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 4 }}>Interesting: <strong style={{ fontSize: 14, color: "#1A1A1A" }}>{funRating}</strong>/10</div>
            <input type="range" min="1" max="10" value={funRating} onChange={e => setFunRating(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#1A1A1A" }} />
          </div>

          <ExplainBox title="Review Note" icon="💬">Your note is permanent and public. Use it to explain your reasoning. This contributes to the audit trail that makes every decision transparent.</ExplainBox>
          <textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} placeholder="The correction accurately identifies fabricated claims..." style={{ width: "100%", padding: "9px 11px", border: "1.5px solid #D4C9B8", background: "#fff", fontSize: 13, borderRadius: 1, boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", resize: "vertical" }} />

          <ExplainBox title="Deliberate Deception Finding" icon="⚠️" color="#C41E3A">This is the nuclear option. Only check this if you believe the submitter is <strong>intentionally lying</strong> — not just wrong, but deliberately deceptive. A majority of jurors checking this triggers a 9× scoring penalty (vs 3× for simply being wrong). This is a secret ballot — the submitter never sees which jurors checked it.</ExplainBox>
          <div style={{ margin: "12px 0", padding: 12, background: "#FDF2F2", border: "1.5px solid #C41E3A", borderRadius: 2 }}>
            <label style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
              <input type="checkbox" checked={lieChecked} onChange={e => setLieChecked(e.target.checked)} style={{ accentColor: "#C41E3A", marginTop: 3 }} />
              <div style={{ fontSize: 11, lineHeight: 1.5, color: "#4A4540" }}>I certify this submission is a <strong>deliberate lie, gross misrepresentation, or intentional omission.</strong></div>
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setVoted(true)} style={{ background: "#2D6A4F", color: "#F5F0E8", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 1 }}>✓ Approve Headline</button>
            <button onClick={() => setVoted(true)} style={{ background: "#C41E3A", color: "#F5F0E8", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 1 }}>✗ Reject Headline</button>
            <button style={{ background: "none", border: "none", padding: "10px", fontFamily: "var(--mono)", fontSize: 10, color: "#E65100", cursor: "pointer" }}>⚖ Recuse</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, background: "#F0FAF4", border: "1px solid #2D6A4F", borderRadius: 2, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "#2D6A4F", marginBottom: 8 }}>Votes Cast</div>
          <p style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.5, maxWidth: 480, margin: "0 auto" }}>You voted on the headline correction and each in-line edit independently. In the real system, 2 more jurors would do the same. The headline needs a 2-of-3 majority. Each edit is resolved separately — a strong headline correction can survive even if one weak edit gets rejected.</p>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Compare ──
function OBCompareStep() {
  const [highlight, setHighlight] = useState(true);
  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Step 3: The Result</h2>
      <p style={{ fontSize: 15, color: "#4A4540", lineHeight: 1.6, marginBottom: 20 }}>Here's what happens when corrections survive jury review. The original article alongside the corrected version — truth layered on top of misinformation.</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontFamily: "var(--mono)" }}>
          <input type="checkbox" checked={highlight} onChange={e => setHighlight(e.target.checked)} style={{ accentColor: "#C41E3A" }} />
          Highlight corrections
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Original */}
        <div style={{ border: "1px solid #E8E3D9", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "#E8E3D9", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B6560" }}>Original Article</div>
          <div style={{ padding: 16 }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.3 }}>{OB_ARTICLE.originalHeadline}</h3>
            <div style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)", marginBottom: 12 }}>the-daily-falsehood.com · Opinion</div>
            {OB_ARTICLE.originalBody.map((p, i) => (
              <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4540", marginBottom: 10 }}>{p}</p>
            ))}
          </div>
        </div>

        {/* Corrected */}
        <div style={{ border: `1.5px solid ${highlight ? "#C41E3A" : "#E8E3D9"}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: highlight ? "#C41E3A" : "#2D6A4F", color: "#F5F0E8", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}>Corrected Version</div>
          <div style={{ padding: 16 }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, margin: "0 0 4px", lineHeight: 1.3 }}>
              {highlight ? (
                <><span style={{ textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680" }}>{OB_ARTICLE.originalHeadline}</span><br /><span style={{ color: "#C41E3A" }}>{OB_ARTICLE.correctedHeadline}</span></>
              ) : OB_ARTICLE.correctedHeadline}
            </h3>
            <div style={{ fontSize: 10, color: "#8B8680", fontFamily: "var(--mono)", marginBottom: 4 }}>the-daily-falsehood.com · Opinion</div>
            <div style={{ fontSize: 9, padding: "3px 8px", background: "#F3E5F5", color: "#7B1FA2", borderRadius: 2, display: "inline-block", fontFamily: "var(--mono)", fontWeight: 700, marginBottom: 12 }}>⚖ 3 CORRECTIONS · CONSENSUS VERIFIED</div>

            {OB_ARTICLE.originalBody.map((p, i) => {
              const edit = OB_ARTICLE.inlineEdits.find(e => e.paragraph === i);
              if (!edit) return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4540", marginBottom: 10 }}>{p}</p>;

              // Find and split around the corrected text
              const idx = p.indexOf(edit.original);
              const before = p.substring(0, idx);
              const after = p.substring(idx + edit.original.length);

              return (
                <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4540", marginBottom: 10 }}>
                  {before}
                  {highlight ? (
                    <span style={{ background: "#FDF2F2", padding: "1px 3px", borderRadius: 2 }}>
                      <span style={{ textDecoration: "line-through", textDecorationColor: "#C41E3A", color: "#8B8680" }}>{edit.original}</span>
                      {" "}
                      <span style={{ color: "#C41E3A", fontWeight: 600, fontSize: 12 }}>{edit.replacement}</span>
                    </span>
                  ) : (
                    <span style={{ color: "#C41E3A", fontWeight: 500 }}>{edit.replacement}</span>
                  )}
                  {after}
                </p>
              );
            })}

            {/* Vault entries at bottom */}
            <div style={{ marginTop: 16, borderTop: "1px solid #E8E3D9", paddingTop: 12 }}>
              <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#6B6560", marginBottom: 8 }}>Linked Vault Entries</div>
              <div style={{ padding: 8, background: "#F0EBE0", borderRadius: 2, marginBottom: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>🏛 Standing Correction:</span> {OB_ARTICLE.vaultEntry.assertion}
              </div>
              <div style={{ padding: 8, background: "#EDF2F7", borderRadius: 2, marginBottom: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>⚔️ Argument:</span> {OB_ARTICLE.argEntry.content.substring(0, 120)}...
              </div>
              <div style={{ padding: 8, background: "#F3E8F9", borderRadius: 2, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>🧭 Belief:</span> {OB_ARTICLE.beliefEntry.content.substring(0, 100)}...
              </div>
            </div>
          </div>
        </div>
      </div>

      <ExplainBox title="This is the goal" icon="🎯" color="#7B1FA2">
        Every correction that survives both in-group review AND cross-group verification achieves <strong>Consensus</strong> — the highest trust signal in the system. Browser extensions, news aggregators, and social platforms can display these corrections alongside the original articles. Truth, layered on top of misinformation, verified by adversarial review.
      </ExplainBox>
    </div>
  );
}

// ── Step 4: Launch ──
function OBLaunchStep({ onComplete }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>⚜</div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>You're Ready</h2>
      <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.12em", color: "#8B8680", fontStyle: "italic", marginBottom: 24 }}>Truth Will Out.</p>

      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
        <div style={{ padding: 16, background: "#fff", border: "1px solid #E8E3D9", borderRadius: 2, marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 10px" }}>What You've Learned</h3>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#4A4540" }}>
            <p style={{ marginBottom: 8 }}><strong>Submit corrections</strong> — identify misleading headlines, propose factual replacements, attach evidence, make in-line edits, and build your Assembly's Vault.</p>
            <p style={{ marginBottom: 8 }}><strong>Jury review</strong> — 3 randomly selected jurors rate your work on accuracy, newsworthiness, and interestingness. A Deliberate Deception Finding carries a 9× penalty.</p>
            <p style={{ marginBottom: 8 }}><strong>The result</strong> — approved corrections advance to cross-group review. What survives both achieves Consensus — truth verified by strangers who have no reason to agree with you except that you're right.</p>
            <p style={{ marginBottom: 0 }}><strong>Your reputation</strong> — every submission builds or damages your Assembly Index. Honesty compounds. Lies crater your score. The only way to win is to tell the truth.</p>
          </div>
        </div>

        <div style={{ padding: 16, background: "#F5F0E8", border: "1px solid #E8E3D9", borderRadius: 2, marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 8px" }}>Your Next Steps</h3>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#4A4540" }}>
            <p style={{ marginBottom: 6 }}>1. You're already a member of <strong>The General Public</strong> — everyone is.</p>
            <p style={{ marginBottom: 6 }}>2. Browse specialized Assemblies and join up to 12 that match your interests and values.</p>
            <p style={{ marginBottom: 6 }}>3. Set your active Assembly and submit your first correction.</p>
            <p style={{ marginBottom: 0 }}>4. Serve on your first jury when called — you'll be eligible across all your Assemblies.</p>
          </div>
        </div>
      </div>

      <button onClick={onComplete} style={{ background: "#1A1A1A", color: "#F5F0E8", border: "none", padding: "14px 36px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 1, marginTop: 8 }}>Enter The Trust Assembly →</button>
    </div>
  );
}

function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState(0);
  const topRef = useRef(null);
  const next = () => { if (step < OB_STEPS.length - 1) { setStep(s => s + 1); topRef.current?.scrollIntoView({ behavior: "smooth" }); } };
  const prev = () => { if (step > 0) { setStep(s => s - 1); topRef.current?.scrollIntoView({ behavior: "smooth" }); } };

  return (
    <div style={{ minHeight: "100vh", background: "#FDFBF7" }}>
      <div ref={topRef} style={{ background: "#1A1A1A", color: "#F5F0E8", padding: "14px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>The Trust Assembly</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "#8B8680", marginTop: 2 }}>New Citizen Orientation</div>
      </div>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px 20px 0" }}>
        <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
          {OB_STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 3, background: i <= step ? "#1A1A1A" : "#E8E3D9", marginBottom: 6, borderRadius: 2, transition: "background 0.3s" }} />
              <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: i <= step ? "#1A1A1A" : "#B0A89C", fontWeight: i === step ? 700 : 400 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 20px 40px", fontFamily: "var(--body, Georgia, serif)", color: "#1A1A1A", fontSize: 15, lineHeight: 1.6 }}>
        {step === 0 && <OBSubmitStep />}
        {step === 1 && <OBReviewStep />}
        {step === 2 && <OBCompareStep />}
        {step === 3 && <OBLaunchStep onComplete={onComplete} />}
        {step < 3 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30, paddingTop: 20, borderTop: "1px solid #E8E3D9" }}>
            {step > 0 ? <button onClick={prev} style={{ background: "none", border: "1.5px solid #D4C9B8", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", borderRadius: 1, textTransform: "uppercase" }}>← Back</button> : <div />}
            <button onClick={next} style={{ background: "#1A1A1A", color: "#F5F0E8", border: "none", padding: "10px 24px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 1, letterSpacing: "0.04em" }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

async function loadSyntheticData() {
  // v5 clean launch: wipe any synthetic data from previous versions
  const cleaned = await sG("ta-cleaned-v5");
  if (!cleaned) {
    await sS(SK.USERS, {});
    await sS(SK.ORGS, {});
    await sS(SK.SUBS, {});
    await sS(SK.VAULT, {});
    await sS(SK.ARGS, {});
    await sS(SK.BELIEFS, {});
    await sS(SK.DISPUTES, {});
    await sS(SK.APPS, {});
    await sS(SK.AUDIT, []);
    await sS(SK.GP, null);
    await sS(SK.SESSION, null);
    await sS(SK.SYNTH, null);
    await sS("ta-cleaned-v5", true);
  }
  // Ensure The General Public exists
  await ensureGeneralPublic();
}

// ============================================================
// MAIN APP
// ============================================================

const NAV = [
  { key: "feed", label: "Record" }, { key: "orgs", label: "Assemblies" }, { key: "submit", label: "Submit" },
  { key: "review", label: "Review" }, { key: "vault", label: "Vaults" }, { key: "consensus", label: "Consensus" },
  { key: "profile", label: "Citizen" }, { key: "audit", label: "Ledger" },
  { key: "rules", label: "Rules" }, { key: "about", label: "About" },
];

export default function TrustAssembly() {
  const [user, setUser] = useState(null); const [screen, setScreen] = useState("login"); const [loading, setLoading] = useState(true);
  const [reviewCount, setReviewCount] = useState(0); const [crossCount, setCrossCount] = useState(0); const [disputeCount, setDisputeCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      await loadSyntheticData();
      const session = await sG(SK.SESSION);
      if (session?.username && session?.token) { const users = (await sG(SK.USERS)) || {}; const u = users[session.username]; if (u && u.sessionToken === session.token) { setUser(u); setScreen("feed"); } else { await sS(SK.SESSION, null); } }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    const check = async () => { const s = (await sG(SK.SUBS)) || {}; const v = Object.values(s); setReviewCount(v.filter(s => s.status === "pending_review" && s.jurors.includes(user.username) && !s.votes[user.username]).length); setCrossCount(v.filter(s => s.status === "cross_review" && s.crossGroupJurors.includes(user.username) && !s.crossGroupVotes[user.username]).length); const d = (await sG(SK.DISPUTES)) || {}; setDisputeCount(Object.values(d).filter(x => x.status === "pending_review" && x.jurors.includes(user.username) && !x.votes[user.username]).length); };
    check(); const i = setInterval(check, 5000); return () => clearInterval(i);
  }, [user, screen]);

  const refreshUser = async () => { if (!user) return; const all = (await sG(SK.USERS)) || {}; if (all[user.username]) setUser(all[user.username]); };
  useEffect(() => { if (user) refreshUser(); }, [screen]);

  const logout = async () => {
    if (user) { const users = (await sG(SK.USERS)) || {}; if (users[user.username]) { users[user.username].sessionToken = null; await sS(SK.USERS, users); } }
    await sS(SK.SESSION, null); setUser(null); setScreen("login");
  };

  if (loading) return <div className="ta-root"><Loader /></div>;

  if (showOnboarding && user) {
    return <OnboardingFlow onComplete={() => { setShowOnboarding(false); setScreen("feed"); }} />;
  }

  return (
    <div className="ta-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400&display=swap');
        :root { --serif: 'Playfair Display', 'Noto Serif', 'Source Serif 4', Georgia, serif; --mono: 'IBM Plex Mono', monospace; --body: 'Noto Serif', 'Source Serif 4', Georgia, serif; }
        .ta-root { min-height:100vh; background:#FDFBF7; font-family:var(--body); color:#1A1A1A; font-size:15px; line-height:1.6; }
        .ta-header { background:#1A1A1A; color:#F5F0E8; border-bottom:3px solid #1A1A1A; }
        .ta-header-inner { max-width:780px; margin:0 auto; padding:14px 20px 0; }
        .ta-masthead { text-align:center; padding-bottom:10px; border-bottom:1px solid #333; }
        .ta-masthead h1 { font-family:var(--serif); font-size:28px; font-weight:700; margin:0; letter-spacing:.12em; text-transform:uppercase; }
        .ta-masthead-sub { font-family:var(--mono); font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#8B8680; margin-top:2px; }
        .ta-nav { display:flex; justify-content:center; overflow-x:auto; }
        .ta-nav button { background:none; border:none; color:#8B8680; font-family:var(--mono); font-size:9px; letter-spacing:.08em; text-transform:uppercase; padding:9px 10px; cursor:pointer; border-bottom:2px solid transparent; position:relative; white-space:nowrap; }
        .ta-nav button:hover { color:#F5F0E8; }
        .ta-nav button.active { color:#F5F0E8; border-bottom-color:#F5F0E8; }
        .ta-nav-badge { position:absolute; top:3px; right:1px; background:#C41E3A; color:#fff; font-size:8px; width:13px; height:13px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; }
        .ta-user-bar { display:flex; justify-content:space-between; align-items:center; padding:5px 20px; max-width:780px; margin:0 auto; font-size:10px; color:#8B8680; border-top:1px solid #333; }
        .ta-content { max-width:780px; margin:0 auto; padding:20px; }
        .ta-section-rule { height:1px; background:linear-gradient(to right,transparent,#D4C9B8,transparent); margin:0 0 16px; }
        .ta-section-head { font-family:var(--serif); font-size:26px; font-weight:700; margin:0 0 14px; }
        .ta-card { background:#fff; border:1px solid #E8E3D9; padding:16px; margin-bottom:14px; border-radius:1px; }
        .ta-field { margin-bottom:14px; }
        .ta-field label { display:block; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:#6B6560; margin-bottom:5px; font-family:var(--mono); }
        .ta-field input,.ta-field textarea,.ta-field select { width:100%; padding:9px 11px; border:1.5px solid #D4C9B8; background:#FDFBF7; font-family:var(--body); font-size:14px; color:#1A1A1A; border-radius:1px; outline:none; box-sizing:border-box; }
        .ta-field input:focus,.ta-field textarea:focus { border-color:#1A1A1A; }
        .ta-field textarea { resize:vertical; }
        .ta-btn-primary { background:#1A1A1A; color:#F5F0E8; border:none; padding:10px 20px; font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; cursor:pointer; border-radius:1px; }
        .ta-btn-primary:hover { background:#333; }
        .ta-btn-primary:disabled { background:#8B8680; cursor:not-allowed; }
        .ta-btn-secondary { background:#F5F0E8; color:#1A1A1A; border:1.5px solid #D4C9B8; padding:7px 14px; font-family:var(--mono); font-size:10px; font-weight:600; cursor:pointer; border-radius:1px; }
        .ta-btn-secondary:hover { background:#E8E3D9; }
        .ta-btn-ghost { background:none; border:none; padding:6px 12px; font-family:var(--mono); font-size:10px; color:#8B8680; cursor:pointer; }
        .ta-btn-ghost:hover { color:#1A1A1A; }
        .ta-link-btn { background:none; border:none; color:#1A1A1A; font-size:13px; cursor:pointer; text-decoration:underline; padding:0; font-family:var(--body); }
        .ta-error { background:#FDF2F2; border:1px solid #C41E3A; color:#C41E3A; padding:8px 12px; margin-bottom:14px; font-size:12px; }
        .ta-success { background:#F0FAF4; border:1px solid #2D6A4F; color:#2D6A4F; padding:8px 12px; margin-bottom:14px; font-size:12px; }
        .ta-label { font-size:11px; text-transform:uppercase; letter-spacing:.1em; color:#8B8680; font-family:var(--mono); }
        @media(max-width:640px) { .ta-masthead h1{font-size:20px} .ta-content{padding:14px} .ta-nav button{padding:7px 7px;font-size:8px} .ta-section-head{font-size:22px} }
      `}</style>

      {!user ? (
        <div>
          <div style={{ textAlign: "center", padding: "40px 20px 0", maxWidth: 580, margin: "0 auto" }}>
            <div style={{ width: 40, height: 2, background: "#1A1A1A", margin: "0 auto 20px" }} />
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 700, margin: "0 0 4px", letterSpacing: ".08em", textTransform: "uppercase" }}>The Trust Assembly</h1>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".12em", color: "#8B8680", marginBottom: 6, fontStyle: "italic" }}>Truth Will Out.</div>
            <div style={{ fontFamily: "var(--body)", fontSize: 13, color: "#6B6560", marginBottom: 24 }}>Take No One at Their Word</div>
            <CitizenCounter />
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#4A4540", marginBottom: 28 }}>Submit headline corrections. Face random jury review. Build reputation through honesty. Everything is transparent. Nothing is hidden.</p>
            {screen === "login" ? <LoginScreen onLogin={u => { setUser(u); setScreen("feed"); }} onGoRegister={() => setScreen("register")} /> : <div><RegisterScreen onRegister={u => { setUser(u); setShowOnboarding(true); }} /><div style={{ marginTop: 16, textAlign: "center" }}><button className="ta-link-btn" onClick={() => setScreen("login")}>Already a citizen? Sign in</button></div></div>}
          </div>
          <div style={{ maxWidth: 580, margin: "0 auto", padding: "0 20px 40px" }}><DiscoveryFeed onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} /></div>
        </div>
      ) : (
        <div>
          <div className="ta-header">
            <div className="ta-header-inner">
              <div className="ta-masthead"><h1>The Trust Assembly</h1><div className="ta-masthead-sub">Truth Will Out. <span style={{ background: "#E65100", color: "#fff", padding: "1px 6px", borderRadius: 2, fontSize: 9, fontWeight: 700, marginLeft: 6, letterSpacing: "0.1em" }}>BETA</span></div></div>
              <nav className="ta-nav">{NAV.map(n => <button key={n.key} className={screen === n.key ? "active" : ""} onClick={() => setScreen(n.key)}>{n.label}{n.key === "review" && (reviewCount + crossCount + disputeCount) > 0 && <span className="ta-nav-badge">{reviewCount + crossCount + disputeCount}</span>}</button>)}</nav>
            </div>
            <div className="ta-user-bar"><span>@{user.displayName || user.username} · <Badge profile={computeProfile(user).profile} score={computeProfile(user).assemblyIndex} /></span><button className="ta-btn-ghost" style={{ color: "#8B8680" }} onClick={logout}>Sign Out</button></div>
          </div>
          <div className="ta-content">
            <CitizenCounter />
            {screen === "feed" && <FeedScreen user={user} />}
            {screen === "orgs" && <OrgScreen user={user} onUpdate={setUser} />}
            {screen === "submit" && <SubmitScreen user={user} onUpdate={setUser} />}
            {screen === "review" && <ReviewScreen user={user} />}
            {screen === "vault" && <VaultScreen user={user} />}
            {screen === "consensus" && <ConsensusScreen />}
            {screen === "profile" && <ProfileScreen user={user} />}
            {screen === "audit" && <AuditScreen />}
            {screen === "rules" && <RulesScreen />}
            {screen === "about" && <AboutScreen />}
          </div>
        </div>
      )}
    </div>
  );
}
