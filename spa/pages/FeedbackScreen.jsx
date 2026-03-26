import { useState, useEffect } from "react";
import { ADMIN_USERNAME } from "../lib/constants";

const FEEDBACK_STATUS_LABELS = { accepted: "Accepted", roadmapped: "Roadmapped", pending: "Pending", completed: "Completed" };
const FEEDBACK_STATUS_COLORS = { accepted: "#059669", roadmapped: "#7C3AED", pending: "#D97706", completed: "var(--gold)" };

export default function FeedbackScreen({ isAdmin, currentUsername }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState("accepted");
  const [replySending, setReplySending] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolveSending, setResolveSending] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/feedback");
      if (!res.ok) { setError("Failed to load feedback"); setLoading(false); return; }
      const data = await res.json();
      setItems(data.feedback || []);
    } catch (e) {
      setError("Failed to load feedback");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendReply = async (feedbackId) => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, action: "admin_reply", reply: replyText.trim(), status: replyStatus })
      });
      if (res.ok) { setReplyingTo(null); setReplyText(""); setReplyStatus("accepted"); load(); }
    } catch {}
    setReplySending(false);
  };

  const sendResolution = async (feedbackId, resolution) => {
    setResolveSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, action: "user_resolution", resolution, note: resolutionNote.trim() || null })
      });
      if (res.ok) { setResolvingId(null); setResolutionNote(""); load(); }
    } catch {}
    setResolveSending(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--stone)" }}>Loading feedback...</div>;
  if (error) return <div className="ta-error">{error}</div>;

  return (
    <div>
      <h2 className="ta-section-head">{isAdmin ? "Feedback & Feature Requests" : "My Feedback"}</h2>
      <p style={{ fontSize: 13, color: "var(--stone)", marginBottom: 20 }}>
        {isAdmin ? `${items.length} submission${items.length !== 1 ? "s" : ""} from beta users` : `${items.length} submission${items.length !== 1 ? "s" : ""} you've sent`}
      </p>
      {isAdmin && (
        <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 16, padding: "8px 12px", background: "var(--card-bg)", borderRadius: 0, border: "1px solid var(--border)" }}>
          Admin tools and diagnostics have moved to the <a href="/admin/system-health" style={{ color: "var(--accent)", fontWeight: 600 }}>System Health</a> page.
        </div>
      )}
      {items.length === 0 && <div className="ta-card" style={{ textAlign: "center", color: "var(--stone)" }}>No feedback yet.</div>}
      {items.map(item => (
        <div key={item.id} className="ta-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{item.username === ADMIN_USERNAME ? "\u{1F451} " : ""}@{item.username}</span>
              {item.status && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", backgroundColor: FEEDBACK_STATUS_COLORS[item.status] || "#999", padding: "1px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {FEEDBACK_STATUS_LABELS[item.status] || item.status}
                </span>
              )}
              {item.user_resolution && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", backgroundColor: item.user_resolution === "resolved" ? "#059669" : "#EA580C", padding: "1px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {item.user_resolution === "resolved" ? "Resolved" : "Needs Work"}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>{new Date(item.created_at).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap" }}>{item.message}</div>

          {/* Admin reply display */}
          {item.admin_reply && (
            <div style={{ marginTop: 12, padding: "10px 14px", backgroundColor: "rgba(212,168,67,0.09)", border: "1px solid var(--gold)", borderRadius: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold)", marginBottom: 4 }}>Admin Response · {new Date(item.admin_reply_at).toLocaleString()}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)", whiteSpace: "pre-wrap" }}>{item.admin_reply}</div>
            </div>
          )}

          {/* User resolution display */}
          {item.user_resolution && item.user_resolution_note && (
            <div style={{ marginTop: 8, padding: "8px 12px", backgroundColor: item.user_resolution === "resolved" ? "rgba(74,158,85,0.09)" : "rgba(212,168,67,0.09)", border: `1px solid ${item.user_resolution === "resolved" ? "rgba(74,158,85,0.27)" : "rgba(212,168,67,0.27)"}`, borderRadius: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: item.user_resolution === "resolved" ? "#059669" : "#EA580C", marginBottom: 2 }}>User Feedback</div>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--text)" }}>{item.user_resolution_note}</div>
            </div>
          )}

          {/* Admin reply form */}
          {isAdmin && replyingTo === item.id && (
            <div style={{ marginTop: 12, padding: "12px", backgroundColor: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
              <div className="ta-field" style={{ marginBottom: 10 }}>
                <label>Status</label>
                <select value={replyStatus} onChange={e => setReplyStatus(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }}>
                  <option value="accepted">Accepted</option>
                  <option value="roadmapped">Roadmapped</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="ta-field" style={{ marginBottom: 10 }}>
                <label>Reply</label>
                <textarea value={replyText} onChange={e => { if (e.target.value.length <= 1000) setReplyText(e.target.value); }} rows={3} placeholder="Your response to this feedback..." style={{ fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="ta-btn-secondary" onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
                <button className="ta-btn-primary" onClick={() => sendReply(item.id)} disabled={replySending || !replyText.trim()}>
                  {replySending ? "Sending..." : "Send Reply"}
                </button>
              </div>
            </div>
          )}

          {/* Admin reply button */}
          {isAdmin && replyingTo !== item.id && (
            <div style={{ marginTop: 8 }}>
              <button className="ta-btn-ghost" style={{ fontSize: 11, color: "var(--accent)" }} onClick={() => { setReplyingTo(item.id); setReplyText(item.admin_reply || ""); setReplyStatus(item.status || "accepted"); }}>
                {item.admin_reply ? "Edit Reply" : "Reply"}
              </button>
            </div>
          )}

          {/* User resolution form — only for completed items belonging to the current user */}
          {!isAdmin && item.status === "completed" && !item.user_resolution && item.username === currentUsername && (
            <div style={{ marginTop: 12, padding: "12px", backgroundColor: "rgba(212,168,67,0.09)", border: "1px solid var(--gold)", borderRadius: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gold)", marginBottom: 8 }}>This item has been marked as completed. Is it resolved?</div>
              {resolvingId === item.id ? (
                <>
                  <div className="ta-field" style={{ marginBottom: 10 }}>
                    <label>Feedback (optional)</label>
                    <textarea value={resolutionNote} onChange={e => { if (e.target.value.length <= 500) setResolutionNote(e.target.value); }} rows={2} placeholder="Any additional notes..." style={{ fontSize: 12 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ta-btn-primary" style={{ background: "var(--green)", fontSize: 12 }} onClick={() => sendResolution(item.id, "resolved")} disabled={resolveSending}>Resolved</button>
                    <button className="ta-btn-primary" style={{ background: "#EA580C", fontSize: 12 }} onClick={() => sendResolution(item.id, "needs_work")} disabled={resolveSending}>Needs Work</button>
                    <button className="ta-btn-ghost" onClick={() => { setResolvingId(null); setResolutionNote(""); }}>Cancel</button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ta-btn-primary" style={{ background: "var(--green)", fontSize: 12 }} onClick={() => sendResolution(item.id, "resolved")}>Resolved</button>
                  <button className="ta-btn-secondary" style={{ fontSize: 12 }} onClick={() => setResolvingId(item.id)}>Needs Work (with feedback)</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
