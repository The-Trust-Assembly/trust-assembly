import { useState } from "react";

const C = {
  navy: "#1B2A4A",
  gold: "#92742E",
  goldLight: "#B8963E",
  linen: "#F0EDE6",
  vellum: "#FDFBF5",
  corrText: "#8B2D2D",
  corrBg: "#150A0A",
  corrBorder: "#3D1F1F",
  affText: "#1B5E3F",
  affBg: "#0A150E",
  affBorder: "#1F3D28",
  consText: "#7A6222",
  consBg: "#15120A",
  consBorder: "#3D351F",
};

// Platform-native typefaces — the card text should feel like it belongs
const PLATFORM_FONT = {
  twitter: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  reddit: 'IBMPlexSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  youtube: '"Roboto", Arial, sans-serif',
  facebook: 'Helvetica, Arial, sans-serif',
  article: 'Georgia, "Times New Roman", serif',
};

// TA brand font — only used for the wordmark and metadata labels
const TA_MONO = "'IBM Plex Mono', 'SF Mono', 'Consolas', monospace";

const Lighthouse = ({ size = 14, color = C.goldLight, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...style }}>
    <path d="M12 2L14 8H10L12 2Z" fill={color} opacity="0.9"/>
    <rect x="10" y="8" width="4" height="10" rx="0.5" fill={color} opacity="0.8"/>
    <path d="M7 18H17L18 22H6L7 18Z" fill={color} opacity="0.7"/>
    <circle cx="12" cy="4" r="2.5" fill="none" stroke={color} strokeWidth="0.8" opacity="0.4"/>
    <circle cx="12" cy="4" r="4.5" fill="none" stroke={color} strokeWidth="0.5" opacity="0.2"/>
    <line x1="6" y1="5" x2="8.5" y2="5" stroke={color} strokeWidth="0.6" opacity="0.35"/>
    <line x1="15.5" y1="5" x2="18" y2="5" stroke={color} strokeWidth="0.6" opacity="0.35"/>
  </svg>
);

// ═══════════════════════════════════════
// THE CORRECTION CARD
// Lives between posts in the feed.
// Three sizes: compact (just the verdict),
// standard (verdict + reasoning),
// expanded (full evidence)
// ═══════════════════════════════════════

