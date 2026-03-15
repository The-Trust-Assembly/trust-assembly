import { useState } from "react";

const C = {
  navy: "#1B2A4A",
  gold: "#92742E",
  goldLight: "#B8963E",
  linen: "#F0EDE6",
  vellum: "#FDFBF5",
  corrText: "#8B2D2D",
  corrBg: "#FDF6F6",
  corrBorder: "#E8CCCC",
  affText: "#1B5E3F",
  affBg: "#F3FBF7",
  affBorder: "#BCD9CA",
  consText: "#7A6222",
  consBg: "#FDFBF2",
  consBorder: "#E0D4A8",
};

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
// TWITTER / X DESIGN
// ═══════════════════════════════════════
// Strategy: Attach below the tweet like Community Notes does,
// but with Trust Assembly's color language. Users already
// understand this pattern from Community Notes.

const TwitterCorrection = ({ expanded: startExpanded = false }) => {
  const [expanded, setExpanded] = useState(startExpanded);

  return (
    <div style={{ maxWidth: 598, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Tweet */}
      <div style={{
        backgroundColor: "#000",
        border: "1px solid #2F3336",
        borderRadius: 16,
        padding: "12px 16px",
        color: "#E7E9EA",
      }}>
        {/* Tweet header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#333", flexShrink: 0 }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>National News</span>
              <svg width="18" height="18" viewBox="0 0 22 22"><path d="M20.4 11l-2.2-2.5.3-3.3-3.2-.7L13.1 1.5 11 2.5 8.9 1.5 6.7 4.5l-3.2.7.3 3.3L1.6 11l2.2 2.5-.3 3.3 3.2.7 2.2 3 2.1-1 2.1 1 2.2-3 3.2-.7-.3-3.3z" fill="#1D9BF0"/><path d="M9.5 14.2L6.8 11.5l1.4-1.4 1.3 1.3 3.3-3.3 1.4 1.4z" fill="#fff"/></svg>
              <span style={{ color: "#71767B", fontSize: 15 }}>@nationalnews · 2h</span>
            </div>
          </div>
        </div>

        {/* Tweet text */}
        <div style={{ fontSize: 15, lineHeight: 1.4, marginBottom: 12 }}>
          BREAKING: New FDA-approved drug shows miraculous results, effectively curing cancer in most patients with no significant side effects. Available nationwide next month.
        </div>

        {/* Tweet metrics */}
        <div style={{ display: "flex", gap: 24, color: "#71767B", fontSize: 13, padding: "8px 0", borderTop: "1px solid #2F3336" }}>
          <span>💬 2.4K</span>
          <span>🔁 18.7K</span>
          <span>❤️ 42.1K</span>
          <span>📊 8.2M</span>
        </div>

        {/* ── TRUST ASSEMBLY CORRECTION ── */}
        {/* Sits below the tweet, visually separated but attached */}
        <div style={{
          marginTop: 4,
          padding: "12px 14px",
          backgroundColor: "#0D1117",
          borderRadius: 12,
          border: `1px solid ${C.corrText}44`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          }}>
            <Lighthouse size={14} color={C.goldLight} />
            <span style={{
              fontFamily: "'SF Mono', 'Consolas', monospace",
              fontSize: 11, fontWeight: 600, color: C.goldLight,
              letterSpacing: "0.04em",
            }}>
              TRUST ASSEMBLY
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: "#D4766E",
              backgroundColor: "#D4766E18",
              padding: "1px 6px", borderRadius: 10,
              fontFamily: "monospace",
            }}>
              CORRECTED
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#71767B" }}>
              11/13 jurors · Consensus
            </span>
          </div>

          {/* The correction itself */}
          <div style={{
            fontSize: 14, lineHeight: 1.5, color: "#D4766E",
            marginBottom: expanded ? 10 : 0,
          }}>
            The drug showed a 23% tumor reduction improvement in one cancer subtype — statistically significant but not a cure. It carries a black box warning for cardiac events. "Miraculous" appears in no FDA documentation.
          </div>

          {expanded && (
            <div style={{ animation: "ta-fadeIn 0.15s ease" }}>
              <div style={{
                padding: "8px 10px", backgroundColor: "#161B22",
                borderRadius: 8, marginBottom: 8,
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#71767B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  Evidence
                </div>
                <div style={{ fontSize: 13, color: "#8B949E", lineHeight: 1.45 }}>
                  <div style={{ marginBottom: 4 }}>
                    <a href="#" onClick={e => e.preventDefault()} style={{ color: "#58A6FF", textDecoration: "none", fontSize: 12, fontFamily: "monospace" }}>
                      fda.gov/drugs/approvals/BLA-2026-0847
                    </a>
                    <div style={{ fontSize: 12, color: "#71767B" }}>FDA approval letter — no superlative language</div>
                  </div>
                  <div>
                    <a href="#" onClick={e => e.preventDefault()} style={{ color: "#58A6FF", textDecoration: "none", fontSize: 12, fontFamily: "monospace" }}>
                      nejm.org/doi/10.1056/NEJMoa2603891
                    </a>
                    <div style={{ fontSize: 12, color: "#71767B" }}>Phase III trial: 23% improvement, 3.2-month PFS gain</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#71767B" }}>Medical Accuracy Assembly</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#71767B", opacity: 0.4 }}>·</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#71767B" }}>Trust Score 94</span>
                <span style={{ flex: 1 }} />
                <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 10, color: "#58A6FF", textDecoration: "none" }}>
                  Full record →
                </a>
              </div>
            </div>
          )}

          {!expanded && (
            <div
              onClick={() => setExpanded(true)}
              style={{
                fontFamily: "monospace", fontSize: 11, color: "#58A6FF",
                cursor: "pointer", marginTop: 6,
              }}
            >
              Show evidence and details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// REDDIT DESIGN
// ═══════════════════════════════════════
// Strategy: Inline banner between post title and content,
// styled to feel like a mod note or flair system.
// Reddit users already understand inline meta-information.

const RedditCorrection = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ maxWidth: 640, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Reddit post card */}
      <div style={{
        backgroundColor: "#1A1A1B",
        border: "1px solid #343536",
        borderRadius: 4,
        color: "#D7DADC",
      }}>
        {/* Vote column + content */}
        <div style={{ display: "flex" }}>
          {/* Vote column */}
          <div style={{
            width: 40, padding: "8px 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            backgroundColor: "#161617", borderRadius: "4px 0 0 4px",
          }}>
            <span style={{ fontSize: 18, color: "#818384", cursor: "pointer" }}>▲</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#D7DADC" }}>24.3k</span>
            <span style={{ fontSize: 18, color: "#818384", cursor: "pointer" }}>▼</span>
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: "8px 12px" }}>
            {/* Subreddit + meta */}
            <div style={{ fontSize: 12, color: "#818384", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#D7DADC" }}>r/science</span>
              {" · Posted by u/healthnews_bot · 3h · "} 
              <span style={{
                backgroundColor: "#FF4500",
                color: "#fff",
                padding: "1px 6px",
                borderRadius: 2,
                fontSize: 10,
                fontWeight: 700,
              }}>
                Misleading Title
              </span>
            </div>

            {/* Post title */}
            <h3 style={{
              fontSize: 18, fontWeight: 500, margin: "4px 0 8px",
              lineHeight: 1.3, color: "#D7DADC",
            }}>
              New FDA-approved drug shows miraculous results, effectively curing cancer in most patients
            </h3>

            {/* ── TRUST ASSEMBLY BANNER ── */}
            <div style={{
              margin: "8px 0 12px",
              padding: "10px 12px",
              backgroundColor: C.corrText + "15",
              border: `1px solid ${C.corrText}35`,
              borderRadius: 4,
              borderLeft: `3px solid ${C.corrText}`,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
              }}>
                <Lighthouse size={13} color={C.goldLight} />
                <span style={{
                  fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                  color: C.goldLight, letterSpacing: "0.04em",
                }}>
                  TRUST ASSEMBLY
                </span>
                <span style={{
                  fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                  color: "#D4766E", backgroundColor: "#D4766E18",
                  padding: "1px 6px", borderRadius: 2,
                }}>
                  CORRECTED
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#818384" }}>
                  ✦ Consensus · 11/13
                </span>
              </div>

              <div style={{
                fontSize: 13, lineHeight: 1.5, color: "#D4766E",
              }}>
                <strong style={{ color: "#E8A09A" }}>Corrected headline:</strong>{" "}
                FDA Approves New Drug Showing Statistically Significant Tumor Reduction in Phase III Trial
              </div>

              {!expanded && (
                <div
                  onClick={() => setExpanded(true)}
                  style={{
                    fontFamily: "monospace", fontSize: 11,
                    color: "#4FBCFF", cursor: "pointer", marginTop: 6,
                  }}
                >
                  ▸ Show reasoning and evidence
                </div>
              )}

              {expanded && (
                <div style={{ marginTop: 8, animation: "ta-fadeIn 0.15s ease" }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: "#B8BBBE", marginBottom: 8 }}>
                    The word "miraculous" appears in no FDA documentation. The drug showed a 23% improvement in tumor reduction for one cancer subtype — statistically significant but not a cure. It carries a black box warning for cardiac events in patients over 65.
                  </div>
                  <div style={{
                    padding: "6px 8px", backgroundColor: "#0D1117",
                    borderRadius: 4, marginBottom: 6,
                  }}>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#818384", marginBottom: 4, textTransform: "uppercase" }}>Evidence</div>
                    <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 11, color: "#4FBCFF", textDecoration: "none", display: "block" }}>
                      fda.gov/drugs/approvals/BLA-2026-0847
                    </a>
                    <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 11, color: "#4FBCFF", textDecoration: "none", display: "block", marginTop: 2 }}>
                      nejm.org/doi/10.1056/NEJMoa2603891
                    </a>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#818384" }}>Medical Accuracy Assembly · Score 94</span>
                    <span style={{ flex: 1 }} />
                    <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 10, color: "#4FBCFF", textDecoration: "none" }}>
                      Full record →
                    </a>
                  </div>
                  <div
                    onClick={() => setExpanded(false)}
                    style={{ fontFamily: "monospace", fontSize: 11, color: "#4FBCFF", cursor: "pointer", marginTop: 6 }}
                  >
                    ▾ Collapse
                  </div>
                </div>
              )}
            </div>

            {/* Post actions */}
            <div style={{ display: "flex", gap: 16, color: "#818384", fontSize: 12, fontWeight: 700, padding: "4px 0" }}>
              <span>💬 1,847 Comments</span>
              <span>🔗 Share</span>
              <span>⭐ Save</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// YOUTUBE DESIGN
