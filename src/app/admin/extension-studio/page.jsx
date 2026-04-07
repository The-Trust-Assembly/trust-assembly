"use client";
import { useState, useEffect, useCallback } from "react";

const C = {
  navy: "#1B2A4A", linen: "#F0EDE6", vellum: "#FDFBF5", gold: "#B8963E",
  green: "#1B5E3F", red: "#C4573F", teal: "#2A6B6B", orange: "#D4850A",
  purple: "#5B2D8E", border: "#DCD8D0", muted: "#7A7570", text: "#2B2B2B",
  // admin dark theme
  bg: "#0f172a", card: "#1e293b", cardBorder: "#334155", dt: "#e2e8f0", dm: "#94a3b8",
};

const MOCK = {
  correction: {
    id: "c1", orgName: "The General Public", originalHeadline: "City Announces Record $50M Investment in Public Schools",
    replacement: "Actual New Funding Is $12M \u2014 The Rest Is Pre-Existing Budget Reallocations",
    reasoning: "The headline claims a \u2018$50M investment\u2019 but city council documents show only $12M in new funding.",
    author: "City Desk Staff", status: "approved", trustScore: 72, profile: { displayName: "The King of America" },
  },
  affirmation: {
    id: "a1", orgName: "Fact Checkers United", originalHeadline: "New Study Confirms Vaccine Reduces Hospitalization by 85%",
    status: "approved", trustScore: 88, profile: { displayName: "ScienceFirst" },
  },
  pending: {
    id: "p1", orgName: "The General Public", originalHeadline: "Mayor Claims Crime Rate at Historic Low",
    replacement: "Crime Rate Decline Only Applies to Property Crime \u2014 Violent Crime Rose 12%",
    status: "pending_review", trustScore: 45, profile: { displayName: "WatchdogReporter" },
  },
  translations: [
    { original: "record investment", translated: "budget line consolidation", type: "propaganda" },
    { original: "experts say", translated: "unnamed sources claim", type: "clarity" },
    { original: "right-sizing", translated: "layoffs", type: "euphemism" },
    { original: "enhanced interrogation", translated: "torture", type: "satirical" },
  ],
  inlineEdits: [
    { original: "The $50 million represents the largest single investment in education in the city\u2019s history.", replacement: "[CORRECTION: $12M is new funding. The $50M includes $38M in pre-existing budget lines.]" },
  ],
  vault: {
    corrections: [{ assertion: "Municipal budget announcements frequently conflate reorganized existing funds with new appropriations.", org_name: "The General Public", survival_count: 3 }],
    arguments: [{ content: "The journalistic obligation is to distinguish between new appropriations and accounting reclassifications.", org_name: "The General Public", survival_count: 1 }],
    beliefs: [{ content: "Taxpayers deserve accurate information about how their money is being allocated.", org_name: "The General Public" }],
  },
};

function esc(s) { return s || ""; }

