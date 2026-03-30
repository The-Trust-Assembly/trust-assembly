import { useState } from "react";
import { getEmbedInfo, extractDomain, getYouTubeThumbnail } from "../lib/embedResolver";

/**
 * ContentEmbed — shared component for rendering embeddable content
 * (YouTube, Spotify, Vimeo, TikTok iframe players) or OG preview cards
 * (thumbnail + title + domain, like Slack/Discord link cards).
 *
 * Used in: submit preview panel, feed expanded view, full record page,
 * and review page. Pass `compact` for space-constrained layouts.
 */
export default function ContentEmbed({ url, title, description, thumbnailUrl, domain, compact }) {
  const [imgError, setImgError] = useState(false);

  if (!url) return null;
  const embedInfo = getEmbedInfo(url);
  const displayDomain = domain || extractDomain(url);

  // For YouTube, always have a thumbnail available as fallback
  const ytThumb = getYouTubeThumbnail(url);
  const effectiveThumbnail = thumbnailUrl || ytThumb;

  // ─── COMPACT MODE: show thumbnail card instead of iframe ────
  // Avoids broken embeds (Error 153) in space-constrained layouts
  if (embedInfo && compact && effectiveThumbnail) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ display: "block", border: "1px solid var(--border)", background: "#000", overflow: "hidden", marginBottom: 8, textDecoration: "none", position: "relative" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
        <div style={{ position: "relative" }}>
          <img src={effectiveThumbnail} alt="" referrerPolicy="no-referrer" onError={() => setImgError(true)}
            style={{ width: "100%", height: 120, objectFit: "cover", display: "block", opacity: 0.85 }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 0, height: 0, borderLeft: "12px solid #fff", borderTop: "7px solid transparent", borderBottom: "7px solid transparent", marginLeft: 3 }} />
          </div>
        </div>
        <div style={{ padding: "6px 10px", background: "var(--card-bg)" }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" }}>{embedInfo.platform}</div>
          {title && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
        </div>
      </a>
    );
  }

  // ─── IFRAME EMBED (YouTube, Spotify, Vimeo, TikTok) ──────────
  if (embedInfo) {
    const isSpotify = embedInfo.platform === "Spotify";
    const isTikTok = embedInfo.platform === "TikTok";
    const height = isSpotify ? (compact ? 152 : 232) : isTikTok ? (compact ? 400 : 580) : undefined;

    return (
      <div style={{ marginBottom: compact ? 8 : 12 }}>
        <div style={{
          position: "relative",
          width: "100%",
          ...(height ? { height } : { paddingBottom: "56.25%" }), // 16:9 for video, fixed for spotify/tiktok
          overflow: "hidden",
          background: "#000",
        }}>
          <iframe
            src={embedInfo.embedUrl}
            style={{ position: height ? "relative" : "absolute", top: 0, left: 0, width: "100%", height: height || "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer"
            title={title || `${embedInfo.platform} content`}
          />
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: "0.5px", marginTop: 4, textDecoration: "none" }}>
          View on {embedInfo.platform}
        </a>
      </div>
    );
  }

  // ─── OG PREVIEW CARD (articles, products, everything else) ────
  const hasThumbnail = thumbnailUrl && !imgError;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{
        display: "flex",
        flexDirection: compact && hasThumbnail ? "row" : "column",
        border: "1px solid var(--border)",
        background: "var(--card-bg)",
        textDecoration: "none",
        overflow: "hidden",
        marginBottom: compact ? 8 : 12,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {hasThumbnail && (
        <div style={{
          flexShrink: 0,
          ...(compact ? { width: 100, height: 80 } : { width: "100%", height: 160 }),
          overflow: "hidden",
          background: "#eee",
        }}>
          <img
            src={thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      <div style={{ padding: compact ? "6px 10px" : "10px 14px", minWidth: 0 }}>
        {displayDomain && (
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: "0.5px", marginBottom: 3, textTransform: "uppercase" }}>
            {displayDomain}
          </div>
        )}
        {title && (
          <div style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.3,
            marginBottom: description ? 4 : 0,
            display: "-webkit-box",
            WebkitLineClamp: compact ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {title}
          </div>
        )}
        {description && !compact && (
          <div style={{
            fontSize: 11,
            color: "var(--text-sec)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {description}
          </div>
        )}
      </div>
    </a>
  );
}