// ═══════════════════════════════════════
// Strategy: Below the video title, styled like YouTube's
// existing info cards / description expander. Users already
// click "...more" to expand — same pattern.

const YouTubeCorrection = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ maxWidth: 640, fontFamily: "Roboto, Arial, sans-serif" }}>
      {/* Video placeholder */}
      <div style={{
        backgroundColor: "#0F0F0F",
        aspectRatio: "16/9",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 12,
      }}>
        <div style={{
          width: 68, height: 48, backgroundColor: "rgba(255,0,0,0.8)",
          borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 24, color: "#fff", marginLeft: 3 }}>▶</span>
        </div>
      </div>

      {/* Video title area */}
      <div style={{ backgroundColor: "#0F0F0F", padding: "0 0 16px", color: "#F1F1F1" }}>
        {/* Title */}
        <h1 style={{
          fontSize: 20, fontWeight: 600, margin: "0 0 8px",
          lineHeight: 1.3,
        }}>
          BREAKING: "Miracle" Cancer Drug Approved — Big Pharma Doesn't Want You to Know This
        </h1>

        {/* Channel + metrics */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "#333" }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Health Truth Channel</div>
            <div style={{ fontSize: 12, color: "#AAA" }}>1.2M subscribers</div>
          </div>
          <div style={{
            marginLeft: "auto",
            backgroundColor: "#272727", borderRadius: 18, padding: "6px 16px",
            fontSize: 14, fontWeight: 500,
          }}>
            Subscribe
          </div>
        </div>

        {/* ── TRUST ASSEMBLY CARD ── */}
        {/* Styled like YouTube's info/description cards */}
        <div style={{
          backgroundColor: "#1E1E1E",
          borderRadius: 12,
          padding: "12px 14px",
          border: `1px solid ${C.corrText}30`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          }}>
            <Lighthouse size={14} color={C.goldLight} />
            <span style={{
              fontFamily: "'Roboto Mono', monospace", fontSize: 11, fontWeight: 600,
              color: C.goldLight, letterSpacing: "0.03em",
            }}>
              TRUST ASSEMBLY
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#D4766E",
              backgroundColor: "#D4766E18",
              padding: "2px 8px", borderRadius: 10,
              fontFamily: "monospace",
            }}>
              VIDEO TITLE CORRECTED
            </span>
          </div>

          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#D4766E", marginBottom: 4 }}>
            <strong style={{ color: "#E8A09A" }}>Accurate title:</strong>{" "}
            FDA Approves Targeted Therapy Showing 23% Tumor Reduction in Phase III Trial for One Cancer Subtype
          </div>

          <div style={{
            fontSize: 13, lineHeight: 1.5, color: "#AAA",
          }}>
            The drug is not a general cancer cure. It's approved for HER2-negative metastatic breast cancer only. "Miracle" appears in no medical literature. The video thumbnail claim of "Big Pharma suppression" is unsupported — the drug was developed and sold by a pharmaceutical company.
          </div>

          {expanded && (
            <div style={{ marginTop: 10, animation: "ta-fadeIn 0.15s ease" }}>
              <div style={{
                padding: "8px 10px", backgroundColor: "#161616",
                borderRadius: 8, marginBottom: 8,
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#717171", textTransform: "uppercase", marginBottom: 4 }}>Evidence</div>
                <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 11, color: "#3EA6FF", textDecoration: "none", display: "block" }}>
                  fda.gov/drugs/approvals/BLA-2026-0847
                </a>
                <div style={{ fontSize: 11, color: "#717171", marginBottom: 4 }}>FDA approval letter and clinical review</div>
                <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 11, color: "#3EA6FF", textDecoration: "none", display: "block" }}>
                  nejm.org/doi/10.1056/NEJMoa2603891
                </a>
                <div style={{ fontSize: 11, color: "#717171" }}>Phase III trial: 23% improvement, p &lt; 0.01</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#717171" }}>
                  Medical Accuracy Assembly · Consensus (11/13) · Score 94
                </span>
                <span style={{ flex: 1 }} />
                <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 10, color: "#3EA6FF", textDecoration: "none" }}>
                  Full record →
                </a>
              </div>
            </div>
          )}

          <div
            onClick={() => setExpanded(!expanded)}
            style={{
              fontFamily: "Roboto, sans-serif",
              fontSize: 12, fontWeight: 500,
              color: "#AAA", cursor: "pointer", marginTop: 8,
              letterSpacing: "0.02em",
            }}
          >
            {expanded ? "Show less" : "...more"}
          </div>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// FACEBOOK DESIGN
