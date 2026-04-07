import { useState } from "react";

// Extension design system colors
const C = {
  navy: "#1B2A4A", linen: "#F0EDE6", vellum: "#FDFBF5", gold: "#B8963E",
  green: "#1B5E3F", red: "#C4573F", teal: "#2A6B6B", orange: "#D4850A",
  purple: "#5B2D8E", border: "#DCD8D0", textMuted: "#7A7570", text: "#2B2B2B",
};

const MOCK = {
  correction: {
    id: "ext-mock-c1", orgName: "The General Public", orgId: "org-1",
    originalHeadline: "City Announces Record $50M Investment in Public Schools",
    replacement: "Actual New Funding Is $12M \u2014 The Rest Is Pre-Existing Budget Reallocations",
    reasoning: "The headline claims a \u2018$50M investment\u2019 but city council documents show only $12M in new funding.",
    author: "City Desk Staff", status: "approved", trustScore: 72,
    profile: { displayName: "The King of America" },
    evidence: [
      { url: "https://citycouncil.gov/budget/2025", explanation: "Official budget document" },
    ],
  },
  affirmation: {
    id: "ext-mock-a1", orgName: "Fact Checkers United", orgId: "org-2",
    originalHeadline: "New Study Confirms Vaccine Reduces Hospitalization by 85%",
    reasoning: "Study methodology is sound, sample size adequate, and conclusions are supported.",
    status: "approved", trustScore: 88,
    profile: { displayName: "ScienceFirst" },
  },
  pending: {
    id: "ext-mock-p1", orgName: "The General Public", orgId: "org-1",
    originalHeadline: "Mayor Claims Crime Rate at Historic Low",
    replacement: "Crime Rate Decline Only Applies to Property Crime \u2014 Violent Crime Rose 12%",
    reasoning: "Selective statistics. The mayor\u2019s claim cherry-picks property crime while ignoring violent crime increase.",
    status: "pending_review", trustScore: 45,
    profile: { displayName: "WatchdogReporter" },
  },
  translations: [
    { id: "t1", original: "record investment", translated: "budget line consolidation marketed as new spending", type: "propaganda", orgName: "The General Public" },
    { id: "t2", original: "experts say", translated: "unnamed sources claim", type: "clarity", orgName: "Fact Checkers United" },
    { id: "t3", original: "right-sizing", translated: "layoffs", type: "euphemism", orgName: "The General Public" },
    { id: "t4", original: "enhanced interrogation", translated: "torture", type: "satirical", orgName: "Fact Checkers United" },
  ],
  inlineEdits: [
    { original: "The $50 million represents the largest single investment in education in the city\u2019s history.", replacement: "[CORRECTION: $12M is new funding. The $50M figure includes $38M in pre-existing budget lines.]" },
    { original: "Critics have praised the mayor\u2019s bold commitment.", replacement: "[CORRECTION: Several council members and the teachers\u2019 union criticized the announcement as misleading.]" },
  ],
  vault: {
    corrections: [
      { assertion: "Municipal budget announcements frequently conflate reorganized existing funds with new appropriations.", org_name: "The General Public", survival_count: 3 },
    ],
    arguments: [
      { content: "When a government entity announces \u2018record investment\u2019 by consolidating existing budget lines, the journalistic obligation is to distinguish between new appropriations and accounting reclassifications.", org_name: "The General Public", survival_count: 1 },
    ],
    beliefs: [
      { content: "Taxpayers deserve accurate information about how their money is being allocated. Budget transparency is a prerequisite for democratic accountability.", org_name: "The General Public" },
    ],
  },
};


