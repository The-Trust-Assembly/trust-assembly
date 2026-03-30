import { CITIZEN_BADGES, BADGE_TIER_ORDER, TRUSTED_STREAK, SK } from "./constants";
import { sG } from "./storage";

// Scoring weights (mirrored from trust-assembly-v5.jsx)
export const W = {
  win: 1.0,              // points per approved correction
  disputeWin: 2.0,       // points per successful dispute
  streakInterval: 3,     // consecutive wins per bonus point
  qualityDivisor: 10,    // quality normalization: (news+fun)/X
  qualityCap: 1.6,       // soft cap on quality multiplier (prevents inflation beyond ~8+8)
  qualityExp: 1.5,       // exponent on quality (amplifies gap between trivial and important)
  lossDrag: 2.0,         // loss severity coefficient (inside sqrt)
  lieDrag: 3.0,          // lie severity per lie (linear, no mercy)
  failedDisputeDrag: 2.0,// failed dispute severity (inside sqrt)
  vindicationBase: 10.0, // base value of Cassandra vindication
  persistenceExp: 1.5,   // exponent on rejection count for vindication
};

export function computeAssemblyReputation(org, allSubs) {
  const results = org.crossGroupResults || [];
  if (results.length === 0) return { trustScore: null, confidence: false, survivals: 0, total: 0, deceptionFindings: org.crossGroupDeceptionFindings || 0, concessions: (org.concessions || []).length, cassandraIndex: 0 };

  let weightedSurvivals = 0, weightedTotal = 0;
  for (const r of results) {
    // Weight = internal jury size + cross-group jury size (both contribute to signal strength)
    const weight = (r.internalJurySize || 3) + (r.jurySize || 3);
    weightedTotal += weight;
    if (r.outcome === "consensus") weightedSurvivals += weight;
  }

  const trustScore = weightedTotal > 0 ? Math.round((weightedSurvivals / weightedTotal) * 100) : 0;
  const confidence = results.length >= 20;
  const deceptionFindings = org.crossGroupDeceptionFindings || 0;

  // Cassandra Index: successful disputes by this Assembly's members against other Assemblies
  const cassandraIndex = org.cassandraWins || 0;

  return { trustScore, confidence, survivals: results.filter(r => r.outcome === "consensus").length, total: results.length, deceptionFindings, concessions: (org.concessions || []).length, cassandraIndex };
}

export function getMajority(jurySize) {
  return Math.floor(jurySize / 2) + 1;
}