const CorrectionCard = ({
  type = "correction", // correction | affirmation
  status = "approved", // approved | consensus
  replacement,
  reasoning,
  evidence = [],
  orgName = "The General Public",
  votes = "7/9",
  trustScore = 87,
  compact = false,
  platform = "twitter", // twitter | reddit
}) => {
  const [expanded, setExpanded] = useState(false);

  const isAff = type === "affirmation";
  const isCons = status === "consensus";

  const accent = isCons ? C.consText : isAff ? C.affText : C.corrText;
  const accentLight = isCons ? "#D4B45E" : isAff ? "#6EBF8B" : "#D4766E";
  const bg = isCons ? C.consBg : isAff ? C.affBg : C.corrBg;
  const border = isCons ? C.consBorder : isAff ? C.affBorder : C.corrBorder;
  const label = isCons ? "Cross-Group Consensus" : isAff ? "Affirmed" : "Corrected";
  const icon = isCons ? "✦" : isAff ? "✓" : "⚑";
  const font = PLATFORM_FONT[platform] || PLATFORM_FONT.twitter;

  // Connecting line visual — makes it clear this card relates to the post above
  const connector = (
    <div style={{
      width: 2, height: 10, backgroundColor: accentLight + "30",
      margin: "0 auto",
    }} />
  );

  return (
    <div>
      {connector}
      <div style={{
        margin: platform === "twitter" ? "0 16px 0 68px" : "0 12px 0 52px",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "all 0.2s ease",
      }}>
        {/* Header bar — TA brand font for wordmark, platform font for metadata */}
        <div style={{
          padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 6,
          borderBottom: expanded ? `1px solid ${border}` : "none",
        }}>
          <Lighthouse size={13} color={C.goldLight} />
          <span style={{
            fontFamily: TA_MONO, fontSize: 10, fontWeight: 600,
            color: C.goldLight, letterSpacing: "0.04em",
          }}>
            TRUST ASSEMBLY
          </span>

          <span style={{
            fontFamily: font, fontSize: 9.5, fontWeight: 700,
            color: accentLight,
            backgroundColor: accentLight + "18",
            padding: "2px 7px", borderRadius: 10,
          }}>
            {icon} {label.toUpperCase()}
          </span>

          <span style={{ flex: 1 }} />

          <span style={{
            fontFamily: font, fontSize: 10, color: "#71767B",
          }}>
            {votes}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "8px 12px 10px" }}>
          {/* The correction/affirmation statement */}
          {replacement && !isAff && (
            <div style={{
              fontFamily: font,
              fontSize: 14, lineHeight: 1.5,
              color: accentLight,
              marginBottom: expanded ? 8 : 0,
            }}>
              {replacement}
            </div>
          )}

          {isAff && (
            <div style={{
              fontFamily: font,
              fontSize: 13, lineHeight: 1.5,
              color: accentLight,
              marginBottom: expanded ? 8 : 0,
            }}>
              This post has been reviewed and found to be accurate by community jury.
            </div>
          )}

          {/* Expanded detail */}
          {expanded && (
            <div style={{ animation: "ta-fadeIn 0.15s ease" }}>
              {reasoning && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    fontFamily: TA_MONO, fontSize: 9, color: "#71767B",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3,
                  }}>
                    Reasoning
                  </div>
                  <div style={{ fontFamily: font, fontSize: 13, color: "#B8BBBE", lineHeight: 1.55 }}>
                    {reasoning}
                  </div>
                </div>
              )}

              {evidence.length > 0 && (
                <div style={{
                  padding: "6px 8px", backgroundColor: "rgba(0,0,0,0.25)",
                  borderRadius: 6, marginBottom: 8,
                }}>
                  <div style={{
                    fontFamily: TA_MONO, fontSize: 9, color: "#71767B",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3,
                  }}>
                    Evidence
                  </div>
                  {evidence.map((e, i) => (
                    <div key={i} style={{ marginTop: i > 0 ? 3 : 0 }}>
                      <a href="#" onClick={ev => ev.preventDefault()} style={{
                        fontFamily: TA_MONO, fontSize: 11, color: "#58A6FF",
                        textDecoration: "none",
                      }}>
                        {e.url}
                      </a>
                      {e.note && (
                        <div style={{ fontFamily: font, fontSize: 11, color: "#71767B", marginTop: 1 }}>
                          {e.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: font, fontSize: 10, color: "#71767B",
              }}>
                <span>{orgName}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>Score {trustScore}</span>
                <span style={{ flex: 1 }} />
                <a href="#" onClick={e => e.preventDefault()} style={{
                  color: "#58A6FF", textDecoration: "none", fontSize: 10,
                }}>
                  Full record →
                </a>
              </div>
            </div>
          )}

          {/* Expand/collapse toggle */}
          <div
            onClick={() => setExpanded(!expanded)}
            style={{
              fontFamily: font, fontSize: 11,
              color: accentLight, opacity: 0.7,
              cursor: "pointer", marginTop: 6,
              display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "1"}
            onMouseLeave={e => e.currentTarget.style.opacity = "0.7"}
          >
            {expanded ? "▾ Less" : "▸ Why"}
          </div>
        </div>
      </div>
      {connector}
    </div>
  );
};


// ═══════════════════════════════════════
// TWEETS — completely untouched
// ═══════════════════════════════════════

const Tweet = ({ name, handle, time, verified, text, replies, retweets, likes, views, avatarColor, image, children }) => (
  <div style={{
    padding: "12px 16px",
    borderBottom: children ? "none" : "1px solid #2F3336",
  }}>
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: avatarColor || "#333", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#E7E9EA" }}>{name}</span>
          {verified && (
            <svg width="18" height="18" viewBox="0 0 22 22"><path d="M20.4 11l-2.2-2.5.3-3.3-3.2-.7L13.1 1.5 11 2.5 8.9 1.5 6.7 4.5l-3.2.7.3 3.3L1.6 11l2.2 2.5-.3 3.3 3.2.7 2.2 3 2.1-1 2.1 1 2.2-3 3.2-.7-.3-3.3z" fill="#1D9BF0"/><path d="M9.5 14.2L6.8 11.5l1.4-1.4 1.3 1.3 3.3-3.3 1.4 1.4z" fill="#fff"/></svg>
          )}
          <span style={{ color: "#71767B", fontSize: 15 }}>{handle} · {time}</span>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.42, color: "#E7E9EA" }}>
          {text}
        </div>
        {image && (
          <div style={{
            marginTop: 10, borderRadius: 16, overflow: "hidden",
            border: "1px solid #2F3336", height: 180, backgroundColor: "#1a1a1a",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#555", fontSize: 13, fontFamily: "monospace",
          }}>
            {image}
          </div>
        )}
        <div style={{ display: "flex", gap: 20, color: "#71767B", fontSize: 13, padding: "8px 0 4px" }}>
          <span>💬 {replies}</span>
          <span>🔁 {retweets}</span>
          <span>❤️ {likes}</span>
          <span>📊 {views}</span>
        </div>
      </div>
    </div>
    {children}
  </div>
);


// ═══════════════════════════════════════
// REDDIT POSTS — completely untouched
// ═══════════════════════════════════════

const RedditPost = ({ subreddit, user, time, title, body, votes, comments, thumbnail, children }) => (
  <div style={{
    backgroundColor: "#1A1A1B",
    border: "1px solid #343536",
    borderRadius: 4,
    marginBottom: children ? 0 : 10,
  }}>
    <div style={{ display: "flex" }}>
      <div style={{
        width: 40, padding: "8px 0",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        backgroundColor: "#161617", borderRadius: "4px 0 0 4px",
      }}>
        <span style={{ fontSize: 16, color: "#818384", cursor: "pointer" }}>▲</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#D7DADC" }}>{votes}</span>
        <span style={{ fontSize: 16, color: "#818384", cursor: "pointer" }}>▼</span>
      </div>
      <div style={{ flex: 1, padding: "8px 12px" }}>
        <div style={{ fontSize: 12, color: "#818384", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: "#D7DADC" }}>r/{subreddit}</span>
          {" · u/"}{user}{" · "}{time}
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 500, margin: "4px 0 6px", lineHeight: 1.3, color: "#D7DADC" }}>
          {title}
        </h3>
        {body && (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#B8BBBE", marginBottom: 8 }}>
            {body}
          </div>
        )}
        {thumbnail && (
          <div style={{
            height: 140, borderRadius: 6, backgroundColor: "#2a2a2a",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#555", fontSize: 12, fontFamily: "monospace", marginBottom: 8,
            border: "1px solid #343536",
          }}>
            {thumbnail}
          </div>
        )}
        <div style={{ display: "flex", gap: 16, color: "#818384", fontSize: 12, fontWeight: 700, padding: "4px 0" }}>
          <span>💬 {comments} Comments</span>
          <span>🔗 Share</span>
          <span>⭐ Save</span>
        </div>
      </div>
    </div>
    {children}
  </div>
);


