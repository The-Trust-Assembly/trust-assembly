import { DECEPTION_PENALTY_DAYS, TRUSTED_STREAK } from "./constants";

export function checkEnrollment(org) {
  const c = org.members.length;
  if (c <= 50) return { mode: "tribal", sponsors: 0, label: "Founder Approval" };
  if (c < 100) return { mode: "open", sponsors: 0, label: "Open" };
  if (c < 1000) return { mode: "sponsor", sponsors: 1, label: "1 Sponsor" };
  if (c < 10000) return { mode: "sponsor", sponsors: 2, label: "2 Sponsors" };
  return { mode: "sponsor", sponsors: 3, label: "3 Sponsors" };
}

export function hasActiveDeceptionPenalty(userObj) {
  if (!userObj.lastDeceptionFinding) return false;
  const elapsed = Date.now() - new Date(userObj.lastDeceptionFinding).getTime();
  return elapsed < DECEPTION_PENALTY_DAYS * 86400000;
}

export function deceptionPenaltyRemaining(userObj) {
  if (!userObj.lastDeceptionFinding) return null;
  const elapsed = Date.now() - new Date(userObj.lastDeceptionFinding).getTime();
  const remaining = (DECEPTION_PENALTY_DAYS * 86400000) - elapsed;
  if (remaining <= 0) return null;
  const days = Math.ceil(remaining / 86400000);
  return days;
}

export function canCreateAssembly(userObj) {
  if (isDIUser(userObj)) return { allowed: false, reason: "🤖 AI Agents cannot found Assemblies." };
  if (hasActiveDeceptionPenalty(userObj)) {
    const days = deceptionPenaltyRemaining(userObj);
    return { allowed: false, reason: `⚠ Deliberate Deception penalty active. Assembly creation suspended for ${days} more day${days !== 1 ? "s" : ""}.` };
  }
  return { allowed: true, reason: null };
}

export function canVote(userObj) {
  if (isDIUser(userObj)) {
    return { allowed: false, reason: "🤖 AI Agents cannot serve on juries or vote at this time." };
  }
  if (hasActiveDeceptionPenalty(userObj)) {
    const days = deceptionPenaltyRemaining(userObj);
    return { allowed: false, reason: `⚠ Deliberate Deception penalty active. All voting suspended for ${days} more day${days !== 1 ? "s" : ""}.` };
  }
  return { allowed: true, reason: null };
}

export function isTrustedContributor(userObj, orgId) {
  if (hasActiveDeceptionPenalty(userObj)) return false;
  const streaks = userObj.assemblyStreaks || {};
  return (streaks[orgId] || 0) >= TRUSTED_STREAK;
}

export function getTrustedProgress(userObj, orgId) {
  const streaks = userObj.assemblyStreaks || {};
  return { current: streaks[orgId] || 0, needed: TRUSTED_STREAK, isTrusted: (streaks[orgId] || 0) >= TRUSTED_STREAK };
}

export function isDIUser(userObj) { return !!userObj.isDI; }

export function getDISubmissionLimit(org) {
  return Math.min(100, Math.floor(org.members.length / 2));
}

export function isDISuspended(diUser, allUsers) {
  if (!diUser.isDI) return { suspended: false };
  if (!diUser.diApproved) return { suspended: true, reason: "Awaiting partner approval." };
  const partner = allUsers[diUser.diPartner];
  if (!partner) return { suspended: true, reason: "Accountable human partner not found." };
  if (hasActiveDeceptionPenalty(partner)) {
    const days = deceptionPenaltyRemaining(partner);
    return { suspended: true, reason: `Accountable partner @${diUser.diPartner} has an active Deception penalty (${days} days remaining). All linked AI Agents are suspended.` };
  }
  return { suspended: false };
}