// ═══════════════════════════════════════
// Strategy: Overlay card attached to the shared link preview,
// styled like Facebook's existing "Related Articles" or
// fact-check labels but with TA branding.

const FacebookCorrection = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ maxWidth: 500, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      {/* Facebook post card */}
      <div style={{
        backgroundColor: "#242526",
        borderRadius: 8,
        color: "#E4E6EB",
      }}>
        {/* Post header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 8px" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#3A3B3C" }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Health News Daily</div>
            <div style={{ fontSize: 12, color: "#B0B3B8" }}>Sponsored · 🌐</div>
          </div>
        </div>

        {/* Post text */}
        <div style={{ padding: "0 16px 12px", fontSize: 15, lineHeight: 1.4 }}>
          INCREDIBLE NEWS! 🎉 New miracle drug just got FDA approved and it basically CURES cancer! 🙏 Share this with everyone you know! 👇
        </div>

        {/* Link preview card */}
        <div style={{ margin: "0 16px", borderRadius: 8, overflow: "hidden", border: "1px solid #3A3B3C" }}>
          <div style={{
            height: 160, backgroundColor: "#333",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#666", fontSize: 13,
          }}>
            [Article preview image]
          </div>
          <div style={{ padding: "10px 12px", backgroundColor: "#3A3B3C" }}>
            <div style={{ fontSize: 11, color: "#B0B3B8", textTransform: "uppercase" }}>nationalnews.com</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
              New Drug Approved by FDA Shows 'Miraculous' Results
            </div>
            <div style={{ fontSize: 13, color: "#B0B3B8", marginTop: 2 }}>
              The FDA announced approval of a breakthrough therapy...
            </div>
          </div>
        </div>

        {/* ── TRUST ASSEMBLY CORRECTION ── */}
        {/* Attached below the link preview, like Facebook's fact-check labels */}
        <div style={{
          margin: "0 16px",
          padding: "10px 12px",
          backgroundColor: C.corrText + "12",
          borderRadius: "0 0 8px 8px",
          border: `1px solid ${C.corrText}30`,
          borderTop: `2px solid ${C.corrText}60`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Lighthouse size={13} color={C.goldLight} />
            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: C.goldLight, letterSpacing: "0.04em" }}>
              TRUST ASSEMBLY
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#D4766E",
              backgroundColor: "#D4766E18", padding: "1px 6px", borderRadius: 10,
              fontFamily: "monospace",
            }}>
              CORRECTED
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#B0B3B8" }}>
              ✦ Consensus
            </span>
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#D4766E" }}>
            This headline is misleading. The drug showed a 23% tumor reduction improvement for one specific cancer subtype — not a general cure. "Miraculous" appears in no medical literature or FDA documentation.
          </div>

          {expanded && (
            <div style={{ marginTop: 8, animation: "ta-fadeIn 0.15s ease" }}>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "#B0B3B8", marginBottom: 8 }}>
                The approved indication is HER2-negative metastatic breast cancer in patients who failed prior therapy. The drug carries a black box warning for cardiac events. Median survival improvement: 3.2 months.
              </div>
              <div style={{
                padding: "6px 8px", backgroundColor: "rgba(0,0,0,0.2)",
                borderRadius: 6, marginBottom: 6,
              }}>
                <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 11, color: "#4599FF", textDecoration: "none", display: "block" }}>
                  fda.gov/drugs/approvals/BLA-2026-0847
                </a>
                <a href="#" onClick={e => e.preventDefault()} style={{ fontFamily: "monospace", fontSize: 11, color: "#4599FF", textDecoration: "none", display: "block", marginTop: 2 }}>
                  nejm.org/doi/10.1056/NEJMoa2603891
                </a>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#B0B3B8" }}>
                Medical Accuracy Assembly · 11/13 jurors · Score 94
              </div>
            </div>
          )}

          <div
            onClick={() => setExpanded(!expanded)}
            style={{
              fontSize: 12, fontWeight: 600,
              color: "#4599FF", cursor: "pointer", marginTop: 6,
            }}
          >
            {expanded ? "See less" : "See why →"}
          </div>
        </div>

        {/* Post actions */}
        <div style={{
          display: "flex", justifyContent: "space-around", padding: "8px 16px",
          marginTop: 12, borderTop: "1px solid #3A3B3C",
          color: "#B0B3B8", fontSize: 14, fontWeight: 600,
        }}>
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>↗️ Share</span>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
// NEWS ARTICLE (baseline)
// ═══════════════════════════════════════
const ArticleCorrection = () => (
  <div style={{ maxWidth: 660, fontFamily: "Georgia, 'Times New Roman', serif" }}>
    <div style={{
      backgroundColor: "#fff", borderRadius: 8,
      boxShadow: "0 2px 12px rgba(0,0,0,0.09)", padding: "28px 32px",
    }}>
      <div style={{
        fontFamily: "'Helvetica Neue', sans-serif", fontSize: 11, fontWeight: 700,
        color: "#777", textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 20, paddingBottom: 10, borderBottom: "2px solid #222",
      }}>
        National News Network
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700, lineHeight: 1.25, color: C.corrText,
      }}>
        FDA Approves New Drug Showing Statistically Significant Tumor Reduction in Phase III Trial
        <span style={{ display: "inline-flex", marginLeft: 8, verticalAlign: "middle", position: "relative", top: -2 }}>
          <Lighthouse size={15} color={C.corrText} />
        </span>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 5, marginTop: 5, opacity: 0.6,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
      }}>
        <span style={{ fontWeight: 600, color: C.corrText, letterSpacing: "0.05em", textTransform: "uppercase" }}>Corrected</span>
        <span style={{ color: C.corrText, opacity: 0.4 }}>·</span>
        <span style={{ color: C.corrText }}>Medical Accuracy</span>
        <span style={{ color: C.corrText, opacity: 0.4 }}>·</span>
        <span style={{ color: C.corrText }}>11/13 · ✦ Consensus</span>
      </div>
      <div style={{
        fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13,
        color: "#999", marginTop: 6, marginBottom: 20,
      }}>
        By Robert Martinez · March 13, 2026
      </div>
      <p style={{ fontSize: 17, lineHeight: 1.72, color: "#333" }}>
        The FDA announced approval of the targeted therapy following completion of a multi-center Phase III clinical trial involving 1,200 patients over 18 months.
      </p>
    </div>
  </div>
);