// ═══════════════════════════════════════
// FEEDS
// ═══════════════════════════════════════

const TwitterFeed = () => (
  <div style={{
    maxWidth: 598, margin: "0 auto",
    backgroundColor: "#000", color: "#E7E9EA",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    border: "1px solid #2F3336",
  }}>
    <div style={{
      display: "flex", borderBottom: "1px solid #2F3336",
      position: "sticky", top: 0, backgroundColor: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(12px)", zIndex: 10,
    }}>
      <div style={{ flex: 1, textAlign: "center", padding: "14px 0", fontWeight: 700, fontSize: 15, borderBottom: "2px solid #1D9BF0" }}>For you</div>
      <div style={{ flex: 1, textAlign: "center", padding: "14px 0", fontWeight: 500, fontSize: 15, color: "#71767B" }}>Following</div>
    </div>

    {/* Normal tweet — no correction */}
    <Tweet
      name="Sarah J." handle="@sarahj_writes" time="45m"
      text="Just finished reading the most incredible book. Highly recommend 'The Midnight Library' by Matt Haig. Changed my perspective on everything. 📚"
      replies="12" retweets="89" likes="1.2K" views="34K"
      avatarColor="#2D5A3D"
    />

    {/* Corrected tweet — original is UNTOUCHED */}
    <div style={{ borderBottom: "1px solid #2F3336" }}>
      <Tweet
        name="National News" handle="@nationalnews" time="2h" verified={true}
        text="BREAKING: New FDA-approved drug shows miraculous results, effectively curing cancer in most patients with no significant side effects. Available nationwide next month."
        replies="2.4K" retweets="18.7K" likes="42.1K" views="8.2M"
        avatarColor="#1D3557"
      >
        {/* INJECTED CARD — lives right after the tweet, before the border */}
        <CorrectionCard
          type="correction"
          status="consensus"
          replacement="FDA approved a targeted therapy showing 23% tumor reduction in Phase III trial for HER2-negative metastatic breast cancer. The drug carries a black box warning for cardiac events. 'Miraculous' appears in no medical literature."
          reasoning="The word 'miraculous' does not appear in any FDA documentation or published trial results. The drug is approved for one specific cancer subtype, not general cancer treatment. 'No significant side effects' is contradicted by the FDA-required black box warning for cardiac events in patients over 65. 'Available nationwide next month' misrepresents the insurance authorization process."
          evidence={[
            { url: "fda.gov/drugs/approvals/BLA-2026-0847", note: "FDA approval letter — no superlative language" },
            { url: "nejm.org/doi/10.1056/NEJMoa2603891", note: "Phase III trial: 23% improvement, 3.2-month PFS gain" },
          ]}
          orgName="Medical Accuracy Assembly"
          votes="11/13"
          trustScore={94}
          platform="twitter"
        />
      </Tweet>
    </div>

    {/* Normal tweet */}
    <Tweet
      name="Alex Rivera" handle="@arivera_dev" time="3h"
      text="Hot take: most 'AI breakthroughs' are just better data pipelines with a transformer on top. The real innovation is in data curation, not model architecture."
      replies="847" retweets="3.2K" likes="12.4K" views="890K"
      avatarColor="#4A2D5A"
    />

    {/* Corrected tweet — weather misinformation */}
    <div style={{ borderBottom: "1px solid #2F3336" }}>
      <Tweet
        name="PNW Weather" handle="@pnw_weather" time="4h" verified={true}
        text="⚠️ SEVERE: Category 3 hurricane making landfall in Washington state tonight. Evacuate immediately if you're in the coastal zone."
        replies="5.6K" retweets="24.1K" likes="8.9K" views="12.1M"
        avatarColor="#2D4A5A"
      >
        <CorrectionCard
          type="correction"
          status="approved"
          replacement="Strong atmospheric river system bringing heavy rain and 60mph wind gusts to Washington coast tonight. Flood watches issued for coastal counties. The Pacific Northwest does not experience hurricanes — this is a factually incorrect characterization of the weather event."
          reasoning="Washington state does not experience hurricanes. The Pacific Ocean off the Northwest coast does not produce tropical cyclone conditions. The actual weather event is an atmospheric river with strong winds — serious but fundamentally different from a hurricane. 'Evacuate immediately' based on a false hurricane claim could cause dangerous panic."
          evidence={[
            { url: "weather.gov/sew/", note: "NWS Seattle — actual forecast, no hurricane warning" },
          ]}
          orgName="The General Public"
          votes="9/9"
          trustScore={82}
          platform="twitter"
        />
      </Tweet>
    </div>

    {/* Normal tweet */}
    <Tweet
      name="cooking with joy" handle="@joyful_kitchen" time="5h"
      text="Made the most perfect sourdough today. 72-hour cold ferment, 80% hydration, baked in a Dutch oven. The crumb is insane. 🍞"
      replies="67" retweets="234" likes="2.8K" views="45K"
      avatarColor="#5A4A2D"
    />

    {/* Affirmed tweet */}
    <div style={{ borderBottom: "1px solid #2F3336" }}>
      <Tweet
        name="AP Science" handle="@APScience" time="6h" verified={true}
        text="Study published in Nature finds microplastic concentrations in deep ocean sediment have increased 12-fold since 1990, with highest concentrations near industrial shipping lanes."
        replies="1.2K" retweets="8.9K" likes="24.3K" views="4.7M"
        avatarColor="#2D3D5A"
      >
        <CorrectionCard
          type="affirmation"
          status="approved"
          orgName="Science Watch Assembly"
          votes="7/7"
          trustScore={96}
          reasoning="All claims in this post are directly sourced from the peer-reviewed Nature publication. The 12-fold figure, 1990 baseline, and shipping lane correlation are all present in the study abstract and methodology section."
          evidence={[
            { url: "nature.com/articles/s41586-026-08291-2", note: "Original study" },
          ]}
          platform="twitter"
        />
      </Tweet>
    </div>

    {/* Normal tweet */}
    <Tweet
      name="Marcus Chen" handle="@mchen_photos" time="7h"
      text="The sunrise over Mt. Rainier this morning was unreal. Sometimes living in the PNW makes up for the nine months of rain. 🏔️"
      replies="234" retweets="1.1K" likes="8.7K" views="120K"
      avatarColor="#3D5A2D"
      image="[Photo: Mt. Rainier at sunrise]"
    />
  </div>
);

