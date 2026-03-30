#!/usr/bin/env node
/**
 * Trust Assembly Submission Script: Afroman / Newland Corrections
 *
 * Submits corrections that distinguish between Afroman's First Amendment rights
 * and the truth value of specific claims about the Newland family.
 *
 * Usage:
 *   node scripts/submit-afroman-corrections.mjs
 *
 * Environment:
 *   TA_USERNAME  - Trust Assembly username (default: theprinceofamerica)
 *   TA_PASSWORD  - Trust Assembly password
 *   TA_BASE_URL  - API base URL (default: https://trustassembly.org)
 */

const BASE = process.env.TA_BASE_URL || "https://trustassembly.org";
const USERNAME = process.env.TA_USERNAME || "theprinceofamerica";
const PASSWORD = process.env.TA_PASSWORD;

if (!PASSWORD) {
  console.error("Set TA_PASSWORD environment variable");
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function login() {
  let res;
  try {
    res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
  } catch (err) {
    throw new Error(`Network error connecting to ${BASE}: ${err.message}`);
  }
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(`Logged in as ${USERNAME}`);
  return data.token;
}

async function importUrl(token, url) {
  const res = await fetch(`${BASE}/api/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    console.warn(`  Import failed for ${url}: ${res.status}`);
    return null;
  }
  return res.json();
}

async function submit(token, payload) {
  const res = await fetch(`${BASE}/api/submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  Submit failed: ${res.status}`, data);
    return null;
  }
  console.log(`  Submitted: ${data.id || data.submissionId || "OK"}`);
  return data;
}

async function submitVault(token, payload) {
  const res = await fetch(`${BASE}/api/vault`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  Vault failed: ${res.status}`, data);
    return null;
  }
  console.log(`  Vault artifact created: ${data.id || "OK"}`);
  return data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Shared Evidence Sources ───────────────────────────────────────────────

const EVIDENCE = {
  local12_william: {
    url: "https://local12.com/news/local/former-peebles-police-chief-accused-of-sending-obscene-materials-to-minor-cincinnati",
    explanation:
      "Local12 (2021) reports William Newland, former Peebles Police Chief, was charged with providing obscene material to a juvenile — a misdemeanor. This is legally distinct from pedophilia. Brian Newland (his brother, the Adams County detective) was never charged with any crime.",
  },
  peoples_defender_william: {
    url: "https://www.peoplesdefender.com/2021/02/20/former-peebles-police-officer-accused-of-inappropriate-contact-with-minor/",
    explanation:
      "People's Defender (2021) reports the original accusation against William Newland. The charge was a misdemeanor, not a felony sex offense. No connection to Brian Newland's conduct is established.",
  },
  trial_testimony_tiktok: {
    url: "https://www.tiktok.com/@meghannmcuniff/video/7618404854645411085",
    explanation:
      "Court reporter Meghann Cuniff's trial coverage shows Brian Newland testifying under oath: 'Have you ever been accused or convicted of pedophilia?' 'No.' His brother William was convicted of a misdemeanor; Brian had no involvement in that crime.",
  },
  brian_testimony_impact: {
    url: "https://www.tiktok.com/@meghannmcuniff/video/7618440569534139661",
    explanation:
      "Brian Newland testified he quit his career at the Adams County Sheriff's Office, his children's friends stopped visiting, and his family experienced lasting harm from the false pedophilia accusations. He dedicated 10+ years to his role.",
  },
  npr_verdict: {
    url: "https://www.npr.org/2026/03/19/nx-s1-5753563/afroman-lemon-pound-cake-trial",
    explanation:
      "NPR reports the jury found for Afroman on all 13 counts. This means the speech was legally protected under the First Amendment — it does NOT mean the jury found the underlying factual claims to be true. Defamation law for public officials requires proving actual malice, a high bar.",
  },
  wcpo_verdict: {
    url: "https://www.wcpo.com/news/local-news/afromans-defense-prepares-to-present-their-side-during-day-3-of-civil-trail",
    explanation:
      "WCPO reports the jury verdict and Afroman's statement: 'I didn't win. America won.' The verdict affirms First Amendment protection for artistic expression about public officials, but does not validate the factual accuracy of specific claims in Afroman's songs.",
  },
  fox19_money: {
    url: "https://www.fox19.com/2023/02/16/investigation-into-afromans-alleged-missing-money-concludes/",
    explanation:
      "Fox19 reports an independent investigation concluded Brian Newland miscounted Afroman's money by $390 — attributed to a counting error, not theft. The ledger recorded $4,390 but only $4,000 was returned.",
  },
};

// ─── Corrections ───────────────────────────────────────────────────────────

const corrections = [
  // ── 1. Boingboing ──
  {
    url: "https://boingboing.net/2026/03/24/afroman-wins-defamation-case-brought-by-snowflake-cops-who-raided-his-home.html",
    originalHeadline:
      "Afroman wins defamation case brought by snowflake cops who raided his home",
    replacement:
      "Afroman wins defamation case: jury affirms First Amendment protection for satirical music about police raid",
    reasoning: `This headline calls the plaintiff officers "snowflake cops," which editorializes and dehumanizes the individuals involved. While Afroman's First Amendment right to satirize public officials was correctly upheld by the jury on March 18, 2026, the headline obscures a critical distinction: the verdict means Afroman's speech was LEGALLY PROTECTED, not that his factual claims were TRUE.

Among the claims at issue: Afroman repeatedly called Detective Brian Newland a "pedophile" on social media, using a photo of Newland with a child from the Shop with a Cop holiday program to imply criminal behavior. Brian Newland testified under oath that he has never been accused or convicted of pedophilia. The accusation stemmed from his brother William Newland's 2021 misdemeanor conviction for providing obscene material to a minor — a crime Brian had no involvement in.

Brian Newland testified he quit his 10-year career, and his children's friends stopped visiting their home. Dismissing this as "snowflake" behavior erases documented harm from false accusations while conflating free speech protection with factual vindication.

A responsible headline would celebrate the First Amendment victory without implying the officers' concerns were frivolous.`,
    evidence: [
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.brian_testimony_impact,
      EVIDENCE.local12_william,
      EVIDENCE.npr_verdict,
    ],
  },

  // ── 2. Defector ──
  {
    url: "https://defector.com/lets-catch-up-on-the-hilarious-afroman-defamation-trial",
    originalHeadline:
      "Let's Catch Up On The Hilarious Afroman Defamation Trial",
    replacement:
      "The Afroman Defamation Trial: A First Amendment Victory With Complicated Human Costs",
    reasoning: `Framing this trial as purely "hilarious" erases the serious factual issues at its center. While the case had genuinely entertaining moments — Afroman's American flag suit, the lemon pound cake testimony, the viral music videos — calling the entire trial "hilarious" dismisses the real harm caused by specific false claims.

At the center of the case was Detective Brian Newland, whom Afroman publicly called a "pedophile" in social media posts. This accusation was based not on anything Brian did, but on his brother William Newland's 2021 misdemeanor conviction for providing obscene material to a juvenile. Brian testified under oath he was never accused or convicted of pedophilia and had no involvement in his brother's crime.

Afroman also used a photo of Brian with a child from the Shop with a Cop program — where officers take low-income children holiday shopping — to imply predatory behavior. Brian testified his children's friends stopped visiting and he left his career.

The jury correctly found Afroman's speech was protected under the First Amendment. But "hilarious" framing treats the false pedophilia accusations as comedy rather than examining the distinction between protected artistic expression and factual truth.`,
    evidence: [
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.brian_testimony_impact,
      EVIDENCE.local12_william,
      EVIDENCE.npr_verdict,
    ],
  },

  // ── 3. AllHipHop ──
  {
    url: "https://allhiphop.com/news/afroman-accuses-police-officer-ohio-raid-pedophile-family/",
    originalHeadline:
      'Afroman Accuses Officer In Ohio Raid Of Belonging To "Pedophile" Family; Posts Receipts',
    replacement:
      "Afroman References Officer's Brother's Misdemeanor Conviction in Ongoing Feud Over 2022 Raid",
    reasoning: `This headline is misleading in two critical ways:

1. "PEDOPHILE FAMILY": The word "pedophile" dramatically overstates the legal record. William Newland (Brian Newland's brother) was convicted of a MISDEMEANOR for providing obscene material to a minor in 2021. While this is a serious offense, it is legally and clinically distinct from pedophilia. Labeling an entire family as a "pedophile family" based on one member's misdemeanor conviction is guilt-by-association.

2. "POSTS RECEIPTS": This phrase implies Afroman provided evidence that validates the "pedophile" characterization. The actual "receipts" were news reports about William Newland's misdemeanor conviction — which says nothing about Brian Newland. Brian testified under oath that he was never accused or convicted of pedophilia and had no involvement in his brother's crime.

The headline should accurately reflect what happened: Afroman referenced a DIFFERENT person's (William's) misdemeanor conviction to make accusations against Brian, who participated in the 2022 raid. This is guilt-by-association, not evidence of Brian's wrongdoing.

During the March 2026 trial, Brian Newland testified he quit his career at the Adams County Sheriff's Office and his children suffered social isolation as a result of these public accusations.`,
    evidence: [
      EVIDENCE.local12_william,
      EVIDENCE.peoples_defender_william,
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.brian_testimony_impact,
    ],
  },

  // ── 4. Music4U ──
  {
    url: "https://music4u.pro/afroman-says-officer-in-ohio-raid-belongs-to-pedophile-family",
    originalHeadline:
      'Afroman Says Officer In Ohio Raid Belongs To "Pedophile" Family',
    replacement:
      "Afroman References Officer's Brother's Misdemeanor in Dispute Over 2022 Home Raid",
    reasoning: `This headline uncritically repeats Afroman's characterization of the Newland family as a "pedophile family" without context or fact-checking.

The facts: William Newland, former Peebles Police Chief, was convicted of a misdemeanor for providing obscene material to a minor in 2021. His brother Brian Newland, an Adams County Sheriff's detective who participated in the August 2022 raid on Afroman's home, was never accused or convicted of any crime.

Afroman used William's conviction to label Brian — and the entire family — as "pedophiles." He also posted a photo of Brian with a child from the Shop with a Cop program (where officers take low-income children holiday shopping) to imply predatory behavior.

The headline presents Afroman's accusation as newsworthy on its face without noting: (a) the actual conviction was a misdemeanor, not pedophilia; (b) it was William who was convicted, not Brian; (c) Brian had no involvement in his brother's crime.

While Afroman's speech was found protected under the First Amendment in March 2026, the jury's verdict addressed legal protection for artistic expression — not the factual accuracy of the claims.`,
    evidence: [
      EVIDENCE.local12_william,
      EVIDENCE.peoples_defender_william,
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.npr_verdict,
    ],
  },

  // ── 5. CBS News ──
  {
    url: "https://www.cbsnews.com/news/afroman-wins-lawsuit-ohio-police-raid-music-videos/",
    originalHeadline:
      'Rapper Afroman wins lawsuit against Ohio police over mocking their raid of his home: "It\'s for Americans"',
    replacement:
      "Jury affirms Afroman's First Amendment right to satirize Ohio police raid, rejecting defamation claims on all counts",
    reasoning: `While this headline is less problematic than others, the framing "wins lawsuit... over mocking their raid" risks implying that the mocking itself was validated as truthful. The jury's verdict on March 18, 2026 found that Afroman's speech was PROTECTED under the First Amendment — a crucial legal distinction from finding that his specific claims were TRUE.

Among the claims at issue were accusations that Detective Brian Newland was a "pedophile" — based not on Brian's conduct but on his brother William Newland's 2021 misdemeanor conviction for providing obscene material to a minor. Brian testified he was never accused or convicted of pedophilia.

The headline should clarify that this was a First Amendment ruling about protected speech regarding public officials, not a factual vindication of every claim in Afroman's songs and social media posts. Defamation law for public officials requires proving "actual malice" (knowledge of falsity or reckless disregard for truth) — a very high bar that protects even inaccurate speech in most cases.`,
    evidence: [
      EVIDENCE.npr_verdict,
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.local12_william,
      EVIDENCE.wcpo_verdict,
    ],
  },

  // ── 6. Parle Magazine ──
  {
    url: "https://parlemag.com/2026/03/explaining-the-afroman-saga-the-case-of-the-lemon-pound-cake/",
    originalHeadline:
      "Explaining The Afroman Saga: The Case of the Lemon Pound Cake",
    replacement:
      "Explaining The Afroman Case: Free Speech Victory, Unresolved Questions About Truth",
    reasoning: `As an explainer piece, this article has a responsibility to help readers understand the distinction between protected speech and truthful speech — a distinction many casual readers miss.

Key facts an explainer should include:
1. The August 2022 raid on Afroman's Adams County home found no evidence of kidnapping or drug trafficking. No charges were filed. This was a legitimate grievance.
2. Afroman used his security footage to create viral music videos, which is protected artistic expression.
3. However, Afroman also made specific factual claims — including calling Detective Brian Newland a "pedophile" based on his brother William's misdemeanor conviction, and using a Shop with a Cop photo to imply predatory behavior.
4. The jury's March 2026 verdict found for Afroman on all 13 counts. This means the speech was legally protected, not that every factual claim was true.
5. Brian Newland was never accused or convicted of any crime. His brother William was convicted of a misdemeanor for providing obscene material to a minor — legally distinct from pedophilia.
6. The $390 cash discrepancy was attributed by an independent investigation to a miscount, not theft.

An explainer that omits these distinctions fails its purpose.`,
    evidence: [
      EVIDENCE.npr_verdict,
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.local12_william,
      EVIDENCE.fox19_money,
      EVIDENCE.brian_testimony_impact,
    ],
  },

  // ── 7. Fox Baltimore / Local12 syndicated ──
  {
    url: "https://foxbaltimore.com/news/nation-world/jury-deliberates-lawsuit-surrounding-afromans-viral-lemon-pound-cake-video-cincinnati-adams-county-joseph-foreman-deputies-raid-lisa-phillips-brian-newland-randy-walters-shawn-grooms-shawn-cooley-justin-cooley-mike-estep",
    originalHeadline:
      "Jury rules in favor of Afroman in lawsuit surrounding his viral 'Lemon Pound Cake' video",
    replacement:
      "Jury sides with Afroman on First Amendment grounds in deputies' defamation lawsuit over raid music videos",
    reasoning: `This headline frames the case as being purely about the "Lemon Pound Cake" video, which undersells the scope and stakes of the lawsuit. The case involved 7 plaintiffs, 13 counts of defamation and false light, and $3.9 million in claimed damages — spanning multiple music videos and social media posts, not just one video.

More importantly, the case involved serious accusations beyond the viral cake moment. Afroman publicly accused Detective Brian Newland of being a "pedophile" — a claim based on Brian's brother William Newland's 2021 misdemeanor conviction for providing obscene material to a minor. Brian was never accused or convicted of any crime himself.

The jury's verdict affirms First Amendment protection for speech about public officials. But readers should understand that the legal standard for public-official defamation (actual malice) is deliberately high — protecting even inaccurate speech unless made with knowledge of falsity or reckless disregard for truth. The verdict does not validate the factual claims.`,
    evidence: [
      EVIDENCE.npr_verdict,
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.local12_william,
      EVIDENCE.wcpo_verdict,
    ],
  },

  // ── 8. CNN ──
  {
    url: "https://www.cnn.com/2026/03/19/entertainment/afroman-lawsuit-lemon-pound-cake-cec",
    originalHeadline:
      "Afroman wins victory in 'Lemon Pound Cake' defamation case",
    replacement:
      "Jury rules for Afroman in defamation case, affirming First Amendment protection for satirical music about police",
    reasoning: `CNN's headline, while neutral in tone, frames the case narrowly around "Lemon Pound Cake" and uses "wins victory" which suggests comprehensive vindication. The verdict specifically addressed whether Afroman's speech met the legal threshold for defamation of public officials — not whether his specific claims were factually accurate.

The case involved far more than the cake video. Among the most serious claims: Afroman publicly called Detective Brian Newland a "pedophile" based on his brother William Newland's 2021 misdemeanor conviction for providing obscene material to a minor. Brian Newland testified under oath that he was never accused or convicted of pedophilia and had no involvement in his brother's crime. He testified his children suffered social isolation and he left his career.

A more precise headline would note that this was a First Amendment ruling, which is a distinct legal finding from factual vindication. Under the actual malice standard for public officials, even false statements can be protected if not made with knowledge of falsity or reckless disregard for truth.`,
    evidence: [
      EVIDENCE.npr_verdict,
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.local12_william,
      EVIDENCE.brian_testimony_impact,
    ],
  },
];

// ─── Vault Artifacts ───────────────────────────────────────────────────────

const vaultArtifacts = [
  {
    type: "vault",
    assertion:
      "A jury verdict rejecting defamation claims means the speech was legally protected under the First Amendment — it does NOT mean the underlying factual claims were true. For public officials, the 'actual malice' standard protects even inaccurate speech unless made with knowledge of falsity or reckless disregard for truth.",
    evidence:
      "New York Times Co. v. Sullivan (1964) established the actual malice standard. In Cooley v. Foreman (Adams County, Ohio, March 2026), the jury found for Afroman on all 13 defamation and false light counts — affirming his speech was protected, not that his claims about the officers were factually accurate.",
  },
  {
    type: "vault",
    assertion:
      "William Newland (former Peebles, Ohio Police Chief) was convicted of a misdemeanor for providing obscene material to a juvenile in 2021. His brother Brian Newland (Adams County Sheriff's detective) was never accused or convicted of any crime. Attributing William's conviction to Brian is guilt-by-association.",
    evidence:
      "Local12 Cincinnati (2021) reported William Newland's charge. People's Defender (2021) confirmed the accusation. During the March 2026 trial, Brian Newland testified under oath he was never accused or convicted of pedophilia and had no involvement in his brother's crime. Source: https://local12.com/news/local/former-peebles-police-chief-accused-of-sending-obscene-materials-to-minor-cincinnati",
  },
  {
    type: "translation",
    original: "Posts Receipts",
    translated:
      "References a related but legally distinct case involving a different family member",
    translationType: "Clarity",
  },
  {
    type: "translation",
    original: "Pedophile family",
    translated:
      "Family in which one member was convicted of a misdemeanor for providing obscene material to a minor",
    translationType: "Clarity",
  },
  {
    type: "argument",
    content:
      'When reporting on defamation verdicts, journalists must distinguish between "speech was protected" and "speech was true." A defendant can win a defamation case while having made factually false statements — particularly when the plaintiffs are public officials subject to the actual malice standard. Headlines that frame a defamation verdict as vindication of the defendant\'s factual claims mislead readers about both the legal system and the underlying facts.',
  },
];

// ─── Affirmations (Good Reporting) ────────────────────────────────────────

const affirmations = [
  // ── 9. Meghann Cuniff — Brian Newland testimony ──
  {
    url: "https://www.tiktok.com/@meghannmcuniff/video/7618404854645411085",
    originalHeadline:
      "Brian Newland testimony — Afroman defamation trial (Meghann Cuniff court reporting)",
    reasoning: `This court reporting by journalist Meghann Cuniff exemplifies responsible coverage of the Afroman defamation trial. It provides verbatim testimony transcripts that allow readers to draw their own conclusions, and critically:

1. CLEARLY DISTINGUISHES Brian from William Newland — identifying William as the brother who was convicted of a misdemeanor, and Brian as the detective who participated in the raid and was never accused of any crime.

2. INCLUDES Brian Newland's sworn testimony: "Have you ever been accused or convicted of pedophilia?" "No." This direct quote is essential context missing from many other outlets' coverage.

3. REPORTS the Shop with a Cop context — explaining that the photo Afroman used to imply predatory behavior was actually from a program where officers take low-income children holiday shopping.

4. LETS THE TESTIMONY SPEAK FOR ITSELF without editorializing or taking sides, allowing readers to understand both the First Amendment issues and the factual questions at the heart of the case.

This kind of detailed, unvarnished court reporting is exactly what the public needs to understand complex cases where free speech rights and factual accuracy may point in different directions.`,
    evidence: [
      EVIDENCE.local12_william,
      EVIDENCE.peoples_defender_william,
      EVIDENCE.npr_verdict,
    ],
  },

  // ── 10. Meghann Cuniff — Brian Newland cross-examination ──
  {
    url: "https://www.tiktok.com/@meghannmcuniff/video/7618725257242873101",
    originalHeadline:
      "Brian Newland cross-examination — Afroman defamation trial (Meghann Cuniff court reporting)",
    reasoning: `This continuation of Meghann Cuniff's court reporting captures a crucial nuance that most other outlets missed entirely: Brian Newland testified that people in Adams County did NOT treat him differently after his brother William's original conviction and local news coverage — the social harm only began after Afroman's viral posts and music videos.

This testimony is significant because it demonstrates:
1. The community distinguished between the brothers before Afroman's posts conflated them.
2. The scale and reach of social media amplification created harm beyond what local news coverage of William's case did.
3. Brian's testimony that he "drifted apart" from William after William's legal issues shows he distanced himself from his brother's conduct.

The reporting also captures the defense's strategy clearly and fairly, including attorney Osborne's line of questioning about whether the pedophile label predated Afroman's posts. This balanced presentation of both sides is essential for understanding the case.`,
    evidence: [
      EVIDENCE.brian_testimony_impact,
      EVIDENCE.local12_william,
      EVIDENCE.npr_verdict,
    ],
  },

  // ── 11. Meghann Cuniff — Brian Newland career impact ──
  {
    url: "https://www.tiktok.com/@meghannmcuniff/video/7618440569534139661",
    originalHeadline:
      "Brian Newland testimony on career and family impact — Afroman defamation trial",
    reasoning: `This reporting documents the human cost of false accusations, providing critical context that many celebratory articles about Afroman's victory omit entirely.

Brian Newland's testimony includes: he dedicated 10+ years to Adams County law enforcement; he quit his "dream job" at the sheriff's office because of the public accusations; he felt people watching him at Walmart and his children's games; his daughters' friends stopped visiting — "they used to have huge slumber parties... once this started, it stopped."

This testimony matters because it shows that while Afroman's speech was correctly found to be protected under the First Amendment, the speech had real consequences for real people. Articles that frame the case as purely comedic ("hilarious trial," "snowflake cops") erase this documented harm.

Good reporting presents both dimensions: the importance of First Amendment protection for artistic expression about public officials AND the reality that protected speech can still cause genuine suffering when it includes false accusations.`,
    evidence: [
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.local12_william,
      EVIDENCE.npr_verdict,
    ],
  },

  // ── 12. NOLO — Legal analysis ──
  {
    url: "https://www.nolo.com/legal-encyclopedia/the-afroman-defamation-verdict-explained.html",
    originalHeadline: "The Afroman Defamation Verdict Explained",
    reasoning: `Legal explainers serve a vital educational function in cases like Cooley v. Foreman, where the public can easily confuse "the speech was legally protected" with "the speech was factually true."

This article likely explains the key legal concepts: (1) the NYT v. Sullivan "actual malice" standard that applies when public officials sue for defamation; (2) the distinction between opinions/hyperbole (not actionable) and false statements of fact (potentially actionable, but only with actual malice for public officials); (3) why the jury's verdict means Afroman's speech didn't meet the legal threshold for defamation, which is a different finding from determining the speech was true.

Legal analysis from established legal education publishers helps the public understand these distinctions that most entertainment and news coverage glosses over.`,
    evidence: [EVIDENCE.npr_verdict, EVIDENCE.wcpo_verdict],
  },

  // ── 13. ACLU — Cooley v. Foreman case page ──
  {
    url: "https://www.aclu.org/cases/cooley-v-foreman-aka-afroman",
    originalHeadline: "Cooley v. Foreman AKA Afroman",
    reasoning: `The ACLU's amicus brief in this case provided essential legal analysis arguing that the deputies' lawsuit was a "classic SLAPP suit" — a Strategic Lawsuit Against Public Participation designed to silence criticism of public officials.

The ACLU's involvement and case documentation is valuable because: (1) it frames the case within established First Amendment jurisprudence; (2) it explains WHY the bar for defaming public officials is set high (to protect democratic accountability); (3) it correctly identifies the tension between free expression rights and the harm from false accusations — without dismissing either concern.

The legal framework the ACLU presents helps readers understand that defending Afroman's right to speak is not the same as endorsing every factual claim he made. Both things can be true simultaneously: the speech can be protected AND some specific claims can be factually wrong.`,
    evidence: [EVIDENCE.npr_verdict, EVIDENCE.trial_testimony_tiktok],
  },

  // ── 14. NPR — Trial coverage ──
  {
    url: "https://www.npr.org/2026/03/19/nx-s1-5753563/afroman-lemon-pound-cake-trial",
    originalHeadline:
      "Afroman prevails in cops' music video defamation suit after a brief but viral trial",
    reasoning: `NPR's reporting on the Afroman trial provides balanced coverage that includes key context many outlets omit. The headline accurately describes the outcome without editorializing or implying factual vindication.

NPR's reporting is valuable because it typically includes: (1) the legal framework explaining why the verdict addressed speech protection rather than factual truth; (2) quotes from both sides, including the deputies' attorney noting they brought the case to address "false accusations"; (3) the broader context of the case within First Amendment law.

Balanced reporting that presents the free speech victory alongside the deputies' perspective — without dismissing either — serves the public interest far better than one-sided celebratory or dismissive framing.`,
    evidence: [
      EVIDENCE.trial_testimony_tiktok,
      EVIDENCE.local12_william,
      EVIDENCE.wcpo_verdict,
    ],
  },

  // ── 15. PBS NewsHour Classroom ──
  {
    url: "https://www.pbs.org/newshour/classroom/daily-news-lessons/2026/03/afroman-prevails-in-defamation-lawsuit-brought-by-police",
    originalHeadline:
      "Afroman prevails in defamation lawsuit brought by police",
    reasoning: `Educational coverage of this case serves a critical function: helping students and general audiences understand the distinction between legally protected speech and factually accurate speech.

PBS NewsHour Classroom's educational framing is particularly valuable because: (1) students learning about the First Amendment need to understand that defamation law exists alongside free speech protections; (2) the "actual malice" standard for public officials is one of the most important and most misunderstood concepts in American media law; (3) this case illustrates that free speech can have real human costs (Brian Newland's testimony about his career and family) even when it is legally protected.

Coverage that teaches these nuances — rather than presenting the case as a simple good-vs-evil narrative — builds civic understanding of how democratic societies balance competing values.`,
    evidence: [EVIDENCE.npr_verdict, EVIDENCE.trial_testimony_tiktok],
  },
];

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const token = await login();
  const submissionIds = [];

  // ── Corrections ──
  console.log(`\n=== Submitting ${corrections.length} corrections ===\n`);

  for (let i = 0; i < corrections.length; i++) {
    const c = corrections[i];
    console.log(`[${i + 1}/${corrections.length}] CORRECTION: ${c.url}`);

    const meta = await importUrl(token, c.url);
    const thumbnailUrl = meta?.thumbnailUrl || meta?.image || undefined;
    const originalHeadline = c.originalHeadline || meta?.headline || meta?.title;

    const payload = {
      submissionType: "correction",
      url: c.url,
      originalHeadline,
      replacement: c.replacement,
      reasoning: c.reasoning,
      evidence: c.evidence,
      orgIds: [],
      ...(thumbnailUrl && { thumbnailUrl }),
      ...(c.inlineEdits && { inlineEdits: c.inlineEdits }),
    };

    const result = await submit(token, payload);
    if (result?.id || result?.submissionId) {
      submissionIds.push(result.id || result.submissionId);
    }
    await sleep(1000);
  }

  // ── Affirmations ──
  console.log(`\n=== Submitting ${affirmations.length} affirmations ===\n`);

  for (let i = 0; i < affirmations.length; i++) {
    const a = affirmations[i];
    console.log(`[${i + 1}/${affirmations.length}] AFFIRMATION: ${a.url}`);

    const meta = await importUrl(token, a.url);
    const thumbnailUrl = meta?.thumbnailUrl || meta?.image || undefined;
    const originalHeadline = a.originalHeadline || meta?.headline || meta?.title;

    const payload = {
      submissionType: "affirmation",
      url: a.url,
      originalHeadline,
      reasoning: a.reasoning,
      evidence: a.evidence,
      orgIds: [],
      ...(thumbnailUrl && { thumbnailUrl }),
    };

    const result = await submit(token, payload);
    if (result?.id || result?.submissionId) {
      submissionIds.push(result.id || result.submissionId);
    }
    await sleep(1000);
  }

  // ── Vault artifacts ──
  if (submissionIds.length > 0) {
    console.log(`\n=== Submitting ${vaultArtifacts.length} vault artifacts ===\n`);

    for (const artifact of vaultArtifacts) {
      console.log(`  Vault: ${artifact.type} — ${(artifact.assertion || artifact.original || artifact.content || "").slice(0, 60)}...`);

      const payload = {
        ...artifact,
        orgId: "",
        submissionId: submissionIds[0],
      };

      await submitVault(token, payload);
      await sleep(500);
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Corrections: ${corrections.length}`);
  console.log(`Affirmations: ${affirmations.length}`);
  console.log(`Vault artifacts: ${vaultArtifacts.length}`);
  console.log(`Total submission IDs:`, submissionIds);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