export function computeProfile(user, extraData) {
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

  const disputeWins = user.disputeWins || 0;
  const disputeLosses = user.disputeLosses || 0;
  const lies = user.deliberateLies || 0;

  // -- SCORING FORMULA --
  // Trust Score = 100 (base) + sqrt(Points) * Quality / Drag + Cassandra Bonus + Badge Bonus
  //
  // Base 100   - everyone starts with reputation; you can only lose it through bad behavior
  // sqrt(Points)  - diminishing returns on volume; showing up matters but can't farm
  // Quality    - capped and exponentiated; trivial work is penalized, important work amplified
  // Drag       - losses under sqrt (diminishing), lies linear (no mercy)
  // Cassandra  - additive bonus, scales with impact * persistence (coming soon)
  // Badges     - +1 per badge earned (achievement bonus)

  const streakBonus = Math.floor(streak / W.streakInterval);
  const rawPoints = wins * W.win + disputeWins * W.disputeWin + streakBonus;
  const points = Math.sqrt(rawPoints);

  const qualityRaw = (avgNews + avgFun) / W.qualityDivisor;
  const quality = Math.pow(Math.min(qualityRaw, W.qualityCap), W.qualityExp);

  const regLosses = Math.max(0, losses - lies);
  const lossDrag = Math.sqrt(regLosses * W.lossDrag + disputeLosses * W.failedDisputeDrag);
  const lieDrag = lies * W.lieDrag;
  const drag = 1 + lossDrag + lieDrag;

  const base = points * quality / drag;

  // Cassandra vindication bonus (additive - structure ready, vindication path not yet active)
  const vindications = user.vindications || [];
  const cassandraBonus = vindications.reduce((sum, v) => {
    const impact = (v.news / 10) * (v.fun / 10);
    const persistence = Math.pow(v.rejections, W.persistenceExp);
    return sum + W.vindicationBase * impact * persistence;
  }, 0);

  // Badge bonus: +1 per badge earned (requires orgs, subs, allUsers data)
  let badgeBonus = 0;
  let badgeCount = 0;
  if (extraData && extraData.allUsers && extraData.allOrgs && extraData.allSubs) {
    const badges = computeBadges(user, extraData.allUsers, extraData.allOrgs, extraData.allSubs);
    badgeCount = badges.length;
    // Custom badges may have point values > 1 (e.g. "First Tester" = 10 points)
    badgeBonus = badges.reduce((sum, b) => sum + (b.points || 1), 0);
  }

  const BASE_REPUTATION = 100;
  // Trust scores CAN go negative — escalating dispute losses subtract directly
  const rawScore = BASE_REPUTATION + base + cassandraBonus + badgeBonus;
  const trustScore = Math.round(rawScore * 10) / 10; // 1 decimal, no floor

  // Profile labels: based on score threshold + quality dimensions
  // (thresholds adjusted for base-100 system)
  let profile = "New Citizen";
  if (total >= 3) {
    const hiScore = (trustScore - BASE_REPUTATION) >= 1.5; // compare earned score against old threshold
    const hiNews = avgNews >= 5.5;
    const hiFun = avgFun >= 5.5;
    if (hiScore && hiNews && hiFun) profile = "Oracle";
    else if (hiScore && hiNews && !hiFun) profile = "Diligent Reporter";
    else if (hiScore && !hiNews && hiFun) profile = "Raconteur";
    else if (hiScore && !hiNews && !hiFun) profile = "Archivist";
    else if (!hiScore && hiNews && hiFun) profile = "Demagogue";
    else if (!hiScore && hiNews && !hiFun) profile = "Overreacher";
    else if (!hiScore && !hiNews && hiFun) profile = "Court Jester";
    else profile = "Apprentice";
  }

  return { trustScore, profile, rawAccuracy: total > 0 ? Math.round((wins / total) * 100) : 50, avgNews: avgNews.toFixed(1), avgFun: avgFun.toFixed(1), wins, losses, lies, total, streak, streakBonus, qualityRaw: qualityRaw.toFixed(2), quality: quality.toFixed(2), drag: drag.toFixed(1), cassandraBonus: cassandraBonus.toFixed(1), vindications: vindications.length, disputeWins, disputeLosses, required, highTrust, badgeBonus, badgeCount };
}

// -- Citizen Badges --
// Achievement badges displayed on citizen profiles. Computed from user data, orgs, and submissions.

