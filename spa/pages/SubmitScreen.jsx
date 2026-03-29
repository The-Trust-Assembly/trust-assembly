import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";
import { useDraft, clearDraft } from "../lib/hooks";
import { detectPlatform, CLAIM_CATEGORIES, LISTING_LOCATIONS } from "../lib/platforms";
import { isDIUser, hasActiveDeceptionPenalty, deceptionPenaltyRemaining, getTrustedProgress, getDISubmissionLimit } from "../lib/permissions";
import { EvidenceFields, InlineEditsForm, StandingCorrectionInput, LegalDisclaimer, Icon } from "../components/ui";
import { queryKeys } from "../lib/queryKeys";

function EducationHelper({ storageKey, children }) {
  const key = `ta_helper_${storageKey}`;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  if (dismissed) return null;
  return (
    <div style={{ padding: "10px 14px", background: "rgba(212,168,67,0.06)", borderLeft: "3px solid var(--gold)", marginBottom: 12, fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6 }}>
      {children}
      <button onClick={() => { setDismissed(true); try { localStorage.setItem(key, "1"); } catch {} }} style={{ display: "block", marginTop: 6, background: "none", border: "none", color: "var(--gold)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.5px", padding: 0 }}>Got it</button>
    </div>
  );
}

export default function SubmitScreen({ user, onUpdate, draftId, onDraftLoaded, onShowRegistration }) {
  const qc = useQueryClient();
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
  const [showSubSearch, setShowSubSearch] = useState(false);
  const [subSearch, setSubSearch] = useState(""); const [subResults, setSubResults] = useState([]);
  const [linkedSubs, setLinkedSubs] = useState([]);
  const [evidenceUrls, setEvidenceUrls] = useState([{ url: "", explanation: "" }]);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const [graceSubmissions, setGraceSubmissions] = useState([]); // { id, createdAt, orgName }
  const [graceTimer, setGraceTimer] = useState(null);
  const [myOrgs, setMyOrgs] = useState([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [previewMode, setPreviewMode] = useState("diff"); // "clean" or "diff"
  const [platform, setPlatform] = useState(null); // detected platform config from platforms.js
  const [platformTransitioning, setPlatformTransitioning] = useState(false);
  // Template-specific extra fields
  const [podcastShowName, setPodcastShowName] = useState("");
  const [podcastGuest, setPodcastGuest] = useState("");
  const [episodeDuration, setEpisodeDuration] = useState("");
  const [claimTimestamp, setClaimTimestamp] = useState("");
  const [transcriptExcerpt, setTranscriptExcerpt] = useState("");
  const [productClaimCategory, setProductClaimCategory] = useState("");
  const [productBrandSeller, setProductBrandSeller] = useState("");
  const [productMarketplace, setProductMarketplace] = useState("");
  const [claimLocation, setClaimLocation] = useState("");
  const [publicationName, setPublicationName] = useState("");
  const [threadPosition, setThreadPosition] = useState("");
  const [referencedLink, setReferencedLink] = useState("");
  const importTimerRef = useRef(null);
  const lastImportedUrlRef = useRef(null);
  const platformTimerRef = useRef(null);

  // Auto-import content via the import service (/api/import)
  // Uses the 5-layer extraction waterfall: site registry → platform APIs → meta tags → JSON-LD → Readability
  const importContent = useCallback(async (url) => {
    const normalized = url?.trim().replace(/\/+$/, "").toLowerCase();
    if (normalized && normalized === lastImportedUrlRef.current) return;
    if (!url || !/^https?:\/\/.+\..+/.test(url.trim())) return;
    setImporting(true); setImportMsg("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) { setImportMsg("Could not fetch content."); setImporting(false); return; }
      const result = (await res.json()).data || await res.json();
      const fields = result.fields || {};
      let imported = [];

      // Auto-fill fields based on confidence scores
      if (fields.title?.value && fields.title.confidence >= 0.5 && !form.originalHeadline.trim()) {
        setForm(f => ({ ...f, originalHeadline: fields.title.value }));
        imported.push("title");
      }
      if (fields.author?.value && fields.author.confidence >= 0.5 && authors.length === 0) {
        const authorNames = fields.author.value.split(/,\s*/).filter(Boolean);
        setAuthors(authorNames);
        setForm(f => ({ ...f, author: fields.author.value }));
        imported.push(authorNames.length === 1 ? "author" : "authors");
      }
      if (fields.body?.value) setBodyText(fields.body.value);
      if (fields.publication?.value && !publicationName) setPublicationName(fields.publication.value);
      if (fields.showName?.value && !podcastShowName) setPodcastShowName(fields.showName.value);
      if (fields.brand?.value && !productBrandSeller) setProductBrandSeller(fields.brand.value);
      if (fields.duration?.value && !episodeDuration) setEpisodeDuration(fields.duration.value);

      if (imported.length > 0) {
        setImportMsg(`Imported ${imported.join(" and ")} from ${result.recipeUsed || result.platform || "page"}.`);
      } else if (Object.keys(fields).length > 0) {
        setImportMsg("Fields already filled — import skipped.");
      } else {
        setImportMsg("No content found on page.");
      }
    } catch (e) {
      if (e.name === "AbortError") {
        setImportMsg("Import timed out — fill in fields manually.");
      } else {
        setImportMsg("Failed to fetch content.");
      }
    }
    lastImportedUrlRef.current = normalized;
    setImporting(false);
    setTimeout(() => setImportMsg(""), 5000);
  }, [form.originalHeadline, authors, publicationName, podcastShowName, productBrandSeller, episodeDuration]);

  // Debounced auto-import on URL paste/change + platform detection
  const handleUrlChange = useCallback((newUrl) => {
    setForm(f => ({ ...f, url: newUrl }));
    clearTimeout(importTimerRef.current);
    clearTimeout(platformTimerRef.current);
    // Platform detection (fast, client-side, 400ms debounce)
    platformTimerRef.current = setTimeout(() => {
      const detected = detectPlatform(newUrl);
      if (detected?.key !== platform?.key) {
        setPlatformTransitioning(true);
        setTimeout(() => { setPlatform(detected); setPlatformTransitioning(false); }, 150);
      }
    }, 400);
    // Auto-import (600ms debounce)
    if (/^https?:\/\/.+\..+/.test(newUrl.trim()) && !form.originalHeadline.trim()) {
      importTimerRef.current = setTimeout(() => importContent(newUrl), 600);
    }
  }, [form.originalHeadline, importContent, platform]);

  // Accept ?url= query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (urlParam && !form.url) {
      handleUrlChange(urlParam);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!user) return; // Anonymous users default to General Public (handled at submission time)
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

  const activeOrg = myOrgs.find(o => selectedOrgIds.includes(o.id)) || (user ? myOrgs.find(o => o.id === user.orgId) : null);

  const toggleOrg = (oid) => {
    setSelectedOrgIds(prev => prev.includes(oid) ? prev.filter(id => id !== oid) : [...prev, oid]);
    setLinkedEntries([]); setVaultSearch(""); setVaultResults([]);
  };

  const searchVault = async (query) => {
    setVaultSearch(query);
    if (!query.trim() || !user?.orgId) { setVaultResults([]); return; }
    const q = query.toLowerCase().trim();
    const [v, a, b] = await Promise.all([sG(SK.VAULT), sG(SK.ARGS), sG(SK.BELIEFS)]);
    const results = [];
    Object.values(v || {}).filter(x => x.orgId === user?.orgId).forEach(x => {
      if (x.assertion && x.assertion.toLowerCase().includes(q)) results.push({ id: x.id, type: "correction", label: x.assertion, detail: x.evidence, survivalCount: x.survivalCount || 0 });
    });
    Object.values(a || {}).filter(x => x.orgId === user?.orgId).forEach(x => {
      if (x.content && x.content.toLowerCase().includes(q)) results.push({ id: x.id, type: "argument", label: x.content, survivalCount: x.survivalCount || 0 });
    });
    Object.values(b || {}).filter(x => x.orgId === user?.orgId).forEach(x => {
      if (x.content && x.content.toLowerCase().includes(q)) results.push({ id: x.id, type: "belief", label: x.content, survivalCount: x.survivalCount || 0 });
    });
    setVaultResults(results);
  };

  const searchSubmissions = async (query) => {
    setSubSearch(query);
    if (!query.trim()) { setSubResults([]); return; }
    const allSubs = await sG(SK.SUBS);
    const q = query.toLowerCase().trim();
    const results = Object.values(allSubs || {})
      .filter(s => ["approved", "consensus", "cross_review"].includes(s.status))
      .filter(s => (s.originalHeadline || "").toLowerCase().includes(q) || (s.url || "").toLowerCase().includes(q))
      .slice(0, 20);
    setSubResults(results);
  };

  const linkSub = (sub) => {
    if (linkedSubs.find(s => s.id === sub.id)) return;
    setLinkedSubs(prev => [...prev, sub]);
    setSubSearch(""); setSubResults([]);
  };
  const unlinkSub = (id) => setLinkedSubs(prev => prev.filter(s => s.id !== id));

  const linkEntry = (entry) => {
    if (linkedEntries.find(e => e.id === entry.id)) return;
    setLinkedEntries(prev => [...prev, entry]);
    setVaultSearch(""); setVaultResults([]);
  };
  const unlinkEntry = (id) => setLinkedEntries(prev => prev.filter(e => e.id !== id));

  const validate = () => {
    setError("");
    const targetOrgIds = selectedOrgIds.length > 0 ? selectedOrgIds : (user?.orgId ? [user.orgId] : []);
    if (targetOrgIds.length === 0) { setError("Select at least one Assembly."); return false; }
    if (!form.url.trim() || !form.originalHeadline.trim()) { setError("URL and original headline required."); return false; }
    if (form.submissionType === "correction" && !form.replacement.trim()) { setError("Corrected headline required for corrections."); return false; }
    if (!form.reasoning.trim()) { setError("Reasoning is mandatory."); return false; }
    if (form.url.trim().length > 2000) { setError("URL: 2000 character maximum."); return false; }
    if (form.originalHeadline.trim().length > 500) { setError("Original headline: 500 character maximum."); return false; }
    if (form.replacement.trim().length > 500) { setError("Replacement headline: 500 character maximum."); return false; }
    if (form.reasoning.trim().length > 2000) { setError("Reasoning: 2000 character maximum."); return false; }
    if (!/^https?:\/\/.+\..+/.test(form.url.trim())) { setError("Article URL must start with http:// or https://"); return false; }
    return true;
  };

  const handleSubmitClick = () => {
    if (!validate()) return;
    if (isMobile) { setShowMobilePreview(true); return; }
    setShowConfirm(true);
  };

  const go = async () => {
    setShowConfirm(false);
    setError(""); setSuccess("");
    const targetOrgIds = selectedOrgIds.length > 0 ? selectedOrgIds : (user?.orgId ? [user.orgId] : []);
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
        bodyText: bodyText || null,
        orgIds: targetOrgIds,
        evidence: validEvidence.map(e => ({ url: e.url.trim(), explanation: e.explanation?.trim() || "" })),
        inlineEdits: validEdits.map(e => ({ original: e.original.trim(), replacement: e.replacement.trim(), reasoning: e.reasoning?.trim() || null })),
        linkedSubmissionIds: linkedSubs.map(s => s.id),
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
    setSuccess(`Submitted to ${submittedNames.length} assembl${submittedNames.length > 1 ? "ies" : "y"}: ${submittedNames.join(", ")}. Your submission is now in jury review.`);
    setForm({ url: "", originalHeadline: "", replacement: "", reasoning: "", author: "", submissionType: "correction", _step: 1 }); setAuthors([]); setAuthorInput(""); setInlineEdits([{ original: "", replacement: "", reasoning: "" }]); setStandingCorrections([{ assertion: "", evidence: "" }]); setStandingCorrection({ assertion: "", evidence: "" }); setSubmitArgs([""]); setSubmitArg(""); setSubmitBeliefs([""]); setSubmitBelief(""); setSubmitTranslations([{ original: "", translated: "", type: "clarity" }]); setSubmitTranslation({ original: "", translated: "", type: "clarity" }); setLinkedEntries([]); setVaultSearch(""); setVaultResults([]); setShowVaultSearch(false); setLinkedSubs([]); setSubSearch(""); setSubResults([]); setShowSubSearch(false); setEvidenceUrls([{ url: "", explanation: "" }]);
    clearDraft("ta_draft_submit");
    // Invalidate TanStack Query caches so other screens see fresh data
    qc.invalidateQueries({ queryKey: queryKeys.submissions });
    qc.invalidateQueries({ queryKey: queryKeys.users });
    qc.invalidateQueries({ queryKey: queryKeys.vault });
    qc.invalidateQueries({ queryKey: queryKeys.drafts });
    // Delete server draft for this URL if one exists
    const matchingDraft = savedDrafts.find(d => d.url === form.url.trim());
    if (matchingDraft) { try { await fetch(`/api/drafts/${matchingDraft.id}`, { method: "DELETE" }); } catch {} fetchDrafts(); }
  };

  // Extract domain from URL for preview byline
  const urlDomain = (() => { try { return new URL(form.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  // Build preview paragraphs from body text, applying inline edit diffs
  const previewParagraphs = useMemo(() => {
    if (!bodyText) return [];
    return bodyText.split(/\n\n+/).filter(p => p.trim()).slice(0, 30);
  }, [bodyText]);

  // Apply inline edit and translation highlighting to a paragraph
  const renderPreviewParagraph = (text, idx) => {
    if (previewMode !== "diff") return <p key={idx} style={{ fontSize: 11, lineHeight: 1.7, color: "#333", marginBottom: 10, fontFamily: "Georgia, serif" }}>{text}</p>;
    // Check if any inline edit matches text in this paragraph
    let parts = [{ text, type: "normal" }];
    for (const edit of inlineEdits) {
      if (!edit.original.trim()) continue;
      const newParts = [];
      for (const part of parts) {
        if (part.type !== "normal") { newParts.push(part); continue; }
        const idx2 = part.text.indexOf(edit.original);
        if (idx2 === -1) { newParts.push(part); continue; }
        if (idx2 > 0) newParts.push({ text: part.text.slice(0, idx2), type: "normal" });
        newParts.push({ text: edit.original, type: "del" });
        newParts.push({ text: edit.replacement, type: "ins" });
        if (idx2 + edit.original.length < part.text.length) newParts.push({ text: part.text.slice(idx2 + edit.original.length), type: "normal" });
      }
      parts = newParts;
    }
    // Apply translations — replace every instance of the original phrase with the translated version in red
    for (const tr of submitTranslations) {
      if (!tr.original.trim() || !tr.translated.trim()) continue;
      const newParts = [];
      for (const part of parts) {
        if (part.type !== "normal") { newParts.push(part); continue; }
        // Split on ALL occurrences of the translation phrase
        let remaining = part.text;
        let found = false;
        while (remaining.length > 0) {
          const idx2 = remaining.toLowerCase().indexOf(tr.original.toLowerCase());
          if (idx2 === -1) { newParts.push({ text: remaining, type: "normal" }); break; }
          found = true;
          if (idx2 > 0) newParts.push({ text: remaining.slice(0, idx2), type: "normal" });
          newParts.push({ text: remaining.slice(idx2, idx2 + tr.original.length), type: "tr-del" });
          newParts.push({ text: tr.translated, type: "tr-ins" });
          remaining = remaining.slice(idx2 + tr.original.length);
        }
      }
      parts = newParts;
    }
    return (
      <p key={idx} style={{ fontSize: 11, lineHeight: 1.7, color: "#333", marginBottom: 10, fontFamily: "Georgia, serif" }}>
        {parts.map((p, i) => {
          if (p.type === "del") return <span key={i} style={{ background: "rgba(196,74,58,0.12)", textDecoration: "line-through", textDecorationColor: "#9e3527", color: "#9e3527" }}>{p.text}</span>;
          if (p.type === "ins") return <span key={i} style={{ background: "rgba(74,158,85,0.12)", borderLeft: "2px solid #4a9e55", paddingLeft: 4, color: "#2d6e34" }}>{p.text}</span>;
          if (p.type === "tr-del") return <span key={i} style={{ textDecoration: "line-through", color: "#999" }}>{p.text}</span>;
          if (p.type === "tr-ins") return <span key={i} style={{ color: "#c44a3a", fontWeight: 600 }}>{p.text}</span>;
          return <span key={i}>{p.text}</span>;
        })}
      </p>
    );
  };

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Submit {form.submissionType === "affirmation" ? "Affirmation" : "Correction"}</h2>
      <div style={{ display: "flex", height: "calc(100vh - 120px)", gap: 0 }}>
      {/* ── LEFT: FORM SIDE ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: 8 }}>

      {/* Saved drafts banner */}
      {savedDrafts.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(212,168,67,0.09)", border: "1.5px solid #CA8A04", borderRadius: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--gold)", fontWeight: 700 }}>
              {savedDrafts.length} saved draft{savedDrafts.length > 1 ? "s" : ""}
            </span>
            <button className="ta-link-btn" style={{ fontSize: 11, color: "var(--gold)" }} onClick={() => setShowDrafts(s => !s)}>
              {showDrafts ? "Hide" : "Show"}
            </button>
          </div>
          {showDrafts && (
            <div style={{ marginTop: 8 }}>
              {savedDrafts.map(d => {
                let domain = "";
                try { domain = new URL(d.url).hostname.replace(/^www\./, ""); } catch {}
                return (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", marginBottom: 4, background: "var(--card-bg)", borderRadius: 0, border: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "(no headline)"}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{domain} · {new Date(d.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <button className="ta-link-btn" style={{ fontSize: 10, color: "var(--gold)" }} onClick={() => loadDraft(d.id)}>Load</button>
                      <button className="ta-link-btn" style={{ fontSize: 10, color: "var(--red)" }} onClick={() => deleteDraft(d.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* What you're about to do */}
      <div style={{ padding: "14px 16px", background: "var(--card-bg)", border: "1px solid var(--border)", borderLeft: "3px solid var(--gold)", borderRadius: 0, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--serif)", fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
          {form.submissionType === "affirmation"
            ? "You're affirming an accurate headline for the public record."
            : "You're correcting a misleading headline and submitting it for jury review."}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6 }}>
          {form.submissionType === "affirmation"
            ? "Identify an accurate headline, provide your evidence, and submit. Fellow citizens will verify your affirmation."
            : "Identify the article, propose a truthful replacement, explain your reasoning, and submit. A jury of fellow citizens will review your correction."}
        </div>
      </div>

      {user && hasActiveDeceptionPenalty(user) && <div style={{ padding: 10, background: "rgba(196,74,58,0.09)", border: "1.5px solid #991B1B", borderRadius: 0, marginBottom: 12, fontSize: 12, color: "var(--red)", lineHeight: 1.6 }}><strong>Deception penalty active</strong> — {deceptionPenaltyRemaining(user)} days remaining. You may still submit corrections. Accurate work during this period rebuilds your reputation.</div>}

      {/* DI Status Banner */}
      {user && isDIUser(user) && <div style={{ padding: 12, background: "var(--card-bg)", border: "1.5px solid #4F46E5", borderRadius: 0, marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}><Icon name="robot" size={14} /> AI Agent</div>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
          Partner: <strong>@{user.diPartner}</strong> · {!user.diApproved ? <span style={{ color: "var(--red)" }}>Awaiting partner approval — submissions disabled</span> : "Approved"}
          {activeOrg && user.diApproved && <span> · Limit: {getDISubmissionLimit(activeOrg)}/day in this Assembly</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 4 }}>Your submissions will be flagged as AI-generated and require partner pre-approval before entering jury review.</div>
      </div>}
      {user && activeOrg && (() => {
        const tp = getTrustedProgress(user, user.orgId);
        if (tp.isTrusted) return <div style={{ padding: 10, background: "rgba(74,158,85,0.09)", border: "1.5px solid #059669", borderRadius: 0, marginBottom: 12, fontSize: 12, color: "var(--green)", lineHeight: 1.6, display: "flex", alignItems: "center", gap: 4 }}><Icon name="trust-badge" size={14} /> <strong>Trusted Contributor</strong> in {activeOrg.name} — your submissions skip jury review and go straight to approved. Still disputable by any member.</div>;
        if (tp.current > 0) return <div style={{ padding: 10, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginBottom: 12, fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6 }}>Trusted Contributor progress in {activeOrg.name}: <strong>{tp.current}/{tp.needed}</strong> consecutive approvals. {tp.needed - tp.current} more to skip jury review.</div>;
        return null;
      })()}

      {/* Submission Type Toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 0, overflow: "hidden", border: "1px solid var(--border)" }}>
        <button onClick={() => setForm({ ...form, submissionType: "correction" })} style={{
          flex: 1, padding: "8px", fontSize: 10, letterSpacing: 1, textAlign: "center", cursor: "pointer", fontFamily: "var(--mono)", fontWeight: 700, textTransform: "uppercase",
          background: form.submissionType === "correction" ? "rgba(196,74,58,0.13)" : "transparent",
          border: form.submissionType === "correction" ? "1.5px solid #c44a3a" : "1.5px solid var(--border)",
          color: form.submissionType === "correction" ? "#c44a3a" : "var(--text-muted)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="correction" size={42} /> Correction</div>
          <div style={{ fontSize: 8, fontWeight: 400, marginTop: 2, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>Correct something false or misleading</div>
        </button>
        <button onClick={() => setForm({ ...form, submissionType: "affirmation" })} style={{
          flex: 1, padding: "8px", fontSize: 10, letterSpacing: 1, textAlign: "center", cursor: "pointer", fontFamily: "var(--mono)", fontWeight: 700, textTransform: "uppercase",
          background: form.submissionType === "affirmation" ? "rgba(74,158,85,0.07)" : "transparent",
          border: form.submissionType === "affirmation" ? "1.5px solid rgba(74,158,85,0.27)" : "1.5px solid var(--border)",
          color: form.submissionType === "affirmation" ? "#4a9e55" : "var(--text-muted)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="affirmation" size={42} /> Affirmation</div>
          <div style={{ fontSize: 8, fontWeight: 400, marginTop: 2, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>Lend weight and evidence to confirm something true</div>
        </button>
      </div>

      {/* Anonymous user assembly notice */}
      {!user && <div style={{ marginBottom: 14, padding: 10, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 4 }}>Assembly: The General Public</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Join more assemblies after registration to submit corrections to specialized groups.</div>
      </div>}
      {/* Org picker — multi-select */}
      {user && myOrgs.length > 1 && <div style={{ marginBottom: 14, padding: 10, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 6 }}>Submit to assemblies: <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(select one or more)</span></div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => { const sel = selectedOrgIds.includes(o.id); return <button key={o.id} onClick={() => toggleOrg(o.id)} style={{ padding: "3px 7px", fontSize: 8, fontFamily: "var(--mono)", border: sel ? "1px solid var(--gold)" : "1px solid var(--border)", background: sel ? "var(--gold)" : "transparent", color: sel ? "var(--bg)" : "var(--text-muted)", borderRadius: 0, cursor: "pointer", fontWeight: sel ? 700 : 400, display: "inline-flex", alignItems: "center", gap: 3 }}>{sel && "+ "}{o.name}</button>; })}
        </div>
      </div>}
      {error && <div className="ta-error">{error}</div>}
      {success && <div className="ta-success">{success}</div>}

      {/* ── STEP 1: The Article ── */}
      <div className="ta-card" style={{ marginBottom: 2, borderBottom: "none", borderRadius: "2px 2px 0 0" }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 1 ? 0 : 1 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--gold)", flexShrink: 0, minWidth: 20 }}>1</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, color: "var(--text)" }}>{platform?.section1Title || "The article"}</div>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", transform: form._step === 1 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 1 && <div style={{ marginTop: 12 }}>
          {/* Platform badge */}
          {platform && <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", background: "rgba(184,150,62,0.1)", border: "1px solid rgba(184,150,62,0.3)", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600, marginBottom: 12 }}>
            {platform.label}
            <span style={{ fontSize: 7, padding: "1px 4px", background: "var(--gold)", color: "var(--bg)", fontWeight: 700 }}>{platform.template.toUpperCase()}</span>
          </div>}
          <EducationHelper storageKey="section1">Identify the content you want to correct. The more accurately you describe the original, the easier it is for jurors to verify.</EducationHelper>
          {/* Jury grace period notice (audio/podcast) */}
          {platform?.juryGracePeriod && <div style={{ padding: "12px 14px", background: "rgba(212,133,10,0.08)", border: "1.5px solid #D4850A", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.5px", fontWeight: 700, color: "#D4850A", marginBottom: 4 }}>{platform.juryGracePeriod.label}</div>
            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>{platform.juryGracePeriod.reason} Jury window: <strong>{platform.juryGracePeriod.days}</strong>.</div>
          </div>}
          <div className="ta-field">
            <label>{platform ? "URL *" : "Article URL *"}</label>
            <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              <input value={form.url} onChange={e => handleUrlChange(e.target.value)} onBlur={() => { if (form.url.trim() && /^https?:\/\/.+\..+/.test(form.url.trim())) importContent(form.url); }} placeholder="https://..." maxLength={2000} style={{ flex: 1 }} />
              <button type="button" disabled={importing || !form.url.trim()} onClick={() => importContent(form.url)} style={{
                padding: "0 12px", fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600,
                background: importing ? "var(--card-bg)" : "#EFF6FF", color: importing ? "#94A3B8" : "var(--gold)",
                border: "1.5px solid", borderColor: importing ? "var(--border)" : "var(--gold)",
                borderRadius: 0, cursor: importing ? "default" : "pointer", whiteSpace: "nowrap",
              }}>{importing ? "Importing..." : "Import"}</button>
            </div>
            {importMsg && <div style={{ fontSize: 11, marginTop: 4, color: importMsg.includes("Imported") ? "#059669" : importMsg.includes("skipped") ? "#64748B" : "#DC2626" }}>{importMsg}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ta-field"><label>{platform?.headlineLabel || "Original Headline *"}</label>
              {platform?.headlineMultiline
                ? <textarea value={form.originalHeadline} onChange={e => setForm({ ...form, originalHeadline: e.target.value })} placeholder={platform?.template === "shortform" ? `Paste the full ${(platform?.contentUnit || "post").toLowerCase()} text` : "The headline as published"} maxLength={500} rows={3} />
                : <input value={form.originalHeadline} onChange={e => setForm({ ...form, originalHeadline: e.target.value })} placeholder={platform?.template === "product" ? "Full product name as listed" : "The headline as published"} maxLength={500} />}
            </div>
            {platform?.showSubtitle && <div className="ta-field"><label>{platform.subtitleLabel || "Subtitle (optional)"}</label><input value={form.subtitle || ""} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="Subtitle if present" maxLength={500} /></div>}
            <div className="ta-field"><label>{platform?.authorLabel || "Author(s)"} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6, minHeight: 24 }}>
                {authors.map((a, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, fontSize: 11, color: "var(--text)" }}>
                    {a}
                    <span onClick={() => setAuthors(authors.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "var(--red)", fontSize: 13, lineHeight: 1 }}>&times;</span>
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
              }} placeholder={platform?.authorPlaceholder || "Type author name and press Enter"} maxLength={200} />}
            </div>
          </div>
          {/* Template-specific extra fields */}
          {platform?.extraFields === "podcastFields" && <>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>SHOW / PODCAST NAME *</label><input value={podcastShowName} onChange={e => setPodcastShowName(e.target.value)} placeholder='e.g. "The Joe Rogan Experience"' /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>The show name, distinct from the episode title</div></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>GUEST / SPEAKER (IF NOT THE HOST)</label><input value={podcastGuest} onChange={e => setPodcastGuest(e.target.value)} placeholder="Who made the specific claim being corrected" /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>Podcasts often have guests — identify who said it</div></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>APPROXIMATE EPISODE DURATION</label><input value={episodeDuration} onChange={e => setEpisodeDuration(e.target.value)} placeholder="e.g. 2:34:00" style={{ width: 140 }} /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>Helps jurors gauge the review commitment</div></div>
          </>}
          {platform?.extraFields === "productFields" && <>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>MARKETPLACE / RETAILER</label><input value={productMarketplace} onChange={e => setProductMarketplace(e.target.value)} placeholder='e.g. "Amazon", "Walmart.com", "Etsy"' /></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>CLAIM CATEGORY</label>
              <select value={productClaimCategory} onChange={e => setProductClaimCategory(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 12, color: productClaimCategory ? "var(--text)" : "var(--text-muted)" }}>
                <option value="">Select claim type...</option>
                {(CLAIM_CATEGORIES || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>Helps assemblies prioritize — safety claims are more urgent</div>
            </div>
            {productClaimCategory === "Safety" && <div style={{ padding: "8px 12px", background: "rgba(192,57,43,0.08)", border: "1px solid #C0392B", fontSize: 12, color: "var(--text)", lineHeight: 1.5, marginBottom: 10 }}><strong style={{ color: "#C0392B" }}>Safety claim:</strong> False safety claims may endanger consumers. Consider also reporting to CPSC, FDA, or FTC.</div>}
          </>}
          {platform?.extraFields === "publication" && <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>PUBLICATION NAME</label><input value={publicationName} onChange={e => setPublicationName(e.target.value)} placeholder='e.g. "Astral Codex Ten"' /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>The publication name, distinct from the author</div></div>}
          {platform?.extraFields === "referencedLink" && <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>REFERENCED LINK (OPTIONAL)</label><input value={referencedLink} onChange={e => setReferencedLink(e.target.value)} placeholder="URL the note is commenting on" /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>If this note is reacting to another URL, the real claim may live there</div></div>}
          {platform?.extraFields === "threadPosition" && <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>THREAD POSITION (OPTIONAL)</label><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input value={threadPosition} onChange={e => setThreadPosition(e.target.value)} placeholder="e.g. 3 of 7" style={{ width: 100 }} /><span style={{ fontSize: 9, color: "var(--text-muted)" }}>Post N of M in thread</span></div></div>}
          {platform?.extraFields === "titleCompany" && <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>AUTHOR'S TITLE / COMPANY (OPTIONAL)</label><input value={form.titleCompany || ""} onChange={e => setForm({ ...form, titleCompany: e.target.value })} placeholder='e.g. "VP of Engineering at Acme Corp"' /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>LinkedIn claims often carry implicit authority</div></div>}
          {platform?.extraFields === "privateWarning" && <div style={{ padding: "8px 12px", background: "rgba(184,150,62,0.08)", border: "1px solid var(--gold)", fontSize: 12, color: "var(--text)", lineHeight: 1.5, marginBottom: 10 }}><strong style={{ color: "var(--gold)" }}>Note:</strong> This post may be private or restricted. If auto-import fails, paste the content manually. Jurors will need to verify access independently.</div>}
          {platform?.extraFields === "timestamp" && <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>TIMESTAMP (OPTIONAL)</label><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input value={claimTimestamp} onChange={e => setClaimTimestamp(e.target.value)} placeholder="e.g. 14:32" style={{ width: 100 }} /><span style={{ fontSize: 9, color: "var(--text-muted)" }}>MM:SS — helps jurors verify the claim</span></div></div>}
        </div>}
      </div>

      {/* ── STEP 2: Your Case ── */}
      <div className="ta-card" style={{ marginBottom: 2, borderBottom: "none", borderRadius: 0 }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 2 ? 0 : 2 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--gold)", flexShrink: 0, minWidth: 20 }}>2</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, color: "var(--text)" }}>{platform?.section2Title || "Rewrite the headline"}</div>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", transform: form._step === 2 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 2 && <div style={{ marginTop: 12 }}>
          <EducationHelper storageKey="section2">Propose your correction and explain why the original is wrong. Strong corrections cite specific evidence.</EducationHelper>
          {form.submissionType === "correction" && <div className="ta-field"><label>{platform?.replacementLabel || "Proposed Replacement *"} <span style={{ fontWeight: 400, color: "var(--red)" }}>— the red pen</span></label>
            {platform?.headlineMultiline
              ? <textarea value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} style={{ borderColor: "var(--red)" }} placeholder={platform?.template === "shortform" ? `Your corrected version of the ${(platform?.contentUnit || "post").toLowerCase()}` : "Your corrected headline"} maxLength={500} rows={3} />
              : <input value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} style={{ borderColor: "var(--red)" }} placeholder={platform?.template === "product" ? "What the listing should actually say" : "Your corrected headline"} maxLength={500} />}
          </div>}
          {form.submissionType === "affirmation" && <div style={{ padding: 10, background: "rgba(74,158,85,0.09)", border: "1px solid #05966940", borderRadius: 0, marginBottom: 12, fontSize: 12, color: "var(--green)" }}>✓ You are affirming this headline is <strong>accurate</strong>. Provide your reasoning and evidence below.</div>}
          <div className="ta-field"><label>Reasoning *</label><textarea value={form.reasoning} onChange={e => setForm({ ...form, reasoning: e.target.value })} rows={3} placeholder={form.submissionType === "affirmation" ? "Why is this headline accurate? What evidence supports it?" : "Why is the original misleading?"} maxLength={2000} /></div>
          <EvidenceFields evidence={evidenceUrls} onChange={setEvidenceUrls} />
          <div style={{ padding: 10, background: "rgba(74,158,85,0.09)", border: "1px solid #05966940", borderRadius: 0, marginTop: 10, fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
            <strong style={{ color: "var(--green)" }}>Tip:</strong> Stick to what you can prove. Corrections backed by evidence and clear reasoning survive review. Jurors respect intellectual honesty more than false confidence.
          </div>
        </div>}
      </div>

      {/* ── STEP 3: Template-specific content section ── */}
      {/* Hidden for shortform platforms that have no section 3 */}
      {(platform?.section3Title || !platform) && <div className="ta-card" style={{ marginBottom: 2, borderBottom: "none", borderRadius: 0 }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 3 ? 0 : 3 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--gold)", flexShrink: 0, minWidth: 20 }}>3</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, color: "var(--text)" }}>{platform?.section3Title || "Edit the article"} {platform?.section3Subtitle ? <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 9, letterSpacing: 1 }}>{platform.section3Subtitle}</span> : <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 9, letterSpacing: 1 }}>up to 20</span>}</div>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", transform: form._step === 3 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 3 && <div style={{ marginTop: 12 }}>
          <EducationHelper storageKey="section3">{platform?.template === "article" ? "You can edit specific passages in the article body. The system finds each passage by exact text match." : platform?.template === "audio" ? "Audio content has no text for jurors to scan. Your transcript excerpt and timestamp are the primary evidence." : platform?.template === "product" ? "Flag each misleading claim separately so jurors can evaluate them independently." : "Describe the claims you want to correct with as much specificity as possible."}</EducationHelper>
          <p style={{ fontSize: 12, color: "var(--text-sec)", marginBottom: 10, lineHeight: 1.6 }}>{platform?.section3Desc || 'Copy the exact text from the article you want corrected into "Original Text." The system uses exact text matching to locate each passage. Up to 20 edits per article.'}</p>
          {/* Article template: standard inline edits */}
          {(!platform || platform.template === "article") && <InlineEditsForm edits={inlineEdits} onChange={setInlineEdits} />}
          {/* Video template: spoken claims with optional timestamp */}
          {platform?.template === "video" && <div style={{ border: "1px solid var(--border)", padding: 14, marginBottom: 10 }}>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>{platform.editOrigLabel || "TRANSCRIPT EXCERPT"}</label><textarea value={transcriptExcerpt} onChange={e => setTranscriptExcerpt(e.target.value)} placeholder={platform.editOrigPlaceholder || "What was said or shown"} rows={3} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 12, resize: "vertical" }} /></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>TIMESTAMP (OPTIONAL)</label><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input value={claimTimestamp} onChange={e => setClaimTimestamp(e.target.value)} placeholder="e.g. 14:32" style={{ width: 100, padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 12 }} /><span style={{ fontSize: 9, color: "var(--text-muted)" }}>MM:SS — helps jurors verify</span></div></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>{platform.editReplLabel || "THE TRUTH"} <span style={{ color: "var(--red)" }}>— RED PEN</span></label><textarea value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} placeholder="The factual truth" rows={2} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--red)", background: "var(--card-bg)", fontSize: 12, resize: "vertical" }} /></div>
          </div>}
          {/* Audio template: transcript-driven claims with REQUIRED timestamp */}
          {platform?.template === "audio" && <div style={{ border: "1px solid var(--border)", padding: 14, marginBottom: 10 }}>
            <div style={{ padding: "8px 12px", background: "rgba(212,133,10,0.08)", border: "1px solid #D4850A", marginBottom: 12, fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}><strong style={{ color: "#D4850A", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: 1 }}>JURORS MUST LISTEN:</strong> There is no text for jurors to scan — they must listen to the audio at your timestamp. Provide exact words and a precise timestamp.</div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>TIMESTAMP * (REQUIRED FOR AUDIO)</label><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input value={claimTimestamp} onChange={e => setClaimTimestamp(e.target.value)} placeholder="e.g. 14:32" style={{ width: 100, padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 12 }} /><span style={{ fontSize: 9, color: "var(--text)" }}>MM:SS — required for audio claims</span></div></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>{platform.editOrigLabel}</label><textarea value={transcriptExcerpt} onChange={e => setTranscriptExcerpt(e.target.value)} placeholder={platform.editOrigPlaceholder} rows={4} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 12, resize: "vertical" }} /><div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>Transcribe the exact words. Jurors will listen and compare.</div></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>{platform.editReplLabel || "THE TRUTH"} <span style={{ color: "var(--red)" }}>— RED PEN</span></label><textarea value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} placeholder="The factual truth" rows={2} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--red)", background: "var(--card-bg)", fontSize: 12, resize: "vertical" }} /></div>
          </div>}
          {/* Product template: claim flagging with location toggle */}
          {platform?.template === "product" && <div style={{ border: "1px solid var(--border)", padding: 14, marginBottom: 10 }}>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>{platform.editOrigLabel}</label><textarea value={transcriptExcerpt} onChange={e => setTranscriptExcerpt(e.target.value)} placeholder={platform.editOrigPlaceholder} rows={2} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 12, resize: "vertical" }} /></div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>WHERE ON THE LISTING</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 0, marginBottom: 8 }}>
                {(LISTING_LOCATIONS || []).map((loc, i, arr) => <button key={loc} onClick={() => setClaimLocation(loc)} style={{ padding: "5px 8px", fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.5px", background: claimLocation === loc ? "var(--gold)" : "transparent", color: claimLocation === loc ? "var(--bg)" : "var(--text-muted)", border: "1px solid var(--border)", borderRight: i < arr.length - 1 ? "none" : undefined, cursor: "pointer" }}>{loc}</button>)}
              </div>
            </div>
            <div className="ta-field"><label style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>{platform.editReplLabel || "THE TRUTH"} <span style={{ color: "var(--red)" }}>— RED PEN</span></label><textarea value={form.replacement} onChange={e => setForm({ ...form, replacement: e.target.value })} placeholder="What the truth actually is" rows={2} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--red)", background: "var(--card-bg)", fontSize: 12, resize: "vertical" }} /></div>
          </div>}
        </div>}
      </div>}

      {/* ── STEP 4: Assembly Vault (optional) ── */}
      <div className="ta-card" style={{ borderRadius: "0 0 2px 2px" }}>
        <button onClick={() => setForm(f => ({ ...f, _step: f._step === 4 ? 0 : 4 }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--gold)", flexShrink: 0, minWidth: 20 }}>4</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, color: "var(--text)" }}>Build the case <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 9, letterSpacing: 1 }}>search or create</span></div>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", transform: form._step === 4 ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
        </button>
        {form._step === 4 && <div style={{ marginTop: 12 }}>
          <EducationHelper storageKey="section4">Vault entries are reusable across submissions. A standing correction can be linked to every article that gets it wrong.</EducationHelper>
          <p style={{ fontSize: 12, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>Link existing vault entries to strengthen your correction, or propose new ones. Linked entries are voted on by jurors — each time one survives review, it gains reputation.</p>

          {/* Linked entries chips */}
          {linkedEntries.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 6 }}>Linked ({linkedEntries.length})</div>
            {linkedEntries.map(e => {
              const tc = { correction: ["vault", "#059669", "#ECFDF5"], argument: ["dispute", "#0D9488", "#F0FDFA"], belief: ["jury", "#7C3AED", "#F3E8F9"] }[e.type] || ["vault", "#475569", "var(--card-bg)"];
              return <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: tc[2], border: `1px solid ${tc[1]}40`, borderRadius: 0, marginBottom: 6 }}>
                <Icon name={tc[0]} size={14} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700, marginBottom: 2 }}>{e.type}{e.survivalCount > 0 ? ` · survived ${e.survivalCount}` : ""}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</div>
                </div>
                <button onClick={() => unlinkEntry(e.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>×</button>
              </div>;
            })}
          </div>}

          {/* Search to link existing submissions */}
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setShowSubSearch(s => !s)} style={{ background: showSubSearch ? "var(--gold)" : "#F9FAFB", color: showSubSearch ? "#fff" : "var(--text)", border: "1px solid var(--border)", padding: "6px 12px", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", borderRadius: 0, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              {showSubSearch ? "Close" : "Link Existing Submission"}
            </button>
            {showSubSearch && <div style={{ marginTop: 4, padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
              <input value={subSearch} onChange={e => searchSubmissions(e.target.value)} placeholder="Search approved submissions by headline or URL..." style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, fontFamily: "inherit", boxSizing: "border-box" }} />
              {subResults.length > 0 && <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
                {subResults.map(s => {
                  const already = linkedSubs.find(ls => ls.id === s.id);
                  return <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", opacity: already ? 0.5 : 1, cursor: already ? "default" : "pointer" }} onClick={() => !already && linkSub(s)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.originalHeadline}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.orgName} · {new Date(s.createdAt).toLocaleDateString()}</div>
                    </div>
                    {already ? <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--green)", flexShrink: 0, marginLeft: 8 }}>✓ linked</span> : <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)", flexShrink: 0, marginLeft: 8 }}>+ link</span>}
                  </div>;
                })}
              </div>}
              {subSearch.trim() && subResults.length === 0 && <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-sec)", fontStyle: "italic" }}>No matching submissions found.</div>}
            </div>}
            {linkedSubs.length > 0 && <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 4 }}>Linked Submissions ({linkedSubs.length})</div>
              {linkedSubs.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--card-bg)", border: "1px solid #BFDBFE", borderRadius: 0, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.originalHeadline}</div>
                  </div>
                  <button onClick={() => unlinkSub(s.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>}
          </div>

          {/* Search to link existing vault entries */}
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setShowVaultSearch(s => !s)} style={{ background: showVaultSearch ? "var(--gold)" : "#F9FAFB", color: showVaultSearch ? "#fff" : "var(--text)", border: "1px solid var(--border)", padding: "6px 12px", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", borderRadius: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {showVaultSearch ? "Close Search" : "Link Existing Vault Entry"}
            </button>
            {showVaultSearch && <div style={{ marginTop: 10, padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
              <input value={vaultSearch} onChange={e => searchVault(e.target.value)} placeholder="Search your assembly's vault..." style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, fontFamily: "inherit", boxSizing: "border-box" }} />
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Type to search corrections, arguments, and beliefs in {activeOrg?.name || "your assembly"}</div>
              {vaultResults.length > 0 && <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
                {vaultResults.map(r => {
                  const already = linkedEntries.find(e => e.id === r.id);
                  const tc = { correction: ["vault", "#059669"], argument: ["dispute", "#0D9488"], belief: ["jury", "#7C3AED"] }[r.type] || ["vault", "#475569"];
                  return <div key={r.id} onClick={() => !already && linkEntry(r)} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", cursor: already ? "default" : "pointer", opacity: already ? 0.5 : 1, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Icon name={tc[0]} size={14} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700 }}>{r.type}{r.survivalCount > 0 ? ` · survived ${r.survivalCount}` : ""}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>{r.label}</div>
                    </div>
                    {already ? <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--green)" }}>✓ linked</span> : <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)" }}>+ link</span>}
                  </div>;
                })}
              </div>}
              {vaultSearch.trim() && vaultResults.length === 0 && <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-sec)", fontStyle: "italic" }}>No matching entries found.</div>}
            </div>}
          </div>

          {/* Propose new entries — supports multiples */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-sec)", padding: "6px 0" }}>+ Propose New Vault Entries</summary>
            <div style={{ marginTop: 10 }}>
              {/* Standing Corrections — multiple */}
              <div style={{ marginBottom: 12, padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><Icon name="vault" size={42} /> Standing Corrections <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>— reusable facts</span></div>
                {standingCorrections.map((sc, i) => (
                  <div key={i} style={{ marginBottom: 8, padding: i > 0 ? "8px 0 0 0" : 0, borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                    {standingCorrections.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>#{i + 1}</span>
                      <button onClick={() => setStandingCorrections(standingCorrections.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <StandingCorrectionInput value={sc} onChange={v => { const next = [...standingCorrections]; next[i] = v; setStandingCorrections(next); setStandingCorrection(next[0] || { assertion: "", evidence: "" }); }} />
                  </div>
                ))}
                <button onClick={() => setStandingCorrections([...standingCorrections, { assertion: "", evidence: "" }])} style={{ background: "none", border: "1px dashed var(--border)", color: "var(--green)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 0, width: "100%", marginTop: 4 }}>+ Add another standing correction</button>
              </div>

              {/* Arguments — multiple */}
              <div style={{ marginBottom: 12, padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><Icon name="dispute" size={42} /> Arguments <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--text-sec)" }}>— reusable rhetorical or logical tools</span></div>
                {submitArgs.map((arg, i) => (
                  <div key={i} style={{ marginBottom: 8, position: "relative" }}>
                    {submitArgs.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>#{i + 1}</span>
                      <button onClick={() => { const next = submitArgs.filter((_, j) => j !== i); setSubmitArgs(next); setSubmitArg(next[0] || ""); }} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <textarea className="ta-field" value={arg} onChange={e => { const next = [...submitArgs]; next[i] = e.target.value; setSubmitArgs(next); setSubmitArg(next[0] || ""); }} rows={2} placeholder='e.g. "When an article cites unnamed experts, the absence of names IS the story."' style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                ))}
                <button onClick={() => setSubmitArgs([...submitArgs, ""])} style={{ background: "none", border: "1px dashed var(--border)", color: "var(--gold)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 0, width: "100%", marginTop: 4 }}>+ Add another argument</button>
              </div>

              {/* Beliefs — multiple */}
              <div style={{ marginBottom: 12, padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><Icon name="jury" size={42} /> Foundational Beliefs <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--text-sec)" }}>— axioms your Assembly holds</span></div>
                {submitBeliefs.map((belief, i) => (
                  <div key={i} style={{ marginBottom: 8, position: "relative" }}>
                    {submitBeliefs.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>#{i + 1}</span>
                      <button onClick={() => { const next = submitBeliefs.filter((_, j) => j !== i); setSubmitBeliefs(next); setSubmitBelief(next[0] || ""); }} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <textarea value={belief} onChange={e => { const next = [...submitBeliefs]; next[i] = e.target.value; setSubmitBeliefs(next); setSubmitBelief(next[0] || ""); }} rows={2} placeholder='e.g. "Every person deserves to make informed decisions based on truthful reporting."' style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                ))}
                <button onClick={() => setSubmitBeliefs([...submitBeliefs, ""])} style={{ background: "none", border: "1px dashed var(--border)", color: "#7C3AED", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 0, width: "100%", marginTop: 4 }}>+ Add another belief</button>
              </div>

              {/* Translations — multiple */}
              <div style={{ padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><Icon name="dispute" size={42} /> Translations <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--text-sec)" }}>— strip spin, jargon, or propaganda from language</span></div>
                <div style={{ fontSize: 11, color: "var(--text-sec)", marginBottom: 8, lineHeight: 1.5 }}>Plain-language replacements. <span style={{ color: "var(--gold)", fontWeight: 600 }}>Assembly-wide — every citizen sees these wherever the original terms appear.</span></div>
                {submitTranslations.map((tr, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                    {submitTranslations.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>#{i + 1}</span>
                      <button onClick={() => { const next = submitTranslations.filter((_, j) => j !== i); setSubmitTranslations(next); setSubmitTranslation(next[0] || { original: "", translated: "", type: "clarity" }); }} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: 0 }}>&times; Remove</button>
                    </div>}
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: 1, marginBottom: 3 }}>ORIGINAL PHRASE</div>
                      <input value={tr.original} onChange={e => { const next = [...submitTranslations]; next[i] = { ...next[i], original: e.target.value }; setSubmitTranslations(next); setSubmitTranslation(next[0]); }} placeholder='e.g. "Enhanced interrogation techniques"' style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--bg)", fontSize: 12, borderRadius: 0, fontFamily: "inherit", color: "var(--text)", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: 1, marginBottom: 3 }}>PLAIN-LANGUAGE REPLACEMENT</div>
                      <input value={tr.translated} onChange={e => { const next = [...submitTranslations]; next[i] = { ...next[i], translated: e.target.value }; setSubmitTranslations(next); setSubmitTranslation(next[0]); }} placeholder='e.g. "Torture"' style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--bg)", fontSize: 12, borderRadius: 0, fontFamily: "inherit", color: "var(--text)", boxSizing: "border-box" }} />
                    </div>
                    <select value={tr.type} onChange={e => { const next = [...submitTranslations]; next[i] = { ...next[i], type: e.target.value }; setSubmitTranslations(next); setSubmitTranslation(next[0]); }} style={{ padding: "6px 8px", border: "1px solid var(--border)", background: "var(--bg)", fontSize: 11, borderRadius: 0, fontFamily: "var(--mono)", color: "var(--text)" }}>
                      <option value="clarity">Clarity — strip jargon</option>
                      <option value="propaganda">Anti-Propaganda — rename spin</option>
                      <option value="euphemism">Euphemism — call it what it is</option>
                      <option value="satirical">Satirical — approved humor</option>
                    </select>
                  </div>
                ))}
                <button onClick={() => setSubmitTranslations([...submitTranslations, { original: "", translated: "", type: "clarity" }])} style={{ background: "none", border: "1px dashed var(--border)", color: "var(--gold)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", padding: "4px 10px", borderRadius: 0, width: "100%", marginTop: 4 }}>+ Add another translation</button>
              </div>
            </div>
          </details>
        </div>}
      </div>

      {/* Final Confirmation Modal with Preview */}
      {showConfirm && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowConfirm(false)}>
          <div style={{ background: "var(--card-bg)", borderRadius: 0, padding: 0, maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Confirm Submission</div>
              <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, lineHeight: 1.5 }}>
                This action is final. Once submitted, your correction enters jury review and cannot be edited or withdrawn.
              </div>
              {selectedOrgIds.length > 0 && <div style={{ fontSize: 11, color: "var(--text-sec)", marginTop: 4 }}>Submitting to: <strong style={{ color: "var(--gold)" }}>{myOrgs.filter(o => selectedOrgIds.includes(o.id)).map(o => o.name).join(", ")}</strong></div>}
            </div>

            {/* Preview */}
            <div style={{ padding: "14px 20px", background: "#f8f8f6", fontFamily: "Georgia, serif" }}>
              <div style={{ fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: "#999", marginBottom: 6, fontFamily: "sans-serif", fontWeight: 600 }}>Preview</div>
              {form.originalHeadline && <div style={{ fontSize: 14, fontWeight: 700, color: "#999", textDecoration: form.replacement ? "line-through" : "none", marginBottom: 2 }}>{form.originalHeadline}</div>}
              {form.replacement && <div style={{ fontSize: 14, fontWeight: 700, color: "#c44a3a", marginBottom: 4 }}>{form.replacement}</div>}
              {form.reasoning && <div style={{ fontSize: 11, color: "#333", lineHeight: 1.6, marginBottom: 8 }}>{form.reasoning}</div>}
              {inlineEdits.filter(e => e.original.trim()).length > 0 && <div style={{ fontSize: 10, color: "#666", fontFamily: "sans-serif" }}>+ {inlineEdits.filter(e => e.original.trim()).length} in-line edit{inlineEdits.filter(e => e.original.trim()).length > 1 ? "s" : ""}</div>}
              {evidenceUrls.filter(e => e.url.trim()).length > 0 && <div style={{ fontSize: 10, color: "#666", fontFamily: "sans-serif" }}>{evidenceUrls.filter(e => e.url.trim()).length} evidence source{evidenceUrls.filter(e => e.url.trim()).length > 1 ? "s" : ""}</div>}

              {/* Vault artifacts summary */}
              {(standingCorrections.some(sc => sc.assertion.trim()) || submitArgs.some(a => a.trim()) || submitBeliefs.some(b => b.trim()) || submitTranslations.some(t => t.original.trim() && t.translated.trim()) || linkedEntries.length > 0) && (
                <div style={{ borderTop: "1px solid #ddd", marginTop: 8, paddingTop: 8, fontFamily: "sans-serif" }}>
                  <div style={{ fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: "#999", marginBottom: 4 }}>Vault artifacts</div>
                  {standingCorrections.filter(sc => sc.assertion.trim()).map((sc, i) => <div key={`sc-${i}`} style={{ fontSize: 10, color: "#333", marginBottom: 2 }}>Fact: {sc.assertion}</div>)}
                  {submitArgs.filter(a => a.trim()).map((a, i) => <div key={`a-${i}`} style={{ fontSize: 10, color: "#333", marginBottom: 2 }}>Argument: {a.substring(0, 80)}{a.length > 80 ? "..." : ""}</div>)}
                  {submitBeliefs.filter(b => b.trim()).map((b, i) => <div key={`b-${i}`} style={{ fontSize: 10, color: "#333", marginBottom: 2 }}>Belief: {b.substring(0, 80)}{b.length > 80 ? "..." : ""}</div>)}
                  {submitTranslations.filter(t => t.original.trim() && t.translated.trim()).map((t, i) => <div key={`t-${i}`} style={{ fontSize: 10, color: "#333", marginBottom: 2 }}>Translation: "{t.original}" → "{t.translated}"</div>)}
                  {linkedEntries.map(e => <div key={e.id} style={{ fontSize: 10, color: "#333", marginBottom: 2 }}>Linked {e.type}: {e.label.substring(0, 60)}{e.label.length > 60 ? "..." : ""}</div>)}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: "14px 20px", display: "flex", gap: 10, borderTop: "1px solid var(--border)" }}>
              <button className="ta-btn-primary" onClick={go} style={{ flex: 1, padding: "12px 16px", fontSize: 13 }}>{loading ? "Submitting..." : "SUBMIT — THIS IS FINAL"}</button>
              <button className="ta-btn-ghost" onClick={() => setShowConfirm(false)} style={{ padding: "12px 16px" }}>Go Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Preview Modal ── */}
      {showMobilePreview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 1000, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontWeight: 700 }}>Preview Your Submission</span>
            <div style={{ display: "flex", border: "1px solid var(--border)", cursor: "pointer" }}>
              <span onClick={() => setPreviewMode("clean")} style={{ padding: "3px 7px", fontSize: 8, letterSpacing: 1, textTransform: "uppercase", background: previewMode === "clean" ? "var(--gold)" : "transparent", color: previewMode === "clean" ? "var(--bg)" : "var(--text-muted)", fontWeight: previewMode === "clean" ? 700 : 400 }}>Clean</span>
              <span onClick={() => setPreviewMode("diff")} style={{ padding: "3px 7px", fontSize: 8, letterSpacing: 1, textTransform: "uppercase", background: previewMode === "diff" ? "var(--gold)" : "transparent", color: previewMode === "diff" ? "var(--bg)" : "var(--text-muted)", fontWeight: previewMode === "diff" ? 700 : 400 }}>Diff</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", background: "#f8f8f6", padding: "14px 16px", fontFamily: "Georgia, serif" }}>
            {(() => { let domain = ""; try { domain = new URL(form.url).hostname.replace(/^www\./, ""); } catch {} return domain; })() && (
              <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "#999", marginBottom: 6, fontFamily: "sans-serif", fontWeight: 600 }}>{(() => { try { return new URL(form.url).hostname.replace(/^www\./, ""); } catch { return ""; } })()}</div>
            )}
            {form.originalHeadline && <div style={{ fontSize: 18, fontWeight: 700, color: form.replacement ? "#999" : "#1a1a1a", textDecoration: form.replacement ? "line-through" : "none", marginBottom: 4, lineHeight: 1.3 }}>{form.originalHeadline}</div>}
            {form.replacement && <div style={{ fontSize: 18, fontWeight: 700, color: "#c44a3a", marginBottom: 6, lineHeight: 1.3 }}>{form.replacement}</div>}
            {authors.length > 0 && <div style={{ fontSize: 10, color: "#666", fontFamily: "sans-serif", marginBottom: 10 }}>By {authors.join(", ")}</div>}
            {form.reasoning && <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 12, padding: "8px 10px", borderLeft: "3px solid var(--gold)", background: "rgba(212,168,67,0.06)" }}>{form.reasoning}</div>}
            {previewParagraphs.length > 0 && previewParagraphs.map((p, i) => renderPreviewParagraph(p, i))}
            {(standingCorrections.some(sc => sc.assertion.trim()) || submitArgs.some(a => a.trim()) || submitBeliefs.some(b => b.trim()) || submitTranslations.some(t => t.original.trim() && t.translated.trim())) && (
              <div style={{ borderTop: "1px solid #ddd", paddingTop: 10, fontFamily: "sans-serif", marginTop: 14 }}>
                <div style={{ fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Trust Assembly annotations</div>
                {submitTranslations.filter(t => t.original.trim() && t.translated.trim()).map((t, i) => (
                  <div key={`t-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                    <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>TRANSLATION</div>
                    <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}><span style={{ textDecoration: "line-through", color: "#999" }}>"{t.original}"</span>{" \u2192 "}<span style={{ color: "#c44a3a" }}>"{t.translated}"</span></div>
                  </div>
                ))}
                {standingCorrections.filter(sc => sc.assertion.trim()).map((sc, i) => (
                  <div key={`sc-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                    <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>FACT</div>
                    <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{sc.assertion}</div>
                  </div>
                ))}
                {submitArgs.filter(a => a.trim()).map((a, i) => (
                  <div key={`a-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                    <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>ARGUMENT</div>
                    <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{a}</div>
                  </div>
                ))}
                {submitBeliefs.filter(b => b.trim()).map((b, i) => (
                  <div key={`b-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                    <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>BELIEF</div>
                    <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{b}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexShrink: 0 }}>
            <button className="ta-btn-ghost" onClick={() => setShowMobilePreview(false)} style={{ flex: 1, padding: "12px 16px", fontSize: 13 }}>Return to Edit</button>
            <button className="ta-btn-primary" onClick={() => { setShowMobilePreview(false); setShowConfirm(true); }} style={{ flex: 1, padding: "12px 16px", fontSize: 13 }}>Finalize Submission</button>
          </div>
        </div>
      )}

      {/* ── Submit & Save Draft Buttons ── */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button className="ta-btn-primary" onClick={() => { if (!user && onShowRegistration) { onShowRegistration(); return; } handleSubmitClick(); }} disabled={loading} style={{ flex: 1, padding: "12px 16px", fontSize: 14 }}>{loading ? "Filing..." : user ? "Submit for Review" : "Sign up to submit"}</button>
          <button onClick={saveDraft} disabled={savingDraft} style={{
            padding: "12px 16px", fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600,
            background: "rgba(212,168,67,0.09)", color: "var(--gold)", border: "1.5px solid #CA8A04",
            borderRadius: 0, cursor: savingDraft ? "default" : "pointer",
            opacity: savingDraft ? 0.6 : 1,
          }}>
            {savingDraft ? "Saving..." : "Save Draft"}
          </button>
        </div>
        {draftMsg && (
          <div style={{
            fontSize: 11, padding: "4px 8px", borderRadius: 0, marginBottom: 6,
            background: draftMsg.includes("saved") || draftMsg.includes("loaded") ? "#ECFDF5" : "#FEF2F2",
            color: draftMsg.includes("saved") || draftMsg.includes("loaded") ? "#059669" : "#DC2626",
            textAlign: "center",
          }}>{draftMsg}</div>
        )}
        <LegalDisclaimer short />
      </div>
      </div>{/* end form-side */}

      {/* ── RIGHT: ARTICLE PREVIEW (hidden on mobile) ── */}
      <div className="ta-preview-panel" style={{ flex: "0 0 340px", display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)" }}>
        <div style={{ background: "var(--bg)", padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>Article preview</span>
          <div style={{ display: "flex", border: "1px solid var(--border)", cursor: "pointer" }}>
            <span onClick={() => setPreviewMode("clean")} style={{ padding: "3px 7px", fontSize: 8, letterSpacing: 1, textTransform: "uppercase", background: previewMode === "clean" ? "var(--gold)" : "transparent", color: previewMode === "clean" ? "var(--bg)" : "var(--text-muted)", fontWeight: previewMode === "clean" ? 700 : 400 }}>Clean</span>
            <span onClick={() => setPreviewMode("diff")} style={{ padding: "3px 7px", fontSize: 8, letterSpacing: 1, textTransform: "uppercase", background: previewMode === "diff" ? "var(--gold)" : "transparent", color: previewMode === "diff" ? "var(--bg)" : "var(--text-muted)", fontWeight: previewMode === "diff" ? 700 : 400 }}>Diff</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", background: "#f8f8f6", padding: "14px 12px", fontFamily: "Georgia, serif" }}>
          {!form.originalHeadline && !form.url ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 11, fontFamily: "var(--mono)" }}>
              Import an article to see preview
            </div>
          ) : (
            <>
              {/* Section label */}
              {urlDomain && <div style={{ fontSize: 9, color: "#c44a3a", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: "sans-serif" }}>{urlDomain}</div>}

              {/* Original headline */}
              {form.originalHeadline && (
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, color: previewMode === "diff" && form.replacement ? "#999" : "#1a1a1a", textDecoration: previewMode === "diff" && form.replacement ? "line-through" : "none", marginBottom: 3 }}>
                  {form.originalHeadline}
                </div>
              )}

              {/* Corrected headline */}
              {form.replacement && (
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, color: form.submissionType === "correction" ? "#c44a3a" : "#2d6e34", marginBottom: 3 }}>
                  {previewMode === "clean" ? form.replacement : form.replacement}
                </div>
              )}

              {/* Subtitle placeholder */}
              {form.submissionType === "affirmation" && form.originalHeadline && (
                <div style={{ fontSize: 11, color: "#666", fontStyle: "italic", marginBottom: 4 }}>Affirmed as accurate</div>
              )}

              {/* Author byline */}
              {(authors.length > 0 || form.author) && (
                <div style={{ fontSize: 10, color: "#999", marginBottom: 12, fontFamily: "sans-serif" }}>
                  By {authors.length > 0 ? authors.join(", ") : form.author}{urlDomain ? ` · ${urlDomain}` : ""}
                </div>
              )}

              {/* Body text with inline edit diffs */}
              {previewParagraphs.length > 0 ? (
                previewParagraphs.map((p, i) => renderPreviewParagraph(p, i))
              ) : (
                <div style={{ fontSize: 10, color: "#bbb", fontFamily: "sans-serif", fontStyle: "italic", marginTop: 8 }}>
                  {form.url ? "Article body text will appear here after import." : ""}
                </div>
              )}

              {/* Vault annotations section — all artifact types */}
              {(standingCorrections.some(sc => sc.assertion.trim()) || submitArgs.some(a => a.trim()) || submitBeliefs.some(b => b.trim()) || submitTranslations.some(t => t.original.trim() && t.translated.trim()) || linkedEntries.length > 0) && (
                <div style={{ borderTop: "1px solid #ddd", paddingTop: 10, fontFamily: "sans-serif", marginTop: 14 }}>
                  <div style={{ fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Trust Assembly annotations</div>

                  {submitTranslations.filter(t => t.original.trim() && t.translated.trim()).map((t, i) => (
                    <div key={`t-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                      <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>TRANSLATION</div>
                      <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>
                        <span style={{ textDecoration: "line-through", color: "#999" }}>"{t.original}"</span>
                        {" → "}
                        <span style={{ color: "#2d6e34" }}>"{t.translated}"</span>
                      </div>
                    </div>
                  ))}

                  {standingCorrections.filter(sc => sc.assertion.trim()).map((sc, i) => (
                    <div key={`sc-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                      <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>FACT</div>
                      <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{sc.assertion}</div>
                    </div>
                  ))}

                  {submitArgs.filter(a => a.trim()).map((a, i) => (
                    <div key={`a-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                      <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>ARGUMENT</div>
                      <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{a}</div>
                    </div>
                  ))}

                  {submitBeliefs.filter(b => b.trim()).map((b, i) => (
                    <div key={`b-${i}`} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                      <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>BELIEF</div>
                      <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{b}</div>
                    </div>
                  ))}

                  {linkedEntries.map(e => (
                    <div key={e.id} style={{ background: "#f0f0ea", border: "1px solid #ddd", padding: "6px 8px", marginBottom: 4 }}>
                      <div style={{ fontSize: 7, color: "#b8963e", letterSpacing: 1, fontWeight: 600 }}>{e.type.toUpperCase()} (LINKED)</div>
                      <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{e.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>{/* end split */}
    </div>
  );
}