const SITE_MOCKS = [
  { name: "News Article (CNN/NYT/WaPo)", type: "article",
    headline: "City Announces Record $50M Investment in Public Schools",
    byline: "By Sarah Johnson | April 5, 2026 | 4 min read",
    body: "The $50 million represents the largest single investment in education in the city\u2019s history. Critics have praised the mayor\u2019s bold commitment to education reform. Experts say this will transform the district within five years.",
  },
  { name: "Twitter / X Post", type: "twitter",
    author: "@CityMayor", avatar: null,
    text: "Proud to announce a RECORD $50M investment in our public schools! This is what real leadership looks like. #Education #Investing",
    timestamp: "Apr 5",
  },
  { name: "Reddit Post", type: "reddit",
    subreddit: "r/LocalNews", author: "u/city_watcher",
    title: "City Announces Record $50M Investment in Public Schools",
    score: "2.4k", comments: "342 comments",
  },
  { name: "YouTube Video", type: "youtube",
    title: "City Announces Record $50M Investment in Public Schools",
    channel: "City News Network", views: "125K views", date: "3 days ago",
  },
  { name: "Substack Article", type: "substack",
    title: "City Announces Record $50M Investment in Public Schools",
    author: "The City Reporter", date: "April 5, 2026",
    body: "The $50 million represents the largest single investment in education in the city\u2019s history.",
  },
];