export function computeBadges(userObj, allUsers, allOrgs, allSubs) {
  const badges = [];
  const username = userObj.username;

  // Assembly Creator - one badge PER assembly founded (+1 point each)
  const createdOrgs = Object.values(allOrgs).filter(o => o.createdBy === username && !o.isGeneralPublic);
  createdOrgs.forEach(o => {
    badges.push({ ...CITIZEN_BADGES.assemblyCreator, detail: o.name });
  });

  // Founder milestones - assembly reaches jury scaling thresholds
  const FOUNDER_THRESHOLDS = [
    [5,     "founderFive"],
    [51,    "founderFiftyOne"],
    [101,   "founderHundredOne"],
    [1000,  "founderThousand"],
  ];
  createdOrgs.forEach(o => {
    const mc = (o.members || []).length;
    FOUNDER_THRESHOLDS.forEach(([threshold, key]) => {
      if (mc >= threshold) badges.push({ ...CITIZEN_BADGES[key], detail: o.name });
    });
  });

  // Assembly Membership milestones — non-GP memberships for first badge, total for levels
  const memberOrgs = Object.values(allOrgs).filter(o => !o.isGeneralPublic && o.members && o.members.includes(username));
  const totalMemberships = memberOrgs.length + 1; // +1 for GP (everyone is in GP)
  if (memberOrgs.length >= 1)  badges.push({ ...CITIZEN_BADGES.joinOne });
  if (totalMemberships >= 6)   badges.push({ ...CITIZEN_BADGES.joinSix });
  if (totalMemberships >= 12)  badges.push({ ...CITIZEN_BADGES.joinTwelve });

  // Submission milestones
  const userSubCount = Object.values(allSubs).filter(s => s.submittedBy === username).length;
  if (userSubCount >= 1)       badges.push({ ...CITIZEN_BADGES.firstSubmission, count: userSubCount });
  if (userSubCount >= 10)      badges.push({ ...CITIZEN_BADGES.tenSubmissions, count: userSubCount });
  if (userSubCount >= 100)     badges.push({ ...CITIZEN_BADGES.centuryClub, count: userSubCount });
  if (userSubCount >= 1000)    badges.push({ ...CITIZEN_BADGES.thousand, count: userSubCount });
  if (userSubCount >= 10000)   badges.push({ ...CITIZEN_BADGES.tenThousand, count: userSubCount });
  if (userSubCount >= 100000)  badges.push({ ...CITIZEN_BADGES.hundredThousand, count: userSubCount });
  if (userSubCount >= 1000000) badges.push({ ...CITIZEN_BADGES.million, count: userSubCount });

  // Vote milestones — count votes cast as a juror
  const voteCount = Object.values(allSubs).reduce((count, s) => {
    if (s.votes && s.votes[username]) count++;
    if (s.crossGroupVotes && s.crossGroupVotes[username]) count++;
    return count;
  }, 0);
  if (voteCount >= 1)   badges.push({ ...CITIZEN_BADGES.firstVote, count: voteCount });
  if (voteCount >= 10)  badges.push({ ...CITIZEN_BADGES.tenVotes, count: voteCount });
  if (voteCount >= 25)  badges.push({ ...CITIZEN_BADGES.twentyFiveVotes, count: voteCount });
  if (voteCount >= 50)  badges.push({ ...CITIZEN_BADGES.fiftyVotes, count: voteCount });
  if (voteCount >= 100) badges.push({ ...CITIZEN_BADGES.hundredVotes, count: voteCount });

  // Dispute milestones — successful disputes won
  const disputeWins = userObj.disputeWins || 0;
  if (disputeWins >= 1)   badges.push({ ...CITIZEN_BADGES.firstDispute, count: disputeWins });
  if (disputeWins >= 5)   badges.push({ ...CITIZEN_BADGES.fiveDisputes, count: disputeWins });
  if (disputeWins >= 10)  badges.push({ ...CITIZEN_BADGES.tenDisputes, count: disputeWins });
  if (disputeWins >= 20)  badges.push({ ...CITIZEN_BADGES.twentyDisputes, count: disputeWins });
  if (disputeWins >= 50)  badges.push({ ...CITIZEN_BADGES.fiftyDisputes, count: disputeWins });
  if (disputeWins >= 100) badges.push({ ...CITIZEN_BADGES.hundredDisputes, count: disputeWins });

  // DI partnership milestones
  if (userObj.diPartner) badges.push({ ...CITIZEN_BADGES.diPartner });
  const diSubCount = Object.values(allSubs).filter(s => s.isDI && s.diPartner === username).length;
  if (diSubCount >= 10)     badges.push({ ...CITIZEN_BADGES.diTen, count: diSubCount });
  if (diSubCount >= 100)    badges.push({ ...CITIZEN_BADGES.diHundred, count: diSubCount });
  if (diSubCount >= 1000)   badges.push({ ...CITIZEN_BADGES.diThousand, count: diSubCount });
  if (diSubCount >= 10000)  badges.push({ ...CITIZEN_BADGES.diTenK, count: diSubCount });
  if (diSubCount >= 100000) badges.push({ ...CITIZEN_BADGES.diHundredK, count: diSubCount });

  // Trusted Contributor - per assembly
  const streaks = userObj.assemblyStreaks || {};
  const trustedOrgs = Object.entries(streaks)
    .filter(([orgId, s]) => s >= TRUSTED_STREAK && allOrgs[orgId])
    .map(([orgId]) => allOrgs[orgId]);
  trustedOrgs.forEach(o => {
    badges.push({ ...CITIZEN_BADGES.trustedContributor, detail: o.name, count: 1 });
  });

  // Early adopter - based on signup order
  const allUsersList = Object.values(allUsers).sort((a, b) => (a.signupTimestamp || new Date(a.signupDate).getTime()) - (b.signupTimestamp || new Date(b.signupDate).getTime()));
  const signupIndex = allUsersList.findIndex(u => u.username === username);
  if (signupIndex >= 0 && signupIndex < 100)  badges.push({ ...CITIZEN_BADGES.firstHundred, detail: `#${signupIndex + 1}` });
  if (signupIndex >= 0 && signupIndex < 1000) badges.push({ ...CITIZEN_BADGES.firstThousand, detail: `#${signupIndex + 1}` });

  // Manually awarded badges (stored on user object by admin)
  const manualBadges = userObj.manualBadges || [];
  manualBadges.forEach(mb => {
    const def = CITIZEN_BADGES[mb.id];
    if (def) badges.push({ ...def, detail: mb.detail || "", awardedAt: mb.awardedAt });
  });

  // Sort by tier
  badges.sort((a, b) => (BADGE_TIER_ORDER[a.tier] || 99) - (BADGE_TIER_ORDER[b.tier] || 99));

  return badges;
}