// ═══════════════════════════════════════
// MAIN LAYOUT
// ═══════════════════════════════════════
export default function PlatformDesigns() {
  const [active, setActive] = useState("twitter");

  const platforms = [
    { key: "article", label: "News Article", bg: "#EDEAE3" },
    { key: "twitter", label: "Twitter / X", bg: "#000" },
    { key: "reddit", label: "Reddit", bg: "#030303" },
    { key: "youtube", label: "YouTube", bg: "#0F0F0F" },
    { key: "facebook", label: "Facebook", bg: "#18191A" },
  ];

  const activePlatform = platforms.find(p => p.key === active);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EDEAE3" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap');
        @keyframes ta-fadeIn {
          from { opacity: 0; transform: translateY(-3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        backgroundColor: C.navy, padding: "18px 24px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        <Lighthouse size={20} color={C.goldLight} />
        <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 18, fontWeight: 600, color: C.linen }}>
          Trust Assembly
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 9.5, color: C.goldLight, opacity: 0.5, letterSpacing: "0.06em", textTransform: "uppercase", marginLeft: 6 }}>
          Platform-Specific Designs
        </span>
      </div>

      <div style={{
        display: "flex", justifyContent: "center", gap: 4, padding: "14px 16px",
        backgroundColor: C.vellum, borderBottom: `1px solid ${C.linen}`, flexWrap: "wrap",
      }}>
        {platforms.map(p => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              fontWeight: active === p.key ? 600 : 400,
              color: active === p.key ? C.navy : "#999",
              backgroundColor: active === p.key ? C.navy + "0D" : "transparent",
              border: `1px solid ${active === p.key ? C.navy + "25" : "transparent"}`,
              borderRadius: 4, padding: "5px 12px", cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Platform display area with matching background */}
      <div style={{
        backgroundColor: activePlatform.bg,
        transition: "background-color 0.3s ease",
        minHeight: 500,
        padding: "32px 16px 60px",
        display: "flex",
        justifyContent: "center",
      }}>
        {active === "article" && <ArticleCorrection />}
        {active === "twitter" && <TwitterCorrection />}
        {active === "reddit" && <RedditCorrection />}
        {active === "youtube" && <YouTubeCorrection />}
        {active === "facebook" && <FacebookCorrection />}
      </div>

      {/* Design notes */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 16px 60px" }}>
        <div style={{
          padding: "20px 24px", backgroundColor: C.vellum,
          borderRadius: 8, border: `1px solid ${C.linen}`,
        }}>
          <div style={{
            fontFamily: "monospace", fontSize: 10, fontWeight: 600, color: C.navy,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
          }}>
            Platform Adaptation Strategy
          </div>
          <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13.5, lineHeight: 1.75, color: "#555" }}>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>News articles: replace the headline text, color it.</strong>{" "}
              The correction becomes the headline. The original is one click away. This is the highest-confidence treatment because the extension controls the full reading surface.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>Twitter: attach below the tweet like Community Notes.</strong>{" "}
              Users already understand this pattern. The correction sits in the visual space where Community Notes would appear, but with Trust Assembly branding and the ability to expand into full evidence. The tweet text itself is not modified — that would feel invasive.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>Reddit: inline banner between title and content.</strong>{" "}
              Reddit users understand flair, mod notes, and inline meta-information. The correction banner sits where a moderator action notice would go, with the same left-border accent pattern Reddit uses for mod actions. The subreddit flair is also updated to "Misleading Title" — a pattern Reddit users already watch for.
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: C.navy }}>YouTube: info card below the video title.</strong>{" "}
              Styled like YouTube's existing description expander. The "...more" pattern is native to YouTube. The correction card sits in the space between the title and the channel info, where YouTube already places contextual information cards.
            </div>
            <div>
              <strong style={{ color: C.navy }}>Facebook: attached to the link preview card.</strong>{" "}
              Facebook already attaches fact-check labels below shared links. The Trust Assembly correction occupies this same position with a "See why →" expander. The visual connection to the shared article makes the correction contextually obvious.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
