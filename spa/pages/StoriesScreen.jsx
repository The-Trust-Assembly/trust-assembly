import React, { useState, useEffect, useCallback } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";
import { sDate } from "../lib/utils";
import { Loader, Empty, StatusPill } from "../components/ui";
import StoryDetailView from "../components/StoryDetailView";

export default function StoriesScreen({ user, onViewCitizen, onViewRecord }) {
  const [stories, setStories] = useState(null);
  const [orgs, setOrgs] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [subs, setSubs] = useState({});

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", orgId: "" });
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [storiesData, orgsData, subsData] = await Promise.all([sG(SK.STORIES), sG(SK.ORGS), sG(SK.SUBS)]);
    setStories(storiesData || {});
    setOrgs(orgsData || {});
    setSubs(subsData || {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stories?search=${encodeURIComponent(searchQuery.trim())}&status=approved&limit=50`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.stories || []);
        }
      } catch (e) { console.error("Story search failed:", e); }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleCreate = async () => {
    setCreateError(""); setCreateSuccess(""); setCreating(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "Failed to create story"); setCreating(false); return; }
      setCreateSuccess("Story proposal submitted. It will be reviewed by a jury before appearing.");
      setCreateForm({ title: "", description: "", orgId: "" });
      setShowCreate(false);
      load();
    } catch (e) { setCreateError("Network error"); }
    setCreating(false);
  };

  if (loading) return <Loader />;

  const userOrgs = Object.entries(orgs)
    .filter(([, o]) => o.members && o.members.includes(user.username))
    .map(([id, o]) => ({ id, name: o.name }));

  // Stories to display
  const allStories = Object.values(stories || {});
  const approvedStories = allStories
    .filter(s => ["approved", "consensus", "cross_review"].includes(s.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const pendingStories = allStories
    .filter(s => ["pending_jury", "pending_review"].includes(s.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const displayStories = searchResults || approvedStories;

  return (
    <div>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Stories</h2>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16, lineHeight: 1.6 }}>
        Stories track real-world events across multiple submissions. Create a story page to group related corrections and affirmations together.
      </p>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search stories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="ta-input"
          style={{ width: "100%", padding: "10px 14px", fontSize: 14 }}
        />
        {searching && <span style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, display: "block" }}>Searching...</span>}
      </div>

      {/* Create button */}
      {createSuccess && <div className="ta-success" style={{ marginBottom: 12 }}>{createSuccess}</div>}
      {!showCreate ? (
        <button className="ta-btn-primary" style={{ marginBottom: 20, fontSize: 13 }} onClick={() => setShowCreate(true)}>
          + Propose a Story
        </button>
      ) : (
        <div style={{ padding: 16, background: "#fff", border: "1.5px solid #CA8A04", borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 12 }}>Propose a New Story</h3>
          <p style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
            A jury from your assembly will review this proposal. Describe the real-world event or topic this story tracks.
          </p>

          <label style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 4, display: "block" }}>TITLE (10-300 chars)</label>
          <input
            className="ta-input"
            style={{ width: "100%", marginBottom: 10, padding: "8px 12px", fontSize: 14 }}
            placeholder="e.g. The death of Paul Ehrlich"
            value={createForm.title}
            onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
            maxLength={300}
          />

          <label style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 4, display: "block" }}>DESCRIPTION (50-5000 chars)</label>
          <textarea
            className="ta-input"
            style={{ width: "100%", marginBottom: 10, padding: "8px 12px", fontSize: 13, minHeight: 100, resize: "vertical" }}
            placeholder="Describe the event, key facts, and why this story deserves tracking..."
            value={createForm.description}
            onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
            maxLength={5000}
          />
          <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 10, textAlign: "right" }}>{createForm.description.length}/5000</div>

          <label style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 4, display: "block" }}>ASSEMBLY</label>
          <select
            className="ta-input"
            style={{ width: "100%", marginBottom: 12, padding: "8px 12px", fontSize: 13 }}
            value={createForm.orgId}
            onChange={e => setCreateForm(f => ({ ...f, orgId: e.target.value }))}
          >
            <option value="">Select an assembly...</option>
            {userOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>

          {createError && <div className="ta-error" style={{ marginBottom: 8 }}>{createError}</div>}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="ta-btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? "Submitting..." : "Submit Proposal"}
            </button>
            <button className="ta-link-btn" onClick={() => { setShowCreate(false); setCreateError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Pending stories (for awareness) */}
      {pendingStories.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: 8 }}>PENDING PROPOSALS ({pendingStories.length})</h3>
          {pendingStories.map(s => (
            <div key={s.id} className="ta-card" style={{ borderLeft: "4px solid #D97706", opacity: 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>{s.title}</span>
                <StatusPill status={s.status} />
              </div>
              <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{s.description.length > 150 ? s.description.slice(0, 150) + "..." : s.description}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>Proposed by {s.submittedBy} · {s.orgName} · {sDate(s.createdAt)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Approved/consensus stories */}
      <h3 style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: 8 }}>
        {searchResults ? `SEARCH RESULTS (${displayStories.length})` : `ACTIVE STORIES (${displayStories.length})`}
      </h3>
      {displayStories.length === 0 ? (
        <Empty text={searchResults ? "No stories match your search." : "No active stories yet. Propose one above."} />
      ) : displayStories.map(s => {
        const isExpanded = expandedId === s.id;
        const statusColor = s.status === "consensus" ? "#7C3AED" : s.status === "approved" ? "#059669" : "#D97706";
        return (
          <div key={s.id} className="ta-card" style={{ borderLeft: `4px solid ${statusColor}` }}>
            {!isExpanded ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "var(--navy)", cursor: "pointer" }}
                    onClick={() => setExpandedId(s.id)}>
                    {s.title}
                  </span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {s.submissionCount > 0 && (
                      <span style={{ fontSize: 9, padding: "2px 6px", background: "#F1F5F9", color: "#475569", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 600 }}>
                        {s.submissionCount} submission{s.submissionCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <StatusPill status={s.status} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 6 }}>
                  {s.description.length > 200 ? s.description.slice(0, 200) + "..." : s.description}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#94A3B8" }}>{s.submittedBy} · {s.orgName} · {sDate(s.createdAt)}</span>
                  <button className="ta-link-btn" style={{ fontSize: 11 }} onClick={() => setExpandedId(s.id)}>View details →</button>
                </div>
              </>
            ) : (
              <StoryDetailView
                story={s}
                user={user}
                orgs={orgs}
                allSubs={subs}
                onCollapse={() => setExpandedId(null)}
                onReload={load}
                onViewCitizen={onViewCitizen}
                onViewRecord={onViewRecord}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