// Simulated page frame wrapper
function SiteFrame({ site, children }) {
  const frameBg = { article: "#fff", twitter: "#000", reddit: "#0e1113", youtube: "#0f0f0f", substack: "#fff" };
  const fg = { article: "#222", twitter: "#e7e9ea", reddit: "#d7dadc", youtube: "#fff", substack: "#222" };
  const headerBg = { article: "#1a1a2e", twitter: "#000", reddit: "#1a1a1b", youtube: "#212121", substack: "#fff" };
  const headerFg = { article: "#fff", twitter: "#e7e9ea", reddit: "#d7dadc", youtube: "#fff", substack: "#222" };
  const siteLabels = { article: "the-daily-example.com", twitter: "x.com", reddit: "reddit.com", youtube: "youtube.com", substack: "thecityreporter.substack.com" };

  return (
    <div style={{ border: "1px solid " + C.border, borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
      {/* Browser chrome mockup */}
      <div style={{ background: "#f0f0f0", padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ddd" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        </div>
        <div style={{ flex: 1, background: "#fff", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "#666", fontFamily: "monospace" }}>
          {siteLabels[site.type] || site.name}
        </div>
      </div>
      {/* Site header */}
      <div style={{ background: headerBg[site.type], color: headerFg[site.type], padding: "8px 16px", fontSize: 12, fontWeight: 700, borderBottom: site.type === "substack" ? "1px solid #eee" : "none" }}>
        {site.type === "twitter" && <span style={{ fontSize: 18 }}>&#x1D54F;</span>}
        {site.type === "reddit" && "reddit"}
        {site.type === "youtube" && <span><span style={{ color: "#ff0000" }}>&#9654;</span> YouTube</span>}
        {site.type === "article" && "THE DAILY EXAMPLE"}
        {site.type === "substack" && site.author}
      </div>
      {/* Page content */}
      <div style={{ background: frameBg[site.type], color: fg[site.type], padding: 16, minHeight: 120, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        {children}
      </div>
    </div>
  );
}


// Render mock extension elements using inline styles matching the real extension CSS
function MockContextCard({ type }) {
  const isCorrection = type === "correction";
  const isAffirmation = type === "affirmation";
  const isPending = type === "pending";
  const sub = isCorrection ? MOCK.correction : isAffirmation ? MOCK.affirmation : MOCK.pending;
  const signalText = isCorrection ? "Corrections Filed" : isAffirmation ? "Headline Verified" : "Under Review";
  const signalColor = isCorrection ? C.red : isAffirmation ? C.green : C.orange;
  const iconFile = isCorrection ? "/icons/Brick red lighthouse emblem.png" : isAffirmation ? "/icons/Green lighthouse with laurel wreath.png" : "/icons/Lighthouse within laurel wreath emblem.png";
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ margin: "8px 0 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Folder tab */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px 4px 10px", background: C.vellum, border: "1px solid " + signalColor, borderBottom: "none", borderRadius: "4px 4px 0 0", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: signalColor, marginBottom: -1, position: "relative", zIndex: 1 }}>
        <img src={iconFile} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />
        Trust Assembly
      </div>
      {/* Card */}
      <div style={{ border: "1px solid " + C.border, borderRadius: "0 4px 4px 4px", background: C.vellum, overflow: "hidden" }}>
        <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: expanded ? "1px solid " + C.border : "none", cursor: "pointer" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: signalColor, display: "flex", alignItems: "center", gap: 6 }}>
            <img src={iconFile} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />
            {signalText}
            <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 400, color: "#B0A89C" }}>1 {isCorrection ? "correction" : isAffirmation ? "affirmation" : "pending"}</span>
          </span>
          <span style={{ fontSize: 9, color: "#B0A89C" }}>{expanded ? "\u25BE collapse" : "\u25B8 details"}</span>
        </div>
        {expanded && (
          <div style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 2, background: isCorrection ? "#FAE8E5" : isAffirmation ? "#E5F0EA" : "#FDF0E4", color: signalColor }}>
                1 {isCorrection ? "correction" : isAffirmation ? "affirmation" : "pending"}
              </span>
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>Reviewed by: <strong style={{ color: C.navy }}>{sub.orgName}</strong></div>
            {sub.id && <a href="#" onClick={e => e.preventDefault()} style={{ display: "block", marginTop: 8, fontSize: 10, color: C.gold, textDecoration: "none", fontWeight: 600 }}>View full record on Trust Assembly →</a>}
            {/* Mute toggle */}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid " + C.border, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: C.textMuted }}>Show corrections on <strong style={{ color: C.navy }}>the-daily-example.com</strong></span>
              <span style={{ display: "inline-block", width: 32, height: 18, borderRadius: 9, background: C.green, position: "relative", cursor: "pointer" }}>
                <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function MockUnappliedBox() {
  const sub = MOCK.correction;
  return (
    <div style={{ margin: "8px 0 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px 4px 10px", background: C.vellum, border: "1px solid " + C.red, borderBottom: "none", borderRadius: "4px 4px 0 0", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: C.red, marginBottom: -1, position: "relative", zIndex: 1 }}>
        <img src="/icons/Brick red lighthouse emblem.png" alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />
        Trust Assembly
      </div>
      <div style={{ border: "1px solid " + C.border, borderLeft: "3px solid " + C.red, borderRadius: "0 4px 4px 4px", background: C.vellum, padding: "10px 14px" }}>
        <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5, marginBottom: 8, fontStyle: "italic" }}>A correction was made to this page that can no longer be matched.</div>
        <div style={{ fontSize: 14, color: C.red, fontWeight: 700, lineHeight: 1.4, marginBottom: 3, cursor: "pointer" }}>{sub.replacement}</div>
        <div style={{ fontSize: 10, color: C.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
          <img src="/icons/Brick red lighthouse emblem.png" alt="" style={{ width: 14, height: 14, borderRadius: "50%" }} />
          <strong style={{ color: C.navy }}>{sub.orgName}</strong> · {sub.profile.displayName} · Trust Score {sub.trustScore}
        </div>
      </div>
    </div>
  );
}

function MockFloatingBadge({ type }) {
  const iconMap = { correction: "/icons/Brick red lighthouse emblem.png", affirmation: "/icons/Green lighthouse with laurel wreath.png", pending: "/icons/Lighthouse within laurel wreath emblem.png", default: "/icons/Golden lighthouse emblem with laurel wreath.png" };
  const colorMap = { correction: C.red, affirmation: C.green, pending: "#7A7570", default: C.gold };
  const icon = iconMap[type] || iconMap.default;
  const color = colorMap[type] || colorMap.default;
  return (
    <div style={{ position: "absolute", bottom: 12, right: 12, cursor: "pointer", filter: "drop-shadow(0 2px 8px rgba(27,42,74,0.25))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.vellum, color: C.navy, padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, border: "1.5px solid " + C.border, borderBottom: "2.5px solid " + color }}>
        <img src={icon} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
        <div style={{ background: color, color: "#fff", padding: "1px 7px", borderRadius: 10, fontSize: 11, fontWeight: 800, minWidth: 18, textAlign: "center" }}>3</div>
      </div>
    </div>
  );
}

function MockHoverTooltip({ type }) {
  const isCorrection = type === "correction";
  return (
    <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 10, background: C.vellum, color: C.text, padding: "8px 12px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 12, lineHeight: 1.4, maxWidth: 400, minWidth: 180, boxShadow: "0 2px 12px rgba(27,42,74,0.12)", pointerEvents: "none" }}>
      {isCorrection ? (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#B0A89C", marginBottom: 3 }}>Original headline</div>
          <div>{MOCK.correction.originalHeadline}</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.green, marginBottom: 3 }}>Headline verified</div>
          <div style={{ color: C.textMuted, fontSize: 10 }}>Affirmed by {MOCK.affirmation.orgName}</div>
        </>
      )}
    </div>
  );
}

function MockInlineEdits() {
  return (
    <div style={{ marginTop: 8 }}>
      {MOCK.inlineEdits.map((edit, i) => (
        <span key={i} style={{ position: "relative", display: "inline" }}>
          <span style={{ textDecoration: "line-through", textDecorationColor: C.red, color: "#8A8580", background: "#FDF0EE" }}>{edit.original}</span>
          <span style={{ color: C.red, fontWeight: 700, background: "#FDF8F7", borderBottom: "2px solid " + C.red, marginLeft: 2, cursor: "help" }}>
            {edit.replacement}<sup style={{ fontSize: 9, color: C.red, verticalAlign: "super", marginLeft: 1 }}>{"\u1D40\u1D2C"}</sup>
          </span>
          {" "}
        </span>
      ))}
    </div>
  );
}

function MockTranslations() {
  const colorMap = { clarity: C.teal, propaganda: C.orange, euphemism: C.red, satirical: C.purple };
  return (
    <div style={{ marginTop: 12, padding: 10, background: "rgba(212,133,10,0.05)", borderRadius: 4, border: "1px solid rgba(212,133,10,0.2)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.orange, marginBottom: 8 }}>Translation Overlays</div>
      {MOCK.translations.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4, lineHeight: 1.5 }}>
          <span style={{ borderBottom: "2px dotted " + (colorMap[t.type] || C.teal), cursor: "help" }}>{t.original}<sup style={{ fontSize: 8, color: colorMap[t.type], fontWeight: 700, marginLeft: 1 }}>{"\u1D40\u1D2C"}</sup></span>
          <span style={{ color: C.orange, fontWeight: 700 }}>{"\u2192"}</span>
          <span style={{ color: C.orange, fontWeight: 700 }}>{t.translated}</span>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", padding: "1px 5px", border: "1px solid " + (colorMap[t.type] || C.teal), borderRadius: 2, color: colorMap[t.type] }}>{t.type}</span>
        </div>
      ))}
    </div>
  );
}


function MockVaultEntries() {
  return (
    <div style={{ borderTop: "1px solid " + C.border, padding: "10px 14px" }}>
      {MOCK.vault.corrections.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted, marginBottom: 6, paddingBottom: 3, borderBottom: "1px solid #EBE8E2" }}>Standing Corrections</div>
          {MOCK.vault.corrections.map((v, i) => (
            <div key={i} style={{ padding: "6px 10px", borderRadius: 3, background: "#fff", border: "1px solid #EBE8E2", borderLeft: "3px solid " + C.gold, marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 3 }}>{v.assertion}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{v.org_name} · Survived {v.survival_count} challenge{v.survival_count !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      )}
      {MOCK.vault.arguments.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted, marginBottom: 6, paddingBottom: 3, borderBottom: "1px solid #EBE8E2" }}>Active Arguments</div>
          {MOCK.vault.arguments.map((v, i) => (
            <div key={i} style={{ padding: "6px 10px", borderRadius: 3, background: "#fff", border: "1px solid #EBE8E2", borderLeft: "3px solid " + C.teal, marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 3 }}>{v.content}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{v.org_name} · Survived {v.survival_count} challenge{v.survival_count !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      )}
      {MOCK.vault.beliefs.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted, marginBottom: 6, paddingBottom: 3, borderBottom: "1px solid #EBE8E2" }}>Foundational Beliefs</div>
          {MOCK.vault.beliefs.map((v, i) => (
            <div key={i} style={{ padding: "6px 10px", borderRadius: 3, background: "#fff", border: "1px solid #EBE8E2", borderLeft: "3px solid " + C.purple }}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{v.content}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>{v.org_name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// Render a mock page with extension elements injected
function MockPage({ site, showTooltip }) {
  const sub = MOCK.correction;

  if (site.type === "twitter") {
    return (
      <SiteFrame site={site}>
        <div style={{ borderBottom: "1px solid #2f3336", paddingBottom: 12, position: "relative" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#333" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{site.author} <span style={{ color: "#71767b", fontWeight: 400 }}>· {site.timestamp}</span></div>
              <div style={{ position: "relative", display: "inline" }}>
                <span style={{ color: C.red, fontWeight: 700, cursor: "help" }}>
                  {sub.replacement}
                  {showTooltip && <MockHoverTooltip type="correction" />}
                </span>
              </div>
            </div>
          </div>
          <MockContextCard type="correction" />
          <MockFloatingBadge type="correction" />
        </div>
      </SiteFrame>
    );
  }

  if (site.type === "reddit") {
    return (
      <SiteFrame site={site}>
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 10, color: "#818384", marginBottom: 4 }}>{site.subreddit} · Posted by {site.author}</div>
          <div style={{ position: "relative", display: "inline" }}>
            <h3 style={{ color: C.red, fontWeight: 700, fontSize: 18, margin: "4px 0", cursor: "help" }}>
              {sub.replacement}
              {showTooltip && <MockHoverTooltip type="correction" />}
            </h3>
          </div>
          <div style={{ fontSize: 11, color: "#818384", marginTop: 4 }}>{site.score} · {site.comments}</div>
          <MockContextCard type="correction" />
          <MockFloatingBadge type="correction" />
        </div>
      </SiteFrame>
    );
  }

  if (site.type === "youtube") {
    return (
      <SiteFrame site={site}>
        <div style={{ position: "relative" }}>
          <div style={{ background: "#272727", borderRadius: 12, height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 48, marginBottom: 12 }}>{"\u25B6"}</div>
          <div style={{ position: "relative", display: "inline" }}>
            <h1 style={{ color: C.red, fontWeight: 700, fontSize: 18, margin: "4px 0", cursor: "help" }}>
              {sub.replacement}
              {showTooltip && <MockHoverTooltip type="correction" />}
            </h1>
          </div>
          <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{site.channel} · {site.views} · {site.date}</div>
          <MockContextCard type="correction" />
          <MockFloatingBadge type="correction" />
        </div>
      </SiteFrame>
    );
  }

  if (site.type === "substack") {
    return (
      <SiteFrame site={site}>
        <div style={{ position: "relative", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ position: "relative", display: "inline" }}>
            <h1 style={{ color: C.red, fontWeight: 700, fontSize: 26, lineHeight: 1.3, margin: "0 0 8px", cursor: "help", fontFamily: "Georgia, serif" }}>
              {sub.replacement}
              {showTooltip && <MockHoverTooltip type="correction" />}
            </h1>
          </div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>{site.author} · {site.date}</div>
          <MockContextCard type="correction" />
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "#333" }}>{site.body}</p>
          <MockInlineEdits />
          <MockFloatingBadge type="correction" />
        </div>
      </SiteFrame>
    );
  }

  // Default: article (CNN/NYT style)
  return (
    <SiteFrame site={site}>
      <div style={{ position: "relative", maxWidth: 680, margin: "0 auto" }}>
        <div style={{ position: "relative", display: "inline" }}>
          <h1 style={{ color: C.red, fontWeight: 700, fontSize: 28, lineHeight: 1.3, margin: "0 0 4px", cursor: "help", fontFamily: "Georgia, serif" }}>
            {sub.replacement}
            {showTooltip && <MockHoverTooltip type="correction" />}
          </h1>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>{site.byline}</div>
        <MockContextCard type="correction" />
        <p style={{ fontSize: 16, lineHeight: 1.8, color: "#333", marginBottom: 12 }}>{site.body}</p>
        <MockInlineEdits />
        <MockTranslations />
        <MockVaultEntries />
        <MockFloatingBadge type="correction" />
      </div>
    </SiteFrame>
  );
}


function MockPopupPreview() {
  return (
    <div style={{ width: 380, border: "1px solid " + C.border, borderRadius: 6, overflow: "hidden", background: C.vellum, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(180deg, #1a1a1a 0%, #222 100%)", color: C.linen, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/icons/Golden lighthouse emblem with laurel wreath.png" alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.1em" }}><span style={{ fontSize: 19 }}>T</span>RUST <span style={{ fontSize: 19 }}>A</span>SSEMBLY</div>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", color: C.gold, fontWeight: 500, marginTop: 2 }}>TRUTH WILL OUT</div>
        </div>
      </div>
      {/* Tab bar */}
      <div style={{ display: "flex", padding: "0 14px", borderBottom: "1px solid #eee", background: "#fff" }}>
        {["This Page", "Submit", "Assemblies"].map((t, i) => (
          <div key={t} style={{ padding: "9px 0", marginRight: 18, fontSize: 12.5, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "#1a1a1a" : "#999", borderBottom: i === 0 ? "2px solid #1a1a1a" : "2px solid transparent" }}>{t}</div>
        ))}
      </div>
      {/* Site mute bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid " + C.border, background: C.linen, fontSize: 11, color: "#5A5650" }}>
        <span>Corrections on <strong style={{ color: C.navy }}>the-daily-example.com</strong></span>
        <span style={{ display: "inline-block", width: 36, height: 20, borderRadius: 10, background: C.green, position: "relative" }}>
          <span style={{ display: "block", width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </span>
      </div>
      {/* Status */}
      <div style={{ padding: "12px 16px", fontSize: 12, color: "#5A5650", borderBottom: "1px solid " + C.border }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.navy, display: "block", marginBottom: 2 }}>3</span>
        1 correction · 1 affirmation · 1 translation
      </div>
      {/* Correction item */}
      <div style={{ padding: "8px 12px" }}>
        <div style={{ padding: 10, marginBottom: 8, border: "1px solid " + C.border, borderRadius: 3, borderLeft: "4px solid " + C.green, background: "#fff" }}>
          <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Correction · {MOCK.correction.orgName} · Approved</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{MOCK.correction.replacement}</div>
        </div>
        <div style={{ padding: 10, marginBottom: 8, border: "1px solid " + C.border, borderRadius: 3, borderLeft: "4px solid " + C.green, background: "#fff" }}>
          <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Affirmation · {MOCK.affirmation.orgName} · Approved</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{"\u2713"} {MOCK.affirmation.originalHeadline}</div>
        </div>
      </div>
      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid " + C.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 10, color: C.gold, textDecoration: "none" }}>trustassembly.org</a>
        <span style={{ fontSize: 9, color: "#999" }}>Truth Will Out.</span>
      </div>
    </div>
  );
}


// Main component
export default function ExtensionDesignStudio() {
  const [activeSection, setActiveSection] = useState("elements");
  const [showTooltips, setShowTooltips] = useState(true);
  const [activeSite, setActiveSite] = useState(0);

  const sections = [
    { id: "elements", label: "Individual Elements" },
    { id: "sites", label: "Site Previews" },
    { id: "popup", label: "Popup Micro-App" },
    { id: "states", label: "All States" },
  ];

  return (
    <div className="ta-card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "2px", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>Extension Design Studio</div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 16 }}>
        Visual preview of every browser extension element with mock data. Shows how corrections, affirmations, translations, vault artifacts, and all lighthouse emblem states render across different site types.
      </div>

      {/* Section nav */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 3, overflow: "hidden", border: "1.5px solid var(--border)" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            flex: 1, padding: "8px 6px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.04em",
            background: activeSection === s.id ? "var(--gold)" : "#fff",
            color: activeSection === s.id ? "#fff" : "var(--text-muted)",
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── Individual Elements ── */}
      {activeSection === "elements" && (
        <div>
          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12 }}>Lighthouse Emblem States</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              { src: "/icons/Golden lighthouse emblem with laurel wreath.png", label: "Default / Gold", desc: "Extension icon, popup header" },
              { src: "/icons/Brick red lighthouse emblem.png", label: "Correction / Red", desc: "Correction cards, hover" },
              { src: "/icons/Green lighthouse with laurel wreath.png", label: "Affirmation / Green", desc: "Affirmation cards, hover" },
              { src: "/icons/Lighthouse within laurel wreath emblem.png", label: "Pending / Gray", desc: "User pending submissions" },
            ].map(icon => (
              <div key={icon.label} style={{ textAlign: "center", width: 100 }}>
                <img src={icon.src} alt={icon.label} style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: 6 }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text)" }}>{icon.label}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{icon.desc}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12 }}>Floating Badge States</h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
            {["default", "correction", "affirmation", "pending"].map(type => (
              <div key={type} style={{ position: "relative", width: 120, height: 60 }}>
                <MockFloatingBadge type={type} />
                <div style={{ fontSize: 9, color: "var(--text-muted)", position: "absolute", bottom: -16, left: 0 }}>{type}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12, marginTop: 30 }}>Trust Context Card (Expandable)</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ flex: "1 1 280px" }}><MockContextCard type="correction" /></div>
            <div style={{ flex: "1 1 280px" }}><MockContextCard type="affirmation" /></div>
            <div style={{ flex: "1 1 280px" }}><MockContextCard type="pending" /></div>
          </div>

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12 }}>Unapplied Corrections Box</h3>
          <MockUnappliedBox />

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12, marginTop: 20 }}>Hover Tooltips</h3>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ position: "relative", paddingTop: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Correction hover</div>
              <span style={{ color: C.red, fontWeight: 700, fontSize: 16, position: "relative", display: "inline-block" }}>
                {MOCK.correction.replacement.slice(0, 50)}...
                <MockHoverTooltip type="correction" />
              </span>
            </div>
            <div style={{ position: "relative", paddingTop: 60 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Affirmation hover</div>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 16, position: "relative", display: "inline-block" }}>
                {MOCK.affirmation.originalHeadline.slice(0, 50)}...
                <MockHoverTooltip type="affirmation" />
              </span>
            </div>
          </div>

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12 }}>Inline Body Edits</h3>
          <div style={{ fontSize: 15, lineHeight: 1.8, color: "#333", padding: 16, background: "#fff", border: "1px solid var(--border)", borderRadius: 4 }}>
            <MockInlineEdits />
          </div>

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12, marginTop: 20 }}>Translation Overlays (All 4 Types)</h3>
          <MockTranslations />

          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12, marginTop: 20 }}>Vault Entries</h3>
          <div style={{ border: "1px solid var(--border)", borderRadius: 4, background: C.vellum }}>
            <MockVaultEntries />
          </div>
        </div>
      )}

      {/* ── Site Previews ── */}
      {activeSection === "sites" && (
        <div>
          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
            {SITE_MOCKS.map((s, i) => (
              <button key={s.name} onClick={() => setActiveSite(i)} style={{
                flex: 1, padding: "6px 4px", border: "none", cursor: "pointer", fontSize: 9, fontWeight: 600,
                background: activeSite === i ? "var(--navy, #1B2A4A)" : "#fff",
                color: activeSite === i ? "#fff" : "var(--text-muted)",
              }}>{s.name.split("(")[0].trim()}</button>
            ))}
          </div>
          <label style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <input type="checkbox" checked={showTooltips} onChange={e => setShowTooltips(e.target.checked)} />
            Show hover tooltips
          </label>
          <MockPage site={SITE_MOCKS[activeSite]} showTooltip={showTooltips} />
        </div>
      )}

      {/* ── Popup Micro-App ── */}
      {activeSection === "popup" && (
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
          <MockPopupPreview />
        </div>
      )}

      {/* ── All States ── */}
      {activeSection === "states" && (
        <div>
          <h3 style={{ fontSize: 14, fontFamily: "var(--serif)", color: "var(--text)", marginBottom: 12 }}>All Submission States Side by Side</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {["correction", "affirmation", "pending"].map(type => (
              <div key={type}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "2px", color: "var(--gold)", fontWeight: 700, marginBottom: 8 }}>{type}</div>
                <MockContextCard type={type} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "2px", color: "var(--gold)", fontWeight: 700, marginBottom: 8 }}>Unapplied</div>
              <MockUnappliedBox />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