export function assemblyTrustScore(org, users) {
  const scores = org.members.map(m => users[m] ? computeProfile(users[m]).trustScore : 0).sort((a, b) => b - a);
  if (!scores.length) return 0;
  const topN = Math.max(1, Math.ceil(scores.length * 0.2));
  const botN = Math.max(1, Math.ceil(scores.length * 0.2));
  const topAvg = scores.slice(0, topN).reduce((a, b) => a + b, 0) / topN;
  const botAvg = scores.slice(-botN).reduce((a, b) => a + b, 0) / botN;
  return Math.round(topAvg * 0.7 + botAvg * 0.3);
}

export async function computeJuryScore(username) {
  const subs = (await sG(SK.SUBS)) || {};
  const disputes = (await sG(SK.DISPUTES)) || {};
  let totalReviews = 0, consensusVotes = 0, overturned = 0, overturnEligible = 0;
  let lieFlags = 0, lieFlagsCorrect = 0;

  Object.values(subs).forEach(sub => {
    // In-group votes
    if (sub.votes && sub.votes[username]) {
      totalReviews++;
      const myVote = sub.votes[username];
      // Consensus alignment: did I vote with the final outcome?
      if (sub.status === "approved" || sub.status === "consensus" || sub.status === "cross_review") {
        if (myVote.approve) consensusVotes++;
      } else if (sub.status === "rejected" || sub.status === "consensus_rejected") {
        if (!myVote.approve) consensusVotes++;
      }
      // Lie flag accuracy
      if (myVote.deliberateLie) {
        lieFlags++;
        if (sub.deliberateLieFinding) lieFlagsCorrect++;
      }
      // Overturn check: was this jury's decision overturned by dispute?
      if (sub.status === "upheld") { overturnEligible++; overturned++; }
      else if (["approved", "rejected", "consensus", "consensus_rejected", "cross_review", "dismissed"].includes(sub.status)) { overturnEligible++; }
    }
    // Cross-group votes
    if (sub.crossGroupVotes && sub.crossGroupVotes[username]) {
      totalReviews++;
      const myVote = sub.crossGroupVotes[username];
      if (sub.status === "consensus" && myVote.approve) consensusVotes++;
      else if (sub.status === "consensus_rejected" && !myVote.approve) consensusVotes++;
      if (myVote.deliberateLie) {
        lieFlags++;
        if (sub.deliberateLieFinding) lieFlagsCorrect++;
      }
    }
  });
  // Dispute votes
  Object.values(disputes).forEach(d => {
    if (d.votes && d.votes[username]) {
      totalReviews++;
      if (d.status === "upheld" && d.votes[username].upheld) consensusVotes++;
      else if (d.status === "dismissed" && !d.votes[username].upheld) consensusVotes++;
    }
  });

  const consensusRate = totalReviews > 0 ? Math.round((consensusVotes / totalReviews) * 100) : null;
  const overturnRate = overturnEligible > 0 ? Math.round((overturned / overturnEligible) * 100) : null;
  const accusationRate = lieFlags > 0 ? Math.round((lieFlagsCorrect / lieFlags) * 100) : null;

  return { totalReviews, consensusRate, overturnRate, accusationRate, lieFlags, lieFlagsCorrect, overturned, overturnEligible };
}
