import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";
import { useDraft, clearDraft } from "../lib/hooks";
import { isDIUser, hasActiveDeceptionPenalty, deceptionPenaltyRemaining, getTrustedProgress, getDISubmissionLimit } from "../lib/permissions";
import { EvidenceFields, InlineEditsForm, StandingCorrectionInput, LegalDisclaimer } from "../components/ui";

export default function SubmitScreen({ user, onUpdate, draftId, onDraftLoaded }) {
  const [form, setForm] = useState({ url: "", originalHeadline: "", replacement: "", reasoning: "", author: "", submissionType: "correction", _step: 1 });
  const [authors, setAuthors] = useState([]);
  const [authorInput, setAuthorInput] = useState("");
  const [inlineEdits, setInlineEdits] = useState([{ original: "", replacement: "", reasoning: "" }]);
  const [standingCorrections, setStandingCorrections] = useState([{ assertion: "", evidence: "" }]);
  const [submitArgs, setSubmitArgs] = useState([""]);
  const [submitBeliefs, setSubmitBeliefs] = useState([""]);
  const [submitTranslations, setSubmitTranslations] = useState([{ original: "", translated: "", type: "clarity" }]);
  // Legacy single-entry state aliases for draft restore compatibility
  const [standingCorrection, setStandingCorrection] = useState({ assertion: "", evidence: "" });
  const [submitArg, setSubmitArg] = useState("");
  const [submitBelief, setSubmitBelief] = useState("");
  const [submitTranslation, setSubmitTranslation] = useState({ original: "", translated: "", type: "clarity" });
  const [linkedEntries, setLinkedEntries] = useState([]);
  const [vaultSearch, setVaultSearch] = useState(""); const [vaultResults, setVaultResults] = useState([]);
  const [showVaultSearch, setShowVaultSearch] = useState(false);
  const [evidenceUrls, setEvidenceUrls] = useState([{ url: "", explanation: "" }]);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);
  const [myOrgs, setMyOrgs] = useState([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState([]);

  // Server-side drafts
  const [savedDrafts, setSavedDrafts] = useState([]);
  const [draftMsg, setDraftMsg] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const loadedDraftRef = useRef(null);

  // Auto-save draft
  const draftState = useMemo(() => ({ form, authors, inlineEdits, standingCorrections, submitArgs, submitBeliefs, submitTranslations, standingCorrection, submitArg, submitBelief, submitTranslation, linkedEntries, evidenceUrls, selectedOrgIds }), [form, authors, inlineEdits, standingCorrections, submitArgs, submitBeliefs, submitTranslations, standingCorrection, submitArg, submitBelief, submitTranslation, linkedEntries, evidenceUrls, selectedOrgIds]);
  useDraft("ta_draft_submit", draftState, (d) => {
    if (d.form) setForm(f => ({ ...f, ...d.form }));
    if (d.authors) setAuthors(d.authors);
    if (d.inlineEdits) setInlineEdits(d.inlineEdits);
    // Restore multi-entry vault state
    if (d.standingCorrections) setStandingCorrections(d.standingCorrections);
    if (d.submitArgs) setSubmitArgs(d.submitArgs);
    if (d.submitBeliefs) setSubmitBeliefs(d.submitBeliefs);
    if (d.submitTranslations) setSubmitTranslations(d.submitTranslations);
    // Legacy single-entry restore
    if (d.standingCorrection) setStandingCorrection(d.standingCorrection);
    if (d.submitArg !== undefined) setSubmitArg(d.submitArg);
    if (d.submitBelief !== undefined) setSubmitBelief(d.submitBelief);
    if (d.submitTranslation) setSubmitTranslation(d.submitTranslation);
    if (d.linkedEntries) setLinkedEntries(d.linkedEntries);
    if (d.evidenceUrls) setEvidenceUrls(d.evidenceUrls);
    if (d.selectedOrgIds) setSelectedOrgIds(d.selectedOrgIds);
  });

  useEffect(() => { (async () => {
    const allOrgs = (await sG(SK.ORGS)) || {};
    const ids = user.orgIds || (user.orgId ? [user.orgId] : []);
    const orgs = ids.map(id => allOrgs[id]).filter(Boolean);
    setMyOrgs(orgs);
    // Default to user's active org (only if no draft restored)
    if (user.orgId && selectedOrgIds.length === 0) setSelectedOrgIds([user.orgId]);
  })(); }, [user.orgId, user.orgIds]);

  // Load saved drafts list from server
  const fetchDrafts = async () => {
    try {
      const res = await fetch("/api/drafts");
      if (res.ok) { const data = await res.json(); setSavedDrafts(data.drafts || []); }
    } catch {}
  };
  useEffect(() => { fetchDrafts(); }, []);

  // Restore form from a server draft
  const restoreFromDraft = (d) => {
    if (d.form) setForm(f => ({ ...f, ...d.form }));
    if (d.authors) setAuthors(d.authors);
    if (d.inlineEdits) setInlineEdits(d.inlineEdits);
    if (d.standingCorrections) setStandingCorrections(d.standingCorrections);
    if (d.submitArgs) setSubmitArgs(d.submitArgs);
    if (d.submitBeliefs) setSubmitBeliefs(d.submitBeliefs);
    if (d.submitTranslations) setSubmitTranslations(d.submitTranslations);
    if (d.standingCorrection) setStandingCorrection(d.standingCorrection);
    if (d.submitArg !== undefined) setSubmitArg(d.submitArg);
    if (d.submitBelief !== undefined) setSubmitBelief(d.submitBelief);
    if (d.submitTranslation) setSubmitTranslation(d.submitTranslation);
    if (d.linkedEntries) setLinkedEntries(d.linkedEntries);
    if (d.evidenceUrls) setEvidenceUrls(d.evidenceUrls);
    if (d.selectedOrgIds) setSelectedOrgIds(d.selectedOrgIds);
  };

  // Auto-load draft if draftId prop is provided (from FeedScreen CTA)
  useEffect(() => {
    if (!draftId || loadedDraftRef.current === draftId) return;
    loadedDraftRef.current = draftId;
    (async () => {
      try {
        const res = await fetch(`/api/drafts/${draftId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.draft?.draftData) restoreFromDraft(data.draft.draftData);
        }
      } catch {}
      if (onDraftLoaded) onDraftLoaded();
    })();
  }, [draftId]);

  // Save draft to server
  const saveDraft = async () => {
    if (!form.url.trim()) { setDraftMsg("Enter an article URL before saving."); return; }
    setSavingDraft(true); setDraftMsg("");
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url.trim(), title: form.originalHeadline.trim() || null, draftData: draftState }),
      });
      if (res.ok) { setDraftMsg("Draft saved."); fetchDrafts(); }
      else { const d = await res.json().catch(() => ({})); setDraftMsg(d.error || "Failed to save draft."); }
    } catch { setDraftMsg("Network error saving draft."); }
    setSavingDraft(false);
    setTimeout(() => setDraftMsg(""), 4000);
  };

  // Delete a saved draft
  const deleteDraft = async (id) => {
    try {
      await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      fetchDrafts();
    } catch {}
  };

  // Load a saved draft from server into form
  const loadDraft = async (id) => {
    try {
      const res = await fetch(`/api/drafts/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.draft?.draftData) { restoreFromDraft(data.draft.draftData); setDraftMsg("Draft loaded."); setTimeout(() => setDraftMsg(""), 3000); }
      }
    } catch {}
  };

  const activeOrg = myOrgs.find(o => selectedOrgIds.includes(o.id)) || myOrgs.find(o => o.id === user.orgId);

  const toggleOrg = (oid) => {
    setSelectedOrgIds(prev => prev.includes(oid) ? prev.filter(id => id !== oid) : [...prev, oid]);
    setLinkedEntries([]); setVaultSearch(""); setVaultResults([]);
  };

  const searchVault = async (query) => {
    setVaultSearch(query);
    if (!query.trim() || !user.orgId) { setVaultResults([]); return; }
    const q = query.toLowerCase().trim();
    const [v, a, b] = await Promise.all([sG(SK.VAULT), sG(SK.ARGS), sG(SK.BELIEFS)]);
    const results = [];
    Object.values(v || {}).filter(x => x.orgId === user.orgId).forEach(x => {
      if (x.assertion && x.assertion.toLowerCase().includes(q)) results.push({ id: x.id, type: "correction", label: x.assertion, detail: x.evidence, survivalCount: x.survivalCount || 0 });
    });
    Object.values(a || {}).filter(x => x.orgId === user.orgId).forEach(x => {
      if (x.content && x.content.toLowerCase().includes(q)) results.push({ id: x.id, type: "argument", label: x.content, survivalCount: x.survivalCount || 0 });
    });
    Object.values(b || {}).filter(x => x.orgId === user.orgId).forEach(x => {
      if (x.content && x.content.toLowerCase().includes(q)) results.push({ id: x.id, type: "belief", label: x.content, survivalCount: x.survivalCount || 0 });
    });
    setVaultResults(results);
  };

  const linkEntry = (entry) => {
    if (linkedEntries.find(e => e.id === entry.id)) return;
    setLinkedEntries(prev => [...prev, entry]);
    setVaultSearch(""); setVaultResults([]);
  };
  const unlinkEntry = (id) => setLinkedEntries(prev => prev.filter(e => e.id !== id));

  const go = async () => {
    setError(""); setSuccess("");
    const targetOrgIds = selectedOrgIds.length > 0 ? selectedOrgIds : (user.orgId ? [user.orgId] : []);
    if (targetOrgIds.length === 0) return setError("Select at least one Assembly.");
    if (!form.url.trim() || !form.originalHeadline.trim()) return setError("URL and original headline required.");
    if (form.submissionType === "correction" && !form.replacement.trim()) return setError("Corrected headline required for corrections.");
    if (!form.reasoning.trim()) return setError("Reasoning is mandatory.");
    if (form.url.trim().length > 2000) return setError("URL: 2000 character maximum.");
    if (form.originalHeadline.trim().length > 500) return setError("Original headline: 500 character maximum.");
    if (form.replacement.trim().length > 500) return setError("Replacement headline: 500 character maximum.");
    if (form.reasoning.trim().length > 2000) return setError("Reasoning: 2000 character maximum.");
    if (!/^https?:\/\/.+\..+/.test(form.url.trim())) return setError("Article URL must start with http:// or https://");
    setLoading(true);
    // Filter non-empty inline edits and evidence (shared across all assemblies)
    const validEdits = inlineEdits.filter(e => e.original.trim() && e.replacement.trim());
    const validEvidence = evidenceUrls.filter(e => e.url.trim());
    for (const ev of validEvidence) {
      if (!/^https?:\/\/.+\..+/.test(ev.url.trim())) { setError("Evidence URLs must start with http:// or https://"); setLoading(false); return; }
    }

    const authorStr = authors.length > 0 ? authors.join(", ") : (form.author ? form.author.trim() : null);
    const submittedNames = [];

    // ── Submit via relational API (single source of truth) ──
    // The server handles status determination, jury assignment, trusted skip,
    // evidence/inline-edit insertion, and audit logging.
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionType: form.submissionType,
        url: form.url.trim(),
        originalHeadline: form.originalHeadline.trim(),
        replacement: form.replacement.trim() || null,
        reasoning: form.reasoning.trim(),
        author: authorStr || null,
        orgIds: targetOrgIds,
        evidence: validEvidence.map(e => ({ url: e.url.trim(), explanation: e.explanation?.trim() || "" })),
        inlineEdits: validEdits.map(e => ({ original: e.original.trim(), replacement: e.replacement.trim(), reasoning: e.reasoning?.trim() || null })),
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setError(errData.error || "Submission failed"); setLoading(false); return;
    }

    const resData = await res.json();
    // The API returns a single submission or { submissions, count } for multi-org
    const createdSubs = resData.submissions ? resData.submissions : [resData];

    for (const created of createdSubs) {
      const orgId = created.org_id || targetOrgIds[0];
      const subId = created.id;

      // Save vault entries via relational API
      const validSCs = standingCorrections.filter(sc => sc.assertion.trim());
      for (const sc of validSCs) {
        try {
          await fetch("/api/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, type: "vault", submissionId: subId, assertion: sc.assertion.trim(), evidence: sc.evidence.trim() }),
          });
        } catch (e) { console.warn("Vault entry creation failed:", e); }
      }
      const validArgs = submitArgs.filter(a => a.trim());
      for (const arg of validArgs) {
        try {
          await fetch("/api/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, type: "argument", submissionId: subId, content: arg.trim() }),
          });
        } catch (e) { console.warn("Argument creation failed:", e); }
      }
      const validBeliefs = submitBeliefs.filter(b => b.trim());
      for (const belief of validBeliefs) {
        try {
          await fetch("/api/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, type: "belief", submissionId: subId, content: belief.trim() }),
          });
        } catch (e) { console.warn("Belief creation failed:", e); }
      }
      const validTrans = submitTranslations.filter(t => t.original.trim() && t.translated.trim());
      for (const tr of validTrans) {
        try {
          await fetch("/api/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, type: "translation", submissionId: subId, original: tr.original.trim(), translated: tr.translated.trim(), translationType: tr.type }),
          });
        } catch (e) { console.warn("Translation creation failed:", e); }
      }

      submittedNames.push(created.org_name || created.submission_type || "assembly");
    }
    setLoading(false);
    if (submittedNames.length === 0) { setError("No assemblies could accept your submission. Check DI limits."); return; }
    setSuccess(`Submitted to ${submittedNames.length} assembl${submittedNames.length > 1 ? "ies" : "y"}: ${submittedNames.join(", ")}`);
    setForm({ url: "", originalHeadline: "", replacement: "", reasoning: "", author: "", submissionType: "correction", _step: 1 }); setAuthors([]); setAuthorInput(""); setInlineEdits([{ original: "", replacement: "", reasoning: "" }]); setStandingCorrections([{ assertion: "", evidence: "" }]); setStandingCorrection({ assertion: "", evidence: "" }); setSubmitArgs([""]); setSubmitArg(""); setSubmitBeliefs([""]); setSubmitBelief(""); setSubmitTranslations([{ original: "", translated: "", type: "clarity" }]); setSubmitTranslation({ original: "", translated: "", type: "clarity" }); setLinkedEntries([]); setVaultSearch(""); setVaultResults([]); setShowVaultSearch(false); setEvidenceUrls([{ url: "", explanation: "" }]);
    clearDraft("ta_draft_submit");
    // Delete server draft for this URL if one exists
    const matchingDraft = savedDrafts.find(d => d.url === form.url.trim());
    if (matchingDraft) { try { await fetch(`/api/drafts/${matchingDraft.id}`, { method: "DELETE" }); } catch {} fetchDrafts(); }
  };

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Submit {form.submissionType === "affirmation" ? "Affirmation" : "Correction"}</h2>

      {/* Saved drafts banner */}
      {savedDrafts.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "#FFFBEB", border: "1.5px solid #CA8A04", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "#CA8A04", fontWeight: 700 }}>
              {savedDrafts.length} saved draft{savedDrafts.length > 1 ? "s" : ""}
            </span>
            <button className="ta-link-btn" style={{ fontSize: 11, color: "#CA8A04" }} onClick={() => setShowDrafts(s => !s)}>
              {showDrafts ? "Hide" : "Show"}
            </button>
          </div>
          {showDrafts && (
            <div style={{ marginTop: 8 }}>
              {savedDrafts.map(d => {
                let domain = "";
                try { domain = new URL(d.url).hostname.replace(/^www\./, ""); } catch {}
                return (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", marginBottom: 4, background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "(no headline)"}</div>
                      <div style={{ fontSize: 10, color: "#64748B" }}>{domain} · {new Date(d.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <button className="ta-link-btn" style={{ fontSize: 10, color: "#2563EB" }} onClick={() => loadDraft(d.id)}>Load</button>
                      <button className="ta-link-btn" style={{ fontSize: 10, color: "#DC2626" }} onClick={() => deleteDraft(d.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* What you're about to do */}
      <div style={{ padding: "14px 16px", background: "#fff", border: "1px solid #CBD5E1", borderLeft: "4px solid #CA8A04", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--serif)", fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>
          {form.submissionType === "affirmation"
            ? "You're affirming an accurate headline for the public record."
            : "You're correcting a misleading headline and submitting it for jury review."}
        </div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          {form.submissionType === "affirmation"
            ? "Identify an accurate headline, provide your evidence, and submit. Fellow citizens will verify your affirmation."
            : "Identify the article, propose a truthful replacement, explain your reasoning, and submit. A jury of fellow citizens will review your correction."}
        </div>
      </div>

      {hasActiveDeceptionPenalty(user) && <div style={{ padding: 10, background: "#EBD5D3", border: "1.5px solid #991B1B", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#991B1B", lineHeight: 1.6 }}>⚠ <strong>Deception penalty active</strong> — {deceptionPenaltyRemaining(user)} days remaining. You may still submit corrections. Accurate work during this period rebuilds your reputation.</div>}

      {/* DI Status Banner */}
      {isDIUser(user) && <div style={{ padding: 12, background: "#EEF2FF", border: "1.5px solid #4F46E5", borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4F46E5", fontWeight: 700, marginBottom: 4 }}>🤖 Digital Intelligence</div>
        <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.6 }}>
          Partner: <strong>@{user.diPartner}</strong> · {!user.diApproved ? <span style={{ color: "#DC2626" }}>⚠ Awaiting partner approval — submissions disabled</span> : "Approved"}
          {activeOrg && user.diApproved && <span> · Limit: {getDISubmissionLimit(activeOrg)}/day in this Assembly</span>}
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Your submissions will be flagged as DI-generated and require partner pre-approval before entering jury review.</div>
      </div>}
      {activeOrg && (() => {
        const tp = getTrustedProgress(user, user.orgId);
        if (tp.isTrusted) return <div style={{ padding: 10, background: "#ECFDF5", border: "1.5px solid #059669", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#059669", lineHeight: 1.6 }}>🛡 <strong>Trusted Contributor</strong> in {activeOrg.name} — your submissions skip jury review and go straight to approved. Still disputable by any member.</div>;
        if (tp.current > 0) return <div style={{ padding: 10, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>🎯 Trusted Contributor progress in {activeOrg.name}: <strong>{tp.current}/{tp.needed}</strong> consecutive approvals. {tp.needed - tp.current} more to skip jury review.</div>;
        return null;
      })()}

      {/* Submission Type Toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 8, overflow: "hidden", border: "1.5px solid #CBD5E1" }}>
        {[["correction", "🔴 Correction", "This headline is misleading"], ["affirmation", "🟢 Affirmation", "This headline is accurate"]].map(([key, label, desc]) => (
          <button key={key} onClick={() => setForm({ ...form, submissionType: key })} style={{ flex: 1, padding: "10px 8px", background: form.submissionType === key ? (key === "correction" ? "#DC2626" : "#059669") : "#FFFFFF", color: form.submissionType === key ? "#fff" : "#475569", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: form.submissionType === key ? 700 : 400 }}>
            <div>{label}</div>
            <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.8, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>{desc}</div>
          </button>
        ))}
      </div>

      {/* Org picker — multi-select */}
      {myOrgs.length > 1 && <div style={{ marginBottom: 14, padding: 10, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 6 }}>Submit to assemblies: <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(select one or more)</span></div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => { const sel = selectedOrgIds.includes(o.id); return <button key={o.id} onClick={() => toggleOrg(o.id)} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--mono)", border: `1.5px solid ${sel ? "#059669" : "#CBD5E1"}`, background: sel ? "#059669" : "#fff", color: sel ? "#fff" : "#475569", borderRadius: 8, cursor: "pointer", fontWeight: sel ? 700 : 400 }}>{sel ? "✓ " : ""}{o.isGeneralPublic ? "🏛 " : ""}{o.name}</button>; })}
        </div>
      </div>}
      {error && <div className="ta-error">{error}</div>}
      {success && <div className="ta-success">{success}</div>}

      {/* ── STEP 1: The Article ── */}
      <div className="ta-card" style={{ marginBottom: 2, borderBottom: "none", borderRadius: "2px 2px 0 0" }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 1 ? 0 : 1 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: form.url && form.originalHeadline ? "#059669" : "#2563EB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{form.url && form.originalHeadline ? "✓" : "1"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>The Article</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Paste the URL and headline you want to {form.submissionType === "affirmation" ? "affirm" : "correct"}</div>
          </div>
          <span style={{ fontSize: 12, color: "#64748B", transform: form._step === 1 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 1 && <div style={{ marginTop: 12 }}>
          <div className="ta-field"><label>Article URL *</label><input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." maxLength={2000} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ta-field"><label>Original Headline *</label><input value={form.originalHeadline} onChange={e => setForm({ ...form, originalHeadline: e.target.value })} placeholder="The headline as published" maxLength={500} /></div>
            <div className="ta-field"><label>Author(s) <span style={{ fontWeight: 400, color: "#64748B" }}>(optional — up to 10)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6, minHeight: 24 }}>
                {authors.map((a, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 12, fontSize: 11, color: "#0F172A" }}>
                    {a}
                    <span onClick={() => setAuthors(authors.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "#DC2626", fontSize: 13, lineHeight: 1 }}>&times;</span>
                  </span>
                ))}
              </div>
              {authors.length < 10 && <input value={authorInput} onChange={e => setAuthorInput(e.target.value)} onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = authorInput.trim();
                  if (name && authors.length < 10 && !authors.includes(name)) {
                    setAuthors([...authors, name]);
                    setAuthorInput("");
                    // Sync to form.author for backward compat
                    setForm(f => ({ ...f, author: [...authors, name].join(", ") }));
                  }
                }
              }} placeholder="Type author name and press Enter" maxLength={200} />}
            </div>
          </div>
        </div>}
      </div>

      {/* ── STEP 2: Your Case ── */}
      <div className="ta-card" style={{ marginBottom: 2, borderBottom: "none", borderRadius: 0 }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 2 ? 0 : 2 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: (form.submissionType === "correction" ? form.replacement && form.reasoning : form.reasoning) ? "#059669" : "#2563EB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(form.submissionType === "correction" ? form.replacement && form.reasoning : form.reasoning) ? "✓" : "2"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>Your Case</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{form.submissionType === "affirmation" ? "Explain why this headline is accurate" : "Propose the corrected headline and explain why"}</div>
          </div>
          <span style={{ fontSize: 12, color: "#64748B", transform: form._step === 2 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 2 && <div style={{ marginTop: 12 }}>
          {form.submissionType === "correction" && <div className="ta-field"><label>Proposed Replacement * <span style={{ fontWeight: 400, color: "#DC2626" }}>— the red pen</span></label><input value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} style={{ borderColor: "#DC2626" }} placeholder="Your corrected headline" maxLength={500} /></div>}
          {form.submissionType === "affirmation" && <div style={{ padding: 10, background: "#ECFDF5", border: "1px solid #05966940", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#059669" }}>✓ You are affirming this headline is <strong>accurate</strong>. Provide your reasoning and evidence below.</div>}
          <div className="ta-field"><label>Reasoning *</label><textarea value={form.reasoning} onChange={e => setForm({ ...form, reasoning: e.target.value })} rows={3} placeholder={form.submissionType === "affirmation" ? "Why is this headline accurate? What evidence supports it?" : "Why is the original misleading?"} maxLength={2000} /></div>
          <EvidenceFields evidence={evidenceUrls} onChange={setEvidenceUrls} />
          <div style={{ padding: 10, background: "#ECFDF5", border: "1px solid #05966940", borderRadius: 8, marginTop: 10, fontSize: 12, lineHeight: 1.6, color: "#1E293B" }}>
            <strong style={{ color: "#059669" }}>Tip:</strong> Stick to what you can prove. Corrections backed by evidence and clear reasoning survive review. Jurors respect intellectual honesty more than false confidence.
          </div>
        </div>}
      </div>

      {/* ── STEP 3: In-Line Edits (optional) ── */}
      <div className="ta-card" style={{ marginBottom: 2, borderBottom: "none", borderRadius: 0 }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 3 ? 0 : 3 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: inlineEdits.some(e => e.original && e.replacement) ? "#059669" : "#CBD5E1", color: inlineEdits.some(e => e.original && e.replacement) ? "#fff" : "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{inlineEdits.some(e => e.original && e.replacement) ? "✓" : "3"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>In-Line Article Edits <span style={{ fontWeight: 400, color: "#64748B", fontSize: 11 }}>optional</span></div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Propose specific text changes within the article body. Jurors vote on each edit independently.</div>
          </div>
          <span style={{ fontSize: 12, color: "#64748B", transform: form._step === 3 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 3 && <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 10, lineHeight: 1.6 }}>Copy the exact text from the article you want corrected into "Original Text." The system uses exact text matching to locate each passage. Up to 20 edits per article.</p>
          <InlineEditsForm edits={inlineEdits} onChange={setInlineEdits} />
        </div>}
      </div>

      {/* ── STEP 4: Assembly Vault (optional) ── */}
      <div className="ta-card" style={{ borderRadius: "0 0 2px 2px" }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 4 ? 0 : 4 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: linkedEntries.length > 0 || standingCorrections.some(sc => sc.assertion) || submitArgs.some(a => a.trim()) || submitBeliefs.some(b => b.trim()) || submitTranslations.some(t => t.original) ? "#059669" : "#CBD5E1", color: linkedEntries.length > 0 || standingCorrections.some(sc => sc.assertion) || submitArgs.some(a => a.trim()) || submitBeliefs.some(b => b.trim()) || submitTranslations.some(t => t.original) ? "#fff" : "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{linkedEntries.length > 0 || standingCorrections.some(sc => sc.assertion) || submitArgs.some(a => a.trim()) || submitBeliefs.some(b => b.trim()) || submitTranslations.some(t => t.original) ? "✓" : "4"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>Assembly Vault <span style={{ fontWeight: 400, color: "#64748B", fontSize: 11 }}>optional</span></div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Link reusable facts, arguments, beliefs, or translations to strengthen your submission.</div>
          </div>
          <span style={{ fontSize: 12, color: "#64748B", transform: form._step === 4 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 4 && <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>Link existing vault entries to strengthen your correction, or propose new ones. Linked entries are voted on by jurors — each time one survives review, it gains reputation.</p>

          {/* Linked entries chips */}
          {linkedEntries.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>Linked ({linkedEntries.length})</div>
            {linkedEntries.map(e => {
              const tc = { correction: ["🏛", "#059669", "#ECFDF5"], argument: ["⚔️", "#0D9488", "#F0FDFA"], belief: ["🧭", "#7C3AED", "#F3E8F9"] }[e.type] || ["📎", "#475569", "#F1F5F9"];
              return <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: tc[2], border: `1px solid ${tc[1]}40`, borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>{tc[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700, marginBottom: 2 }}>{e.type}{e.survivalCount > 0 ? ` · survived ${e.survivalCount}` : ""}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</div>
                </div>
                <button onClick={() => unlinkEntry(e.id)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>×</button>
              </div>;
            })}
          </div>}

          {/* Search to link existing */}
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setShowVaultSearch(s => !s)} style={{ background: showVaultSearch ? "#2563EB" : "#F9FAFB", color: showVaultSearch ? "#fff" : "#1E293B", border: "1.5px solid #CBD5E1", padding: "6px 12px", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", borderRadius: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {showVaultSearch ? "✕ Close Search" : "🔍 Link Existing Vault Entry"}
            </button>
            {showVaultSearch && <div style={{ marginTop: 10, padding: 12, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8 }}>
              <input value={vaultSearch} onChange={e => searchVault(e.target.value)} placeholder="Search your assembly's vault..." style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 13, borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" }} />
              <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>Type to search corrections, arguments, and beliefs in {activeOrg?.name || "your assembly"}</div>
              {vaultResults.length > 0 && <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
                {vaultResults.map(r => {
                  const already = linkedEntries.find(e => e.id === r.id);
                  const tc = { correction: ["🏛", "#059669"], argument: ["⚔️", "#0D9488"], belief: ["🧭", "#7C3AED"] }[r.type] || ["📎", "#475569"];
                  return <div key={r.id} onClick={() => !already && linkEntry(r)} style={{ padding: "8px 10px", borderBottom: "1px solid #E2E8F0", cursor: already ? "default" : "pointer", opacity: already ? 0.5 : 1, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{tc[0]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700 }}>{r.type}{r.survivalCount > 0 ? ` · survived ${r.survivalCount}` : ""}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1E293B" }}>{r.label}</div>
                    </div>
                    {already ? <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#059669" }}>✓ linked</span> : <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B" }}>+ link</span>}
                  </div>;
                })}
              </div>}
              {vaultSearch.trim() && vaultResults.length === 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#475569", fontStyle: "italic" }}>No matching entries found.</div>}
            </div>}
          </div>

          {/* Propose new entries — supports multiples */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", color: "#475569", padding: "6px 0" }}>+ Propose New Vault Entries</summary>
            <div style={{ marginTop: 10 }}>
              {/* Standing Corrections — multiple */}
              <div style={{ marginBottom: 12, padding: 12, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span style={{ color: "#059669" }}>🏛</span> Standing Corrections <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>— reusable facts</span></div>
                {standingCorrections.map((sc, i) => (
                  <div key={i} style={{ marginBottom: 8, padding: i > 0 ? "8px 0 0 0" : 0, borderTop: i > 0 ? "1px solid #E2E8F0" : "none" }}>
                    {standingCorrections.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>#{i + 1}</span>
                      <button onClick={() => setStandingCorrections(standingCorrections.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <StandingCorrectionInput value={sc} onChange={v => { const next = [...standingCorrections]; next[i] = v; setStandingCorrections(next); setStandingCorrection(next[0] || { assertion: "", evidence: "" }); }} />
                  </div>
                ))}
                <button onClick={() => setStandingCorrections([...standingCorrections, { assertion: "", evidence: "" }])} style={{ background: "none", border: "1px dashed #CBD5E1", color: "#059669", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 8, width: "100%", marginTop: 4 }}>+ Add another standing correction</button>
              </div>

              {/* Arguments — multiple */}
              <div style={{ marginBottom: 12, padding: 12, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span>⚔️</span> Arguments <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "#475569" }}>— reusable rhetorical or logical tools</span></div>
                {submitArgs.map((arg, i) => (
                  <div key={i} style={{ marginBottom: 8, position: "relative" }}>
                    {submitArgs.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>#{i + 1}</span>
                      <button onClick={() => { const next = submitArgs.filter((_, j) => j !== i); setSubmitArgs(next); setSubmitArg(next[0] || ""); }} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <textarea className="ta-field" value={arg} onChange={e => { const next = [...submitArgs]; next[i] = e.target.value; setSubmitArgs(next); setSubmitArg(next[0] || ""); }} rows={2} placeholder='e.g. "When an article cites unnamed experts, the absence of names IS the story."' style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 13, borderRadius: 8, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                ))}
                <button onClick={() => setSubmitArgs([...submitArgs, ""])} style={{ background: "none", border: "1px dashed #CBD5E1", color: "#0D9488", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 8, width: "100%", marginTop: 4 }}>+ Add another argument</button>
              </div>

              {/* Beliefs — multiple */}
              <div style={{ marginBottom: 12, padding: 12, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span>🧭</span> Foundational Beliefs <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "#475569" }}>— axioms your Assembly holds</span></div>
                {submitBeliefs.map((belief, i) => (
                  <div key={i} style={{ marginBottom: 8, position: "relative" }}>
                    {submitBeliefs.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>#{i + 1}</span>
                      <button onClick={() => { const next = submitBeliefs.filter((_, j) => j !== i); setSubmitBeliefs(next); setSubmitBelief(next[0] || ""); }} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <textarea value={belief} onChange={e => { const next = [...submitBeliefs]; next[i] = e.target.value; setSubmitBeliefs(next); setSubmitBelief(next[0] || ""); }} rows={2} placeholder='e.g. "Every person deserves to make informed decisions based on truthful reporting."' style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 13, borderRadius: 8, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                ))}
                <button onClick={() => setSubmitBeliefs([...submitBeliefs, ""])} style={{ background: "none", border: "1px dashed #CBD5E1", color: "#7C3AED", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 8, width: "100%", marginTop: 4 }}>+ Add another belief</button>
              </div>

              {/* Translations — multiple */}
              <div style={{ padding: 12, background: "#FFFBEB", border: "1px solid #B4530940", borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#B45309", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span>🔄</span> Translations <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "#475569" }}>— strip spin, jargon, or propaganda from language</span></div>
                {submitTranslations.map((tr, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? "1px solid #E2E8F0" : "none" }}>
                    {submitTranslations.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "#64748B" }}>#{i + 1}</span>
                      <button onClick={() => { const next = submitTranslations.filter((_, j) => j !== i); setSubmitTranslations(next); setSubmitTranslation(next[0] || { original: "", translated: "", type: "clarity" }); }} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "start", marginBottom: 8 }}>
                      <input value={tr.original} onChange={e => { const next = [...submitTranslations]; next[i] = { ...next[i], original: e.target.value }; setSubmitTranslations(next); setSubmitTranslation(next[0]); }} placeholder='e.g. "Enhanced interrogation techniques"' style={{ padding: "8px 10px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} />
                      <span style={{ padding: "8px 4px", color: "#B45309", fontWeight: 700 }}>→</span>
                      <input value={tr.translated} onChange={e => { const next = [...submitTranslations]; next[i] = { ...next[i], translated: e.target.value }; setSubmitTranslations(next); setSubmitTranslation(next[0]); }} placeholder='e.g. "Torture"' style={{ padding: "8px 10px", border: "1.5px solid #B4530980", background: "#fff", fontSize: 12, borderRadius: 8, fontFamily: "inherit" }} />
                    </div>
                    <select value={tr.type} onChange={e => { const next = [...submitTranslations]; next[i] = { ...next[i], type: e.target.value }; setSubmitTranslations(next); setSubmitTranslation(next[0]); }} style={{ padding: "6px 8px", border: "1.5px solid #CBD5E1", background: "#FFFFFF", fontSize: 11, borderRadius: 8, fontFamily: "var(--mono)", color: "#475569" }}>
                      <option value="clarity">Clarity — strip jargon</option>
                      <option value="propaganda">Anti-Propaganda — rename spin</option>
                      <option value="euphemism">Euphemism — call it what it is</option>
                      <option value="satirical">Satirical — approved humor</option>
                    </select>
                  </div>
                ))}
                <button onClick={() => setSubmitTranslations([...submitTranslations, { original: "", translated: "", type: "clarity" }])} style={{ background: "none", border: "1px dashed #CBD5E1", color: "#B45309", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 8, width: "100%", marginTop: 4 }}>+ Add another translation</button>
              </div>
            </div>
          </details>
        </div>}
      </div>

      {/* ── Sticky Submit + Save Draft Buttons ── */}
      <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(transparent, #F1F5F9 8px)", paddingTop: 12, paddingBottom: 8, zIndex: 10 }}>
        <button className="ta-btn-primary" onClick={go} disabled={loading} style={{ width: "100%", padding: "12px 16px", fontSize: 14 }}>{loading ? "Filing..." : "Submit for Review"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button className="ta-btn-ghost" onClick={saveDraft} disabled={savingDraft} style={{ fontSize: 11, color: "#CA8A04", border: "1px solid #CA8A04", padding: "6px 14px", borderRadius: 8 }}>
            {savingDraft ? "Saving..." : "Save Draft"}
          </button>
          {draftMsg && <span style={{ fontSize: 11, color: draftMsg.includes("saved") || draftMsg.includes("loaded") ? "#059669" : "#DC2626" }}>{draftMsg}</span>}
        </div>
        <LegalDisclaimer short />
      </div>
    </div>
  );
}