// ── Shared sub-components ──
function ContextCard({ type }) {
  const [expanded, setExpanded] = useState(false);
  const isC = type === "correction", isA = type === "affirmation";
  const color = isC ? C.red : isA ? C.green : C.orange;
  const label = isC ? "Corrections Filed" : isA ? "Headline Verified" : "Under Review";
  const icon = isC ? "/icons/Brick red lighthouse emblem.png" : isA ? "/icons/Green lighthouse with laurel wreath.png" : "/icons/Lighthouse within laurel wreath emblem.png";
  const sub = isC ? MOCK.correction : isA ? MOCK.affirmation : MOCK.pending;
  return (
    <div style={{ margin: "8px 0 12px", fontFamily: "-apple-system,sans-serif" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px 4px 10px", background: C.vellum, border: `1px solid ${color}`, borderBottom: "none", borderRadius: "4px 4px 0 0", fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color, marginBottom: -1, position: "relative", zIndex: 1 }}>
        <img src={icon} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} /> Trust Assembly
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: "0 4px 4px 4px", background: C.vellum, overflow: "hidden" }}>
        <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: expanded ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, display: "flex", alignItems: "center", gap: 6 }}>
            <img src={icon} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />
            {label}
            <span style={{ fontSize: 10, fontWeight: 400, color: "#B0A89C" }}>1 {type}</span>
          </span>
          <span style={{ fontSize: 9, color: "#B0A89C" }}>{expanded ? "\u25BE collapse" : "\u25B8 details"}</span>
        </div>
        {expanded && (
          <div style={{ padding: "10px 14px", fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            Reviewed by: <strong style={{ color: C.navy }}>{sub.orgName}</strong><br/>
            <a href="#" onClick={e=>e.preventDefault()} style={{ color: C.gold, fontSize: 10, fontWeight: 600, textDecoration: "none", marginTop: 6, display: "inline-block" }}>View full record on Trust Assembly →</a>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: C.muted }}>Show corrections on <strong style={{ color: C.navy }}>example.com</strong></span>
              <span style={{ display: "inline-block", width: 32, height: 18, borderRadius: 9, background: C.green, position: "relative" }}>
                <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 16, boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ type }) {
  const icons = { correction: "/icons/Brick red lighthouse emblem.png", affirmation: "/icons/Green lighthouse with laurel wreath.png", pending: "/icons/Lighthouse within laurel wreath emblem.png", default: "/icons/Golden lighthouse emblem with laurel wreath.png" };
  const colors = { correction: C.red, affirmation: C.green, pending: "#7A7570", default: C.gold };
  const ic = icons[type] || icons.default, cl = colors[type] || colors.default;
  return (
    <div style={{ position: "absolute", bottom: 12, right: 12, filter: "drop-shadow(0 2px 8px rgba(27,42,74,.25))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.vellum, padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, border: `1.5px solid ${C.border}`, borderBottom: `2.5px solid ${cl}` }}>
        <img src={ic} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
        <div style={{ background: cl, color: "#fff", padding: "1px 7px", borderRadius: 10, fontSize: 11, fontWeight: 800, minWidth: 18, textAlign: "center" }}>3</div>
      </div>
    </div>
  );
}

function Tooltip({ type }) {
  const isC = type === "correction";
  return (
    <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 10, background: C.vellum, color: C.text, padding: "8px 12px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 12, lineHeight: 1.4, maxWidth: 400, minWidth: 180, boxShadow: "0 2px 12px rgba(27,42,74,.12)", pointerEvents: "none" }}>
      <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: isC ? "#B0A89C" : C.green, marginBottom: 3 }}>{isC ? "Original headline" : "Headline verified"}</div>
      <div style={{ fontSize: 12 }}>{isC ? MOCK.correction.originalHeadline : `Affirmed by ${MOCK.affirmation.orgName}`}</div>
    </div>
  );
}

// ── Browser frame ──
function Frame({ url, headerBg, headerFg, headerText, bg, fg, children }) {
  return (
    <div style={{ border: `1px solid ${C.cardBorder}`, borderRadius: 6, overflow: "hidden", marginBottom: 16, background: bg || "#fff" }}>
      <div style={{ background: "#e8e8e8", padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ccc" }}>
        <div style={{ display: "flex", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }}/><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }}/><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }}/></div>
        <div style={{ flex: 1, background: "#fff", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "#666", fontFamily: "monospace" }}>{url}</div>
      </div>
      {headerText && <div style={{ background: headerBg || "#1a1a2e", color: headerFg || "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>{headerText}</div>}
      <div style={{ padding: 16, color: fg || "#222", fontFamily: "-apple-system,sans-serif", position: "relative", minHeight: 140 }}>{children}</div>
    </div>
  );
}

// ── Site-specific page mocks ──
function ArticlePage() {
  return (
    <Frame url="the-daily-example.com/politics/budget-claims" headerText="THE DAILY EXAMPLE">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ position: "relative", display: "inline" }}>
          <h1 style={{ color: C.red, fontWeight: 700, fontSize: 26, lineHeight: 1.3, margin: "0 0 4px", fontFamily: "Georgia,serif", cursor: "help" }}>{MOCK.correction.replacement}<Tooltip type="correction" /></h1>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>By Sarah Johnson | April 5, 2026 | 4 min read</div>
        <ContextCard type="correction" />
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "#333", marginBottom: 8 }}>The $50 million represents the largest single investment in education in the city's history. Critics have praised the mayor's bold commitment to education reform.</p>
        <div style={{ position: "relative", display: "inline" }}>
          <span style={{ textDecoration: "line-through", textDecorationColor: C.red, color: "#8A8580", background: "#FDF0EE" }}>{MOCK.inlineEdits[0].original}</span>{" "}
          <span style={{ color: C.red, fontWeight: 700, background: "#FDF8F7", borderBottom: `2px solid ${C.red}` }}>{MOCK.inlineEdits[0].replacement}<sup style={{ fontSize: 9, color: C.red }}>{"\u1D40\u1D2C"}</sup></span>
        </div>
        <Badge type="correction" />
      </div>
    </Frame>
  );
}

