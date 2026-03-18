import React, { useState, useEffect } from "react";
import { sDate } from "../lib/utils";
import { StatusPill, SubHeadline, UsernameLink, Empty } from "./ui";

export default function StoryDetailView({ story, user, orgs, allSubs, onCollapse, onReload, onViewCitizen, onViewRecord }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tagSearch, setTagSearch] = useState("");
  const [showTagUI, setShowTagUI] = useState(false);
  const [tagError, setTagError] = useState("");
  const [tagSuccess, setTagSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/stories/${story.id}`);
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        }
      } catch (e) { console.error("Failed to load story detail:", e); }
      setLoading(false);
    })();
  }, [story.id]);

  const handleTag = async (submissionId) => {
    setTagError(""); setTagSuccess("");
    try {
      const res = await fetch(`/api/stories/${story.id}/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const data = await res.json();
      if (!res.ok) { setTagError(data.error || "Failed to tag"); return; }
      setTagSuccess(data.status === "approved" ? "Tagged (auto-approved)." : "Tag submitted for approval.");
      setTagSearch("");
      // Refresh detail
      const refreshRes = await fetch(`/api/stories/${story.id}`);
      if (refreshRes.ok) setDetail(await refreshRes.json());
      if (onReload) onReload();
    } catch { setTagError("Network error"); }
  };

  const handleApproveTag = async (submissionId) => {
    try {
      const res = await fetch(`/api/stories/${story.id}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/stories/${story.id}`);
        if (refreshRes.ok) setDetail(await refreshRes.json());
        if (onReload) onReload();
      }
    } catch (e) { console.error("Failed to approve tag:", e); }
  };

  const handleRemoveTag = async (submissionId) => {
    try {
      const res = await fetch(`/api/stories/${story.id}/tag`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/stories/${story.id}`);
        if (refreshRes.ok) setDetail(await refreshRes.json());
        if (onReload) onReload();
      }
    } catch (e) { console.error("Failed to remove tag:", e); }
  };

  // Find taggable submissions (from allSubs loaded in parent)
  const taggableSubmissions = allSubs ? Object.values(allSubs)
    .filter(s => {
      if (!["approved", "consensus", "cross_review"].includes(s.status)) return false;
      // Filter by search
      if (tagSearch.trim()) {
        const q = tagSearch.toLowerCase();
        return (s.originalHeadline || "").toLowerCase().includes(q) || (s.url || "").toLowerCase().includes(q);
      }
      return true;
    })
    .slice(0, 20) : [];

  const statusColor = story.status === "consensus" ? "#7C3AED" : story.status === "approved" ? "#059669" : "#D97706";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600, color: "var(--navy)", marginBottom: 4 }}>{story.title}</h3>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <StatusPill status={story.status} />
            {story.submissionCount > 0 && (
              <span style={{ fontSize: 9, padding: "2px 6px", background: "#F1F5F9", color: "#475569", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 600 }}>
                {story.submissionCount} submission{story.submissionCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <button className="ta-link-btn" style={{ fontSize: 11, flexShrink: 0 }} onClick={onCollapse}>← Collapse</button>
      </div>

      {/* Description */}
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>
        {story.description}
      </div>

      <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 16 }}>
        Proposed by <UsernameLink username={story.submittedBy} onClick={onViewCitizen} /> · {story.orgName} · {sDate(story.createdAt)}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: "#94A3B8", padding: 12 }}>Loading linked submissions...</div>
      ) : detail ? (
        <>
          {/* Linked submissions */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: 8 }}>
              LINKED SUBMISSIONS ({detail.submissions?.length || 0})
            </h4>
            {(!detail.submissions || detail.submissions.length === 0) ? (
              <Empty text="No submissions tagged to this story yet." />
            ) : detail.submissions.map(sub => {
              const isPending = sub.tag_status === "pending";
              return (
                <div key={sub.id} style={{
                  padding: "10px 12px", background: isPending ? "#FFFBEB" : "#F9FAFB", borderRadius: 8, marginBottom: 6,
                  border: isPending ? "1px solid #FDE68A" : "1px solid #E2E8F0",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>
                        {sub.original_headline}
                      </div>
                      <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all" }}>{sub.url}</a>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
                      {isPending && (
                        <button className="ta-link-btn" style={{ fontSize: 10, color: "#059669" }} onClick={() => handleApproveTag(sub.id)}>Approve</button>
                      )}
                      <button className="ta-link-btn" style={{ fontSize: 10, color: "#94A3B8" }} onClick={() => handleRemoveTag(sub.id)}>Remove</button>
                      <StatusPill status={sub.status} />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>
                    {isPending && <span style={{ color: "#D97706", fontWeight: 600 }}>Pending approval · </span>}
                    {sub.submitted_by} · {sub.org_name} · {sDate(sub.created_at)}
                    {sub.tagged_by && ` · Tagged by ${sub.tagged_by}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vault artifacts */}
          {detail.vaultArtifacts && detail.vaultArtifacts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: 8 }}>
                VAULT ARTIFACTS ({detail.vaultArtifacts.length})
              </h4>
              {detail.vaultArtifacts.map((a, i) => (
                <div key={i} style={{ padding: "8px 10px", background: "#F9FAFB", borderRadius: 6, marginBottom: 4, border: "1px solid #E2E8F0" }}>
                  <span style={{ fontSize: 9, padding: "1px 4px", background: "#EEF2FF", color: "#4F46E5", borderRadius: 4, fontFamily: "var(--mono)", fontWeight: 600, marginRight: 6 }}>{a.entry_type}</span>
                  <span style={{ fontSize: 12, color: "#334155" }}>{a.label || a.detail || "Linked artifact"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* Tag a submission */}
      {["approved", "consensus", "cross_review"].includes(story.status) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
          {!showTagUI ? (
            <button className="ta-link-btn" style={{ fontSize: 11 }} onClick={() => setShowTagUI(true)}>+ Tag a submission to this story</button>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 4, display: "block" }}>SEARCH SUBMISSIONS TO TAG</label>
              <input
                className="ta-input"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, marginBottom: 8 }}
                placeholder="Search by headline or URL..."
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
              />
              {tagError && <div className="ta-error" style={{ marginBottom: 6, fontSize: 12 }}>{tagError}</div>}
              {tagSuccess && <div className="ta-success" style={{ marginBottom: 6, fontSize: 12 }}>{tagSuccess}</div>}
              {taggableSubmissions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94A3B8" }}>No matching submissions found.</div>
              ) : taggableSubmissions.map(sub => (
                <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 6, marginBottom: 4, background: "#F9FAFB" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.originalHeadline}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>{sub.orgName} · {sDate(sub.createdAt)}</div>
                  </div>
                  <button className="ta-link-btn" style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }} onClick={() => handleTag(sub.id)}>Tag</button>
                </div>
              ))}
              <button className="ta-link-btn" style={{ fontSize: 11, marginTop: 8, color: "#94A3B8" }} onClick={() => { setShowTagUI(false); setTagSearch(""); setTagError(""); setTagSuccess(""); }}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