const RedditFeed = () => (
  <div style={{
    maxWidth: 640, margin: "0 auto",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#D7DADC",
  }}>
    {/* Normal post */}
    <RedditPost
      subreddit="programming" user="rustacean42" time="1h"
      title="We rewrote our entire backend from Python to Rust and reduced our AWS bill by 80%"
      votes="12.4k" comments="1,234"
    />

    {/* Corrected post with card */}
    <div style={{ marginBottom: 10 }}>
      <RedditPost
        subreddit="technology" user="tech_observer" time="2h"
        title="Google announces it will shut down Gmail by end of 2026, migrating all users to new AI-powered messaging platform"
        votes="34.2k" comments="2,847"
        thumbnail="[Article preview: Google logo with 'Gmail Shutdown?' headline]"
      >
        <CorrectionCard
          type="correction"
          status="approved"
          replacement="Google announced a redesigned Gmail interface with expanded AI features rolling out through 2026. Gmail is not shutting down. The original headline misreads a press release about 'transitioning the Gmail experience' — which refers to the UI, not the service."
          reasoning="Google's official announcement describes a phased UI update, not a shutdown. The words 'shut down,' 'discontinue,' and 'migrate' do not appear in the press release. Current Gmail accounts are explicitly described as 'unaffected' in the FAQ section of the announcement."
          evidence={[
            { url: "blog.google/products/gmail/2026-update", note: "Official Google blog post" },
          ]}
          orgName="Tech Accuracy Assembly"
          votes="9/9"
          trustScore={91}
          platform="reddit"
        />
      </RedditPost>
    </div>

    {/* Normal post */}
    <RedditPost
      subreddit="cooking" user="sourdough_dad" time="3h"
      title="After 2 years of trying, I finally got the open crumb I've been chasing"
      votes="8.9k" comments="342"
      thumbnail="[Photo: sourdough cross-section]"
    />

    {/* Corrected post */}
    <div style={{ marginBottom: 10 }}>
      <RedditPost
        subreddit="science" user="healthnews_bot" time="3h"
        title="New FDA-approved drug shows miraculous results, effectively curing cancer in most patients"
        votes="24.3k" comments="1,847"
      >
        <CorrectionCard
          type="correction"
          status="consensus"
          replacement="FDA approved a new targeted therapy showing 23% tumor reduction in Phase III trial for HER2-negative metastatic breast cancer. Not a general cancer cure. Drug carries black box cardiac warning."
          reasoning="The drug is approved for one specific cancer subtype. 'Miraculous' appears in no FDA documentation. The drug carries a black box warning for cardiac events in patients over 65."
          evidence={[
            { url: "fda.gov/drugs/approvals/BLA-2026-0847" },
            { url: "nejm.org/doi/10.1056/NEJMoa2603891" },
          ]}
          orgName="Medical Accuracy Assembly"
          votes="11/13"
          trustScore={94}
          platform="reddit"
        />
      </RedditPost>
    </div>

    {/* Affirmed post */}
    <div style={{ marginBottom: 10 }}>
      <RedditPost
        subreddit="worldnews" user="global_dispatch" time="4h"
        title="Study: Ocean microplastic concentrations have increased 12-fold since 1990"
        votes="18.7k" comments="923"
      >
        <CorrectionCard
          type="affirmation"
          status="approved"
          orgName="Science Watch Assembly"
          votes="7/7"
          trustScore={96}
          reasoning="Title accurately represents the peer-reviewed findings published in Nature."
          evidence={[{ url: "nature.com/articles/s41586-026-08291-2" }]}
          platform="reddit"
        />
      </RedditPost>
    </div>

    {/* Normal post */}
    <RedditPost
      subreddit="politics" user="capitol_watcher" time="5h"
      title="Congress passes $2 trillion spending bill with broad bipartisan support in historic vote"
      votes="45.1k" comments="6,234"
    />

    {/* Normal post */}
    <RedditPost
      subreddit="gaming" user="pcmr_news" time="6h"
      title="Valve announces Half-Life 3 release date: November 2026"
      votes="89.2k" comments="12,847"
    />
  </div>
);


// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

export default function InjectedCards() {
  const [platform, setPlatform] = useState("twitter");

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: platform === "twitter" ? "#000" : "#030303",
      transition: "background-color 0.3s",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap');
        @keyframes ta-fadeIn {
          from { opacity: 0; transform: translateY(-3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{
        backgroundColor: C.navy, padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        <Lighthouse size={20} color={C.goldLight} />
        <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 18, fontWeight: 600, color: C.linen }}>
          Trust Assembly
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 9.5, color: C.goldLight, opacity: 0.5, letterSpacing: "0.06em", textTransform: "uppercase", marginLeft: 6 }}>
          Injected Cards · In-Feed Corrections
        </span>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 4,
        padding: "12px 16px", backgroundColor: "#111", borderBottom: "1px solid #333",
      }}>
        {[
          { key: "twitter", label: "Twitter / X" },
          { key: "reddit", label: "Reddit" },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => setPlatform(p.key)}
            style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              fontWeight: platform === p.key ? 600 : 400,
              color: platform === p.key ? C.goldLight : "#666",
              backgroundColor: platform === p.key ? C.goldLight + "15" : "transparent",
              border: `1px solid ${platform === p.key ? C.goldLight + "30" : "transparent"}`,
              borderRadius: 4, padding: "5px 14px", cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Instruction */}
      <div style={{
        textAlign: "center", padding: "10px 16px",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#555",
      }}>
        Scroll the feed · Click <span style={{ color: C.goldLight }}>▸ Why</span> on any correction card to expand
      </div>

      {/* Feed */}
      <div style={{ padding: "0 0 40px" }}>
        {platform === "twitter" && <TwitterFeed />}
        {platform === "reddit" && <RedditFeed />}
      </div>

      {/* Design notes */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px 60px" }}>
        <div style={{
          padding: "20px 24px", backgroundColor: C.vellum,
          borderRadius: 8, border: `1px solid ${C.linen}`,
        }}>
          <div style={{
            fontFamily: "monospace", fontSize: 10, fontWeight: 600, color: C.navy,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
          }}>
            Design Principles — Injected Cards
          </div>
          <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13.5, lineHeight: 1.75, color: "#555" }}>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>The original post is never touched.</strong>{" "}
              The tweet or Reddit post renders exactly as the platform intended. No text replacement,
              no color changes, no modifications. The correction card is a new DOM element injected
              as a sibling after the post container. The post's click handlers, links, embeds,
              and metrics all work normally.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>The card speaks each platform's language.</strong>{" "}
              Body text in the correction card uses the platform's own typeface — Twitter's system
              font stack on Twitter, Roboto on YouTube, Helvetica on Facebook. The only elements
              that stay in Trust Assembly's monospace are the "TRUST ASSEMBLY" wordmark, section
              labels like "Reasoning" and "Evidence," and evidence URLs. Everything the user reads
              as content matches what surrounds it. The card feels native; the brand mark feels intentional.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>The card is visually connected but distinct.</strong>{" "}
              A thin connector line ties the card to the post above it. The card has its own
              background color (a very dark tint of the correction/affirmation color) that separates
              it from both the post and the feed background. It reads as "attached context" — the same
              relationship as Community Notes, but with Trust Assembly's identity.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>Compact by default, expandable on demand.</strong>{" "}
              The card shows the corrected statement and a "▸ Why" toggle. One click reveals
              reasoning, evidence, and provenance. Most scrollers will register the correction
              without stopping. Curious users can dig in.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>Social media gets cards. Articles get colored headlines.</strong>{" "}
              Two different interfaces for two different reading patterns. On an article page,
              you're reading one piece of content — the headline replacement is the right move.
              In a feed, you're scanning dozens of posts — an injected card between posts
              communicates "this post has been reviewed" without altering what someone said.
            </div>
            <div>
              <strong style={{ color: C.navy }}>Affirmation cards are subtle and green.</strong>{" "}
              A verified-accurate post gets a small green card confirming accuracy. This is quieter
              than a correction card — it doesn't need to shout. But over time, users will learn that
              a green Trust Assembly card means "a jury confirmed this is accurate," which builds
              trust in reliable sources.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