function YouTubePage() {
  return (
    <Frame url="youtube.com/watch?v=abc123" bg="#0f0f0f" fg="#fff" headerBg="#212121" headerFg="#fff" headerText={<><span style={{ color: "#ff0000" }}>{"\u25B6"}</span> YouTube</>}>
      <div style={{ background: "#272727", borderRadius: 12, height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 48, marginBottom: 12 }}>{"\u25B6"}</div>
      <div style={{ position: "relative", display: "inline" }}>
        <h1 style={{ color: C.red, fontWeight: 700, fontSize: 18, margin: "0 0 4px", cursor: "help" }}>{MOCK.correction.replacement}<Tooltip type="correction" /></h1>
      </div>
      <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>City News Network · 125K views · 3 days ago</div>
      <ContextCard type="correction" />
      <Badge type="correction" />
    </Frame>
  );
}

function TwitterPage() {
  return (
    <Frame url="x.com/CityMayor/status/1234567890" bg="#000" fg="#e7e9ea" headerBg="#000" headerFg="#e7e9ea" headerText={<span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>&#x1D54F;</span>}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#333", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>City Mayor <span style={{ color: "#71767b", fontWeight: 400 }}>@CityMayor · Apr 5</span></div>
          <div style={{ position: "relative" }}>
            <span style={{ color: C.red, fontWeight: 700, cursor: "help", lineHeight: 1.5 }}>{MOCK.correction.replacement}<Tooltip type="correction" /></span>
          </div>
          <div style={{ display: "flex", gap: 40, marginTop: 10, fontSize: 13, color: "#71767b" }}>
            <span>{"\uD83D\uDCAC"} 142</span><span>{"\uD83D\uDD01"} 891</span><span>{"\u2764\uFE0F"} 3.2K</span><span>{"\uD83D\uDCCA"} 45K</span>
          </div>
          <ContextCard type="correction" />
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function RedditPage() {
  return (
    <Frame url="reddit.com/r/LocalNews/comments/abc123" bg="#0e1113" fg="#d7dadc" headerBg="#1a1a1b" headerFg="#d7dadc" headerText="reddit">
      <div style={{ fontSize: 11, color: "#818384", marginBottom: 4 }}>r/LocalNews · Posted by u/city_watcher · 8h</div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "#818384", fontSize: 12, fontWeight: 700 }}>
          <span>{"\u25B2"}</span><span>2.4k</span><span>{"\u25BC"}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ position: "relative" }}>
            <h3 style={{ color: C.red, fontWeight: 700, fontSize: 18, margin: "0 0 4px", cursor: "help" }}>{MOCK.correction.replacement}<Tooltip type="correction" /></h3>
          </div>
          <div style={{ fontSize: 11, color: "#818384", marginTop: 8 }}>342 comments · share · save · hide</div>
          <ContextCard type="correction" />
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function SubstackArticlePage() {
  return (
    <Frame url="thecityreporter.substack.com/p/budget-analysis" headerText="The City Reporter">
      <div style={{ maxWidth: 580, margin: "0 auto" }}>
        <div style={{ position: "relative" }}>
          <h1 style={{ color: C.red, fontWeight: 700, fontSize: 24, lineHeight: 1.3, fontFamily: "Georgia,serif", cursor: "help" }}>{MOCK.correction.replacement}<Tooltip type="correction" /></h1>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 14 }}>The City Reporter · April 5, 2026</div>
        <ContextCard type="correction" />
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "#333" }}>The $50 million represents the largest single investment in education in the city's history.</p>
        <Badge type="correction" />
      </div>
    </Frame>
  );
}

function SubstackNotePage() {
  return (
    <Frame url="substack.com/notes/abc123" headerBg="#fff" headerFg="#222" headerText="Substack Notes">
      <div style={{ maxWidth: 520, padding: 12, background: "#f7f7f7", borderRadius: 8, border: "1px solid #e0e0e0" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ddd" }} />
          <div><div style={{ fontWeight: 700, fontSize: 13 }}>The City Reporter</div><div style={{ fontSize: 11, color: "#999" }}>2h ago</div></div>
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ color: C.red, fontWeight: 700, fontSize: 14, lineHeight: 1.5, cursor: "help" }}>{MOCK.correction.replacement}<Tooltip type="correction" /></span>
        </div>
        <ContextCard type="correction" />
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function FacebookPage() {
  return (
    <Frame url="facebook.com/CityMayor/posts/123456" bg="#f0f2f5" headerBg="#1877f2" headerFg="#fff" headerText="facebook">
      <div style={{ background: "#fff", borderRadius: 8, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,.1)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ddd" }} />
          <div><div style={{ fontWeight: 700, fontSize: 14 }}>City Mayor</div><div style={{ fontSize: 12, color: "#65676b" }}>April 5 · {"\uD83C\uDF0E"}</div></div>
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ color: C.red, fontWeight: 700, fontSize: 14, lineHeight: 1.5, cursor: "help" }}>Proud to announce a RECORD $50M investment in our public schools! This is what real leadership looks like. #Education<Tooltip type="correction" /></span>
        </div>
        <ContextCard type="correction" />
        <div style={{ borderTop: "1px solid #e4e6eb", marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-around", fontSize: 13, color: "#65676b", fontWeight: 600 }}>
          <span>{"\uD83D\uDC4D"} Like</span><span>{"\uD83D\uDCAC"} Comment</span><span>{"\u21A9\uFE0F"} Share</span>
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function InstagramPage() {
  return (
    <Frame url="instagram.com/p/abc123" bg="#fafafa" headerBg="#fff" headerFg="#262626" headerText={<span style={{ fontFamily: "serif", fontSize: 20, fontStyle: "italic" }}>Instagram</span>}>
      <div style={{ maxWidth: 470, margin: "0 auto", background: "#fff", border: "1px solid #dbdbdb", borderRadius: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #efefef" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ddd" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>citymayor</span>
        </div>
        <div style={{ background: "#efefef", height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 32 }}>{"\uD83D\uDDBC\uFE0F"}</div>
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 20 }}>{"\u2661"} {"\uD83D\uDCAC"} {"\u2709\uFE0F"}</div>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>1,247 likes</div>
          <div style={{ position: "relative" }}>
            <span style={{ fontWeight: 600, fontSize: 13, marginRight: 4 }}>citymayor</span>
            <span style={{ color: C.red, fontWeight: 700, fontSize: 13, cursor: "help" }}>Proud to announce a RECORD $50M investment! #Education #Investing<Tooltip type="correction" /></span>
          </div>
          <ContextCard type="correction" />
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function TikTokPage() {
  return (
    <Frame url="tiktok.com/@citynews/video/1234567890" bg="#121212" fg="#fff" headerBg="#000" headerFg="#fff" headerText={<span style={{ fontWeight: 800, letterSpacing: "-.02em" }}>TikTok</span>}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ width: 280, height: 400, background: "#1a1a1a", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 48 }}>{"\u25B6"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#333" }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>@citynews</span>
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ color: C.red, fontWeight: 700, fontSize: 13, lineHeight: 1.5, cursor: "help" }}>RECORD $50M investment in public schools! But is it real? #Education #FactCheck<Tooltip type="correction" /></span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>{"\u266A"} original sound - citynews</div>
          <ContextCard type="correction" />
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function LinkedInPage() {
  return (
    <Frame url="linkedin.com/posts/citymayor-budget-abc" bg="#f3f2ef" headerBg="#0a66c2" headerFg="#fff" headerText="LinkedIn">
      <div style={{ background: "#fff", borderRadius: 8, padding: 16, boxShadow: "0 0 0 1px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#ddd" }} />
          <div><div style={{ fontWeight: 700, fontSize: 14, color: "#000" }}>City Mayor</div><div style={{ fontSize: 12, color: "#666" }}>Mayor of Example City · City Government</div><div style={{ fontSize: 11, color: "#999" }}>3d · {"\uD83C\uDF10"}</div></div>
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ color: C.red, fontWeight: 700, fontSize: 14, lineHeight: 1.6, cursor: "help" }}>Proud to announce a RECORD $50M investment in our public schools! This historic commitment demonstrates our city's dedication to education. #PublicEducation #Investment<Tooltip type="correction" /></span>
        </div>
        <ContextCard type="correction" />
        <div style={{ borderTop: "1px solid #e0e0e0", marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-around", fontSize: 12, color: "#666", fontWeight: 600 }}>
          <span>{"\uD83D\uDC4D"} Like</span><span>{"\uD83D\uDCAC"} Comment</span><span>{"\uD83D\uDD01"} Repost</span><span>{"\u2709\uFE0F"} Send</span>
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function PodcastPage() {
  return (
    <Frame url="open.spotify.com/episode/abc123" bg="#121212" fg="#fff" headerBg="#1db954" headerFg="#fff" headerText="Spotify">
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: 140, height: 140, background: "#282828", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 40, flexShrink: 0 }}>{"\uD83C\uDFA7"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#b3b3b3", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Podcast Episode</div>
          <div style={{ position: "relative" }}>
            <h2 style={{ color: C.red, fontWeight: 700, fontSize: 20, margin: "0 0 6px", cursor: "help" }}>City Claims $50M Education Record — Is It Real?<Tooltip type="correction" /></h2>
          </div>
          <div style={{ fontSize: 13, color: "#b3b3b3" }}>City News Daily · Episode 142 · Apr 5, 2026 · 34 min</div>
          <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#1db954", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#000" }}>{"\u25B6"}</div>
            <div style={{ flex: 1, height: 4, background: "#4d4d4d", borderRadius: 2 }}><div style={{ width: "35%", height: "100%", background: "#1db954", borderRadius: 2 }}/></div>
          </div>
          <ContextCard type="correction" />
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

function ProductPage() {
  return (
    <Frame url="amazon.com/dp/B0EXAMPLE" headerBg="#131921" headerFg="#fff" headerText="amazon">
      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ width: 200, height: 220, background: "#f7f7f7", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: 48, flexShrink: 0, border: "1px solid #ddd" }}>{"\uD83D\uDCE6"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ position: "relative" }}>
            <h1 style={{ color: C.red, fontWeight: 700, fontSize: 18, lineHeight: 1.4, margin: "0 0 6px", cursor: "help" }}>OrganicPure All-Natural Health Supplement — "100% Organic"<Tooltip type="correction" /></h1>
          </div>
          <div style={{ fontSize: 12, color: "#007185", marginBottom: 4 }}>{"★★★★☆"} 4.2 (1,847 ratings)</div>
          <div style={{ fontSize: 24, fontWeight: 400, color: "#0f1111", marginBottom: 4 }}>$49.99</div>
          <div style={{ fontSize: 12, color: "#565959", marginBottom: 8 }}>In Stock · FREE delivery <strong>Tomorrow</strong></div>
          <ContextCard type="correction" />
          <div style={{ marginTop: 8, padding: 8, background: "#FDF0EE", borderLeft: `3px solid ${C.red}`, fontSize: 12 }}>
            <strong style={{ color: C.red }}>Trust Assembly note:</strong> Product claims "100% Organic" but ingredient list includes synthetic fillers. See correction for details.
          </div>
        </div>
      </div>
      <Badge type="correction" />
    </Frame>
  );
}

// ── Site list for tab 2 ──
const SITES = [
  { key: "article", label: "News Article", component: ArticlePage },
  { key: "youtube", label: "YouTube", component: YouTubePage },
  { key: "twitter", label: "Twitter / X", component: TwitterPage },
  { key: "reddit", label: "Reddit", component: RedditPage },
  { key: "substack_article", label: "Substack", component: SubstackArticlePage },
  { key: "substack_note", label: "Sub. Note", component: SubstackNotePage },
  { key: "facebook", label: "Facebook", component: FacebookPage },
  { key: "instagram", label: "Instagram", component: InstagramPage },
  { key: "tiktok", label: "TikTok", component: TikTokPage },
  { key: "linkedin", label: "LinkedIn", component: LinkedInPage },
  { key: "podcast", label: "Podcast", component: PodcastPage },
  { key: "product", label: "Product", component: ProductPage },
];

// ── Elements section components ──
function TranslationOverlays() {
  const cm = { clarity: C.teal, propaganda: C.orange, euphemism: C.red, satirical: C.purple };
  return (
    <div style={{ padding: 12, background: C.vellum, borderRadius: 6 }}>
      {MOCK.translations.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
          <span style={{ borderBottom: `2px dotted ${cm[t.type]}`, cursor: "help", color: C.text }}>{t.original}<sup style={{ fontSize: 8, color: cm[t.type], fontWeight: 700 }}>{"\u1D40\u1D2C"}</sup></span>
          <span style={{ color: C.orange, fontWeight: 700 }}>{"\u2192"}</span>
          <span style={{ color: C.orange, fontWeight: 700 }}>{t.translated}</span>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", padding: "1px 5px", border: `1px solid ${cm[t.type]}`, borderRadius: 2, color: cm[t.type] }}>{t.type}</span>
        </div>
      ))}
    </div>
  );
}

function VaultEntries() {
  const sections = [
    { title: "Standing Corrections", items: MOCK.vault.corrections, field: "assertion", color: C.gold },
    { title: "Active Arguments", items: MOCK.vault.arguments, field: "content", color: C.teal },
    { title: "Foundational Beliefs", items: MOCK.vault.beliefs, field: "content", color: C.purple },
  ];
  return (
    <div style={{ padding: 12, background: C.vellum, borderRadius: 6 }}>
      {sections.map(s => (
        <div key={s.title} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: C.muted, marginBottom: 6, paddingBottom: 3, borderBottom: "1px solid #EBE8E2" }}>{s.title}</div>
          {s.items.map((v, i) => (
            <div key={i} style={{ padding: "6px 10px", borderRadius: 3, background: "#fff", border: "1px solid #EBE8E2", borderLeft: `3px solid ${s.color}`, marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{v[s.field]}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{v.org_name}{v.survival_count ? ` · Survived ${v.survival_count} challenge${v.survival_count !== 1 ? "s" : ""}` : ""}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function UnappliedBox() {
  return (
    <div style={{ margin: "8px 0 12px", fontFamily: "-apple-system,sans-serif" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px 4px 10px", background: C.vellum, border: `1px solid ${C.red}`, borderBottom: "none", borderRadius: "4px 4px 0 0", fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: C.red, marginBottom: -1, position: "relative", zIndex: 1 }}>
        <img src="/icons/Brick red lighthouse emblem.png" alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} /> Trust Assembly
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.red}`, borderRadius: "0 4px 4px 4px", background: C.vellum, padding: "10px 14px" }}>
        <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>A correction was made to this page that can no longer be matched.</div>
        <div style={{ fontSize: 14, color: C.red, fontWeight: 700, lineHeight: 1.4, marginBottom: 3 }}>{MOCK.correction.replacement}</div>
        <div style={{ fontSize: 10, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
          <img src="/icons/Brick red lighthouse emblem.png" alt="" style={{ width: 14, height: 14, borderRadius: "50%" }} />
          <strong style={{ color: C.navy }}>{MOCK.correction.orgName}</strong> · {MOCK.correction.profile.displayName} · Trust Score {MOCK.correction.trustScore}
        </div>
      </div>
    </div>
  );
}

function PopupPreview() {
  return (
    <div style={{ width: 380, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", background: C.vellum, fontFamily: "-apple-system,sans-serif" }}>
      <div style={{ background: "linear-gradient(180deg,#1a1a1a,#222)", color: C.linen, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/icons/Golden lighthouse emblem with laurel wreath.png" alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
        <div><div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".1em" }}><span style={{ fontSize: 19 }}>T</span>RUST <span style={{ fontSize: 19 }}>A</span>SSEMBLY</div><div style={{ fontSize: 8, letterSpacing: ".12em", color: C.gold, marginTop: 2 }}>TRUTH WILL OUT</div></div>
      </div>
      <div style={{ display: "flex", padding: "0 14px", borderBottom: "1px solid #eee", background: "#fff" }}>
        {["This Page", "Submit", "Assemblies"].map((t, i) => (<div key={t} style={{ padding: "9px 0", marginRight: 18, fontSize: 12, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "#1a1a1a" : "#999", borderBottom: i === 0 ? "2px solid #1a1a1a" : "2px solid transparent" }}>{t}</div>))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.linen, fontSize: 11, color: "#5A5650" }}>
        <span>Corrections on <strong style={{ color: C.navy }}>example.com</strong></span>
        <span style={{ display: "inline-block", width: 36, height: 20, borderRadius: 10, background: C.green, position: "relative" }}><span style={{ display: "block", width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 18, boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}/></span>
      </div>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: "#5A5650" }}><span style={{ fontSize: 22, fontWeight: 700, color: C.navy, display: "block" }}>3</span>1 correction · 1 affirmation · 1 translation</div>
      <div style={{ padding: "8px 12px" }}>
        <div style={{ padding: 10, marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 3, borderLeft: `4px solid ${C.green}`, background: "#fff" }}>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Correction · The General Public · Approved</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{MOCK.correction.replacement}</div>
        </div>
        <div style={{ padding: 10, border: `1px solid ${C.border}`, borderRadius: 3, borderLeft: `4px solid ${C.green}`, background: "#fff" }}>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Affirmation · Fact Checkers United · Approved</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{"\u2713"} {MOCK.affirmation.originalHeadline}</div>
        </div>
      </div>
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: C.gold }}>trustassembly.org</span>
        <span style={{ fontSize: 9, color: "#999" }}>Truth Will Out.</span>
      </div>
    </div>
  );
}

// ── Main page export ──
export default function ExtensionStudioPage() {
  const [auth, setAuth] = useState("loading");
  const [tab, setTab] = useState("elements");
  const [site, setSite] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const cookies = document.cookie.split(";").map(c => c.trim());
        const session = cookies.find(c => c.startsWith("session="));
        const token = session?.split("=")[1];
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch("/api/admin/users?limit=1", { headers, credentials: "same-origin" });
        setAuth(res.ok ? "ok" : "denied");
      } catch { setAuth("denied"); }
    })();
  }, []);

  if (auth === "loading") return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.dm }}>Loading...</div>;
  if (auth === "denied") return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>Unauthorized — admin access required</div>;

  const tabs = [
    { id: "elements", label: "Elements" },
    { id: "sites", label: "Site Previews" },
    { id: "popup", label: "Popup" },
    { id: "states", label: "All States" },
  ];

  const SiteComponent = SITES[site]?.component || ArticlePage;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 32px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <a href="/admin/system-health" style={{ fontSize: 12, color: C.gold, textDecoration: "none", marginBottom: 16, display: "inline-block" }}>{"\u2190"} Back to Dashboard</a>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: C.dt, marginBottom: 4 }}>Extension Design Studio</h1>
        <p style={{ fontSize: 14, color: C.dm, marginBottom: 24 }}>Visual preview of every browser extension element across all 12 supported site types</p>

        {/* Tab nav */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.cardBorder}` }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: ".04em",
              background: tab === t.id ? C.gold : C.card, color: tab === t.id ? "#fff" : C.dm,
            }}>{t.label}</button>
          ))}
        </div>

        {/* ═══ ELEMENTS TAB ═══ */}
        {tab === "elements" && (
          <div>
            <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}`, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 16 }}>Lighthouse Emblem States</h2>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[
                  { src: "/icons/Golden lighthouse emblem with laurel wreath.png", label: "Default / Gold", desc: "Extension icon, popup header" },
                  { src: "/icons/Brick red lighthouse emblem.png", label: "Correction / Red", desc: "Correction cards, hover" },
                  { src: "/icons/Green lighthouse with laurel wreath.png", label: "Affirmation / Green", desc: "Affirmation cards, hover" },
                  { src: "/icons/Lighthouse within laurel wreath emblem.png", label: "Pending / Gray", desc: "User pending submissions" },
                ].map(ic => (
                  <div key={ic.label} style={{ textAlign: "center", width: 120 }}>
                    <img src={ic.src} alt={ic.label} style={{ width: 72, height: 72, borderRadius: "50%", marginBottom: 8 }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.dt }}>{ic.label}</div>
                    <div style={{ fontSize: 10, color: C.dm }}>{ic.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}`, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 16 }}>Floating Badge States</h2>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {["default", "correction", "affirmation", "pending"].map(type => (
                  <div key={type} style={{ position: "relative", width: 130, height: 60 }}>
                    <Badge type={type} />
                    <div style={{ fontSize: 10, color: C.dm, position: "absolute", bottom: -18, left: 0, textTransform: "capitalize" }}>{type}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}`, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 16 }}>Trust Context Card (Expandable)</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <ContextCard type="correction" />
                <ContextCard type="affirmation" />
                <ContextCard type="pending" />
              </div>
            </div>

            <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}`, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 12 }}>Unapplied Corrections Box</h2>
              <UnappliedBox />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}` }}>
                <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 12 }}>Hover Tooltips</h2>
                <div style={{ position: "relative", paddingTop: 80 }}>
                  <div style={{ fontSize: 10, color: C.dm, marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Correction hover</div>
                  <span style={{ color: C.red, fontWeight: 700, fontSize: 15, position: "relative", display: "inline-block" }}>
                    {MOCK.correction.replacement.slice(0, 50)}...
                    <Tooltip type="correction" />
                  </span>
                </div>
                <div style={{ position: "relative", paddingTop: 60, marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: C.dm, marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Affirmation hover</div>
                  <span style={{ color: C.green, fontWeight: 700, fontSize: 15, position: "relative", display: "inline-block" }}>
                    {MOCK.affirmation.originalHeadline.slice(0, 50)}...
                    <Tooltip type="affirmation" />
                  </span>
                </div>
              </div>

              <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}` }}>
                <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 12 }}>Inline Body Edits</h2>
                <div style={{ padding: 12, background: "#fff", borderRadius: 6, fontSize: 14, lineHeight: 1.8, color: "#333" }}>
                  <span style={{ textDecoration: "line-through", textDecorationColor: C.red, color: "#8A8580", background: "#FDF0EE" }}>{MOCK.inlineEdits[0].original}</span>{" "}
                  <span style={{ color: C.red, fontWeight: 700, background: "#FDF8F7", borderBottom: `2px solid ${C.red}` }}>{MOCK.inlineEdits[0].replacement}<sup style={{ fontSize: 9, color: C.red }}>{"\u1D40\u1D2C"}</sup></span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}` }}>
                <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 12 }}>Translation Overlays (All 4 Types)</h2>
                <TranslationOverlays />
              </div>
              <div style={{ background: C.card, borderRadius: 8, padding: 24, border: `1px solid ${C.cardBorder}` }}>
                <h2 style={{ fontSize: 16, color: C.dt, marginBottom: 12 }}>Vault Entries (All 3 Types)</h2>
                <VaultEntries />
              </div>
            </div>
          </div>
        )}

        {/* ═══ SITE PREVIEWS TAB ═══ */}
        {tab === "sites" && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 0, marginBottom: 16, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.cardBorder}` }}>
              {SITES.map((s, i) => (
                <button key={s.key} onClick={() => setSite(i)} style={{
                  flex: "1 1 auto", padding: "8px 6px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600,
                  background: site === i ? C.navy : C.card, color: site === i ? "#fff" : C.dm, minWidth: 80,
                }}>{s.label}</button>
              ))}
            </div>
            <SiteComponent />
          </div>
        )}

        {/* ═══ POPUP TAB ═══ */}
        {tab === "popup" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <PopupPreview />
          </div>
        )}

        {/* ═══ ALL STATES TAB ═══ */}
        {tab === "states" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {["correction", "affirmation", "pending"].map(type => (
              <div key={type} style={{ background: C.card, borderRadius: 8, padding: 20, border: `1px solid ${C.cardBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: C.gold, marginBottom: 8 }}>{type}</div>
                <ContextCard type={type} />
              </div>
            ))}
            <div style={{ background: C.card, borderRadius: 8, padding: 20, border: `1px solid ${C.cardBorder}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: C.gold, marginBottom: 8 }}>Unapplied</div>
              <UnappliedBox />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
