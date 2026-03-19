import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SK, ADMIN_USERNAME, HERO_SLIDES, CREST_IMG } from "./lib/constants";
import { sG } from "./lib/storage";
import { computeProfile } from "./lib/scoring";
import { CrestIcon } from "./components/ui";

import FeedScreen from "./pages/FeedScreen";
import OrgScreen from "./pages/OrgScreen";
import SubmitScreen from "./pages/SubmitScreen";
import ReviewScreen from "./pages/ReviewScreen";
import ExtensionsScreen from "./pages/ExtensionsScreen";
import ProfileScreen from "./pages/ProfileScreen";
import OnboardingFlow from "./pages/OnboardingFlow";
import RulesScreen from "./pages/RulesScreen";
import VisionScreen from "./pages/VisionScreen";
import AboutScreen from "./pages/AboutScreen";
import VaultScreen from "./pages/VaultScreen";
import ConsensusScreen from "./pages/ConsensusScreen";
import AuditScreen from "./pages/AuditScreen";
import StoriesScreen from "./pages/StoriesScreen";
import FeedbackScreen from "./pages/FeedbackScreen";
import CitizenLookupScreen from "./pages/CitizenLookupScreen";
import RecordScreen from "./pages/RecordScreen";
import RegisterScreen from "./pages/RegisterScreen";
import LoginScreen from "./pages/LoginScreen";
import DiscoveryFeed from "./pages/DiscoveryFeed";
import DiagnosticScreen from "./pages/DiagnosticScreen";

import { ensureGeneralPublic } from "./lib/storage";
import { isDIUser } from "./lib/permissions";
import { trackAction } from "./lib/action-tracker";
import { Badge, Loader, CitizenCounter } from "./components/ui";

const NAV_PRIMARY = [
  { key: "feed", label: "Home" }, { key: "submit", label: "Submit", bold: true }, { key: "review", label: "Review", bold: true }, { key: "orgs", label: "Assemblies" },
];
const NAV_DROPDOWNS = [
  { label: "Learn", items: [
    { key: "guide", label: "Guide" }, { key: "rules", label: "Rules" }, { key: "vision", label: "Vision" }, { key: "about", label: "About" },
  ]},
  { label: "Explore", items: [
    { key: "consensus", label: "Consensus" }, { key: "stories", label: "Stories" }, { key: "audit", label: "Ledger" }, { key: "vault", label: "Vaults" },
  ]},
  { label: "Account", items: [
    { key: "profile", label: "Citizen Profile" }, { key: "extensions", label: "Extension" },
  ]},
];

function formatNotification(n) {
  const d = n.data || {};
  switch (n.type) {
    case "jury_assigned": return { text: `You've been selected as a juror for a ${d.submissionType || "submission"}.`, screen: "review" };
    case "submission_resolved": return { text: `Your submission was ${d.outcome === "approved" ? "approved" : d.outcome === "rejected" ? "rejected" : d.outcome || "resolved"}.`, screen: null };
    case "cross_group_started": return { text: "Your submission has been promoted to cross-group review!", screen: null };
    case "consensus_reached": return { text: "Your submission achieved cross-group consensus!", screen: null };
    case "consensus_rejected": return { text: "Your submission was rejected in cross-group review.", screen: null };
    case "dispute_jury_assigned": return { text: "You've been assigned to a dispute jury.", screen: "review" };
    case "submission_disputed": return { text: "Your approved submission has been disputed.", screen: "review" };
    case "dispute_resolved": return { text: `A dispute was resolved: ${d.outcome || "see details"}.`, screen: null };
    case "di_needs_approval": return { text: `Your DI @${d.submittedBy || "agent"} submitted a correction for review.`, screen: "review" };
    case "di_approved": return { text: "Your DI submission was approved by your human partner.", screen: null };
    case "trusted_earned": return { text: "You've earned Trusted Contributor status! Your submissions now skip jury review.", screen: null };
    case "trusted_lost": return { text: "Your Trusted Contributor status was revoked after a rejection.", screen: null };
    default: return { text: d.message || "New notification", screen: null };
  }
}

function NavDropdown({ label, items, screen, setScreen, isAdmin, hasSubmittedFeedback }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const allItems = [...items];
  // Inject feedback into Account dropdown
  if (label === "Account" && (isAdmin || hasSubmittedFeedback)) {
    allItems.push({ key: "feedback", label: "Feedback" });
  }
  // Inject admin items
  if (label === "Account" && isAdmin) {
    allItems.push({ key: "diagnostic", label: "Diagnostic" });
  }
  const isActive = allItems.some(i => i.key === screen);
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const handleKey = (e) => { if (e.key === "Escape") setOpen(false); };
    if (open) { document.addEventListener("mousedown", handleClick); document.addEventListener("keydown", handleKey); }
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`ta-nav-row-item ta-nav-dropdown-trigger ${isActive ? "active" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
        {label} <span style={{ fontSize: 8, marginLeft: 3, opacity: 0.6 }}>{open ? "\u25B4" : "\u25BE"}</span>
      </button>
      {open && (
        <div className="ta-nav-dropdown-menu" role="menu">
          {allItems.map(n => (
            <a key={n.key} href={`#${n.key}`} role="menuitem" className={`ta-nav-dropdown-item ${screen === n.key ? "active" : ""}`}
              style={n.key === "diagnostic" ? { color: "var(--purple)", fontWeight: 600 } : n.key === "feedback" && isAdmin ? { color: "var(--sienna)", fontWeight: 600 } : undefined}
              onClick={(e) => { e.preventDefault(); setScreen(n.key); setOpen(false); }}>
              {n.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

async function loadSyntheticData() {
  // Ensure The General Public exists
  await ensureGeneralPublic();
}

export default function TrustAssembly() {
  const [user, setUser] = useState(null); const [screen, setScreenRaw] = useState("login"); const [loading, setLoading] = useState(true);
  const [reviewCount, setReviewCount] = useState(0); const [crossCount, setCrossCount] = useState(0); const [disputeCount, setDisputeCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showExtDetails, setShowExtDetails] = useState(false);
  const [showExtPage, setShowExtPage] = useState(false);
  const [showManifesto, setShowManifesto] = useState(false);
  const [loginAccordion, setLoginAccordion] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroFading, setHeroFading] = useState(false);
  const [viewingCitizen, setViewingCitizen] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [navProfile, setNavProfile] = useState({ trustScore: 100, profile: "New Citizen" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notifRef = useRef(null);

  // Load full profile data for navbar trust score (matches citizen page)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [allUsers, allOrgs, allSubs] = await Promise.all([sG(SK.USERS), sG(SK.ORGS), sG(SK.SUBS)]);
        const freshUser = (allUsers || {})[user.username] || user;
        const p = computeProfile(freshUser, { allUsers: allUsers || {}, allOrgs: allOrgs || {}, allSubs: allSubs || {} });
        setNavProfile(p);
      } catch {}
    })();
  }, [user, screen]);

  // Browser history integration — hash-based URLs for back-button + deep links
  const skipPush = useRef(false);
  const setScreen = useCallback((s) => {
    trackAction("nav", `screen:${s}`, { screen: s });
    setScreenRaw(s);
    setViewingRecord(null);
    if (!skipPush.current) {
      window.history.pushState({ screen: s, citizen: null, record: null }, "", "#" + s);
    }
    skipPush.current = false;
  }, []);

  // Wrap setViewingCitizen to also push history
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const navigateToCitizen = useCallback((username) => {
    if (!username) { window.history.back(); return; }
    setViewingCitizen(username);
    setViewingRecord(null);
    window.history.pushState({ screen: screenRef.current, citizen: username, record: null }, "", "#citizen/" + encodeURIComponent(username));
  }, []);

  const navigateToRecord = useCallback((recordId) => {
    if (!recordId) { window.history.back(); return; }
    setViewingRecord(recordId);
    setViewingCitizen(null);
    window.history.pushState({ screen: screenRef.current, citizen: null, record: recordId }, "", "#record/" + encodeURIComponent(recordId));
  }, []);

  useEffect(() => {
    const onPop = (e) => {
      skipPush.current = true;
      if (e.state) {
        if (e.state.record) {
          setViewingRecord(e.state.record);
          setViewingCitizen(null);
        } else if (e.state.citizen) {
          setViewingCitizen(e.state.citizen);
          setViewingRecord(null);
        } else {
          setViewingCitizen(null);
          setViewingRecord(null);
          if (e.state.screen) setScreenRaw(e.state.screen);
        }
      } else {
        // Handle initial/hashless state — parse from URL hash
        setViewingCitizen(null);
        setViewingRecord(null);
        const hash = window.location.hash.slice(1);
        if (hash && !hash.startsWith("citizen/") && !hash.startsWith("record/")) setScreenRaw(hash);
      }
      skipPush.current = false;
    };
    window.addEventListener("popstate", onPop);

    // On mount: restore from hash if present (deep link / reload support)
    const hash = window.location.hash.slice(1);
    if (hash.startsWith("citizen/")) {
      const username = decodeURIComponent(hash.slice(8));
      setViewingCitizen(username);
    } else if (hash.startsWith("record/")) {
      const recordId = decodeURIComponent(hash.slice(7));
      setViewingRecord(recordId);
    } else if (hash && hash !== "login" && hash !== "register") {
      setScreenRaw(hash);
    }

    // Seed initial history entry
    window.history.replaceState({ screen, citizen: null, record: null }, "", window.location.hash || "#" + screen);
    return () => window.removeEventListener("popstate", onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        await loadSyntheticData();
        // Restore session from HTTP-only cookie via /api/auth/me
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const serverUser = await meRes.json();
          if (serverUser?.username) {
            // Try to load full profile from bulk users endpoint
            let u;
            try {
              const users = (await sG(SK.USERS)) || {};
              u = users[serverUser.username];
            } catch (e) { console.error("Init: sG(USERS) failed, using /api/auth/me data:", e); }
            // Fallback: build user object from /api/auth/me response
            if (!u) {
              u = {
                id: serverUser.id, username: serverUser.username,
                displayName: serverUser.display_name || serverUser.username,
                realName: serverUser.real_name, email: serverUser.email,
                gender: serverUser.gender, age: serverUser.age,
                country: serverUser.country, state: serverUser.state,
                politicalAffiliation: serverUser.political_affiliation,
                bio: serverUser.bio, isDI: serverUser.is_di, diApproved: serverUser.di_approved,
                signupDate: serverUser.created_at,
                signupTimestamp: serverUser.created_at ? new Date(serverUser.created_at).getTime() : 0,
                orgId: serverUser.primary_org_id || (serverUser.organizations?.[0]?.id) || null,
                orgIds: (serverUser.organizations || []).map(o => o.id),
                totalWins: serverUser.total_wins || 0, totalLosses: serverUser.total_losses || 0,
                currentStreak: serverUser.current_streak || 0, requiredStreak: 3,
                disputeWins: serverUser.dispute_wins || 0, disputeLosses: serverUser.dispute_losses || 0,
                deliberateLies: serverUser.deliberate_lies || 0,
                ratingsReceived: [], reviewHistory: [], retractions: [], notifications: [],
              };
            }
            if (u) { setUser(u); setNotifications(u.notifications || []); const isNew = !u.orgIds || u.orgIds.length <= 1; const h = window.location.hash.slice(1); const hasDeepLink = h && h !== "login" && h !== "register"; if (!hasDeepLink) setScreen(isNew ? "orgs" : "feed"); }
          }
        }
      } catch (e) { console.error("Init error:", e); }
      setLoading(false);
    })();
  }, []);

  // Hero slide auto-advance (landing page only)
  useEffect(() => {
    if (user || heroPaused) return;
    const t = setInterval(() => {
      setHeroFading(true);
      setTimeout(() => { setHeroIdx(i => (i + 1) % HERO_SLIDES.length); setHeroFading(false); }, 280);
    }, 8000);
    return () => clearInterval(t);
  }, [user, heroPaused]);

  useEffect(() => {
    if (!user) return;
    const check = async () => { try {
      const qRes = await fetch("/api/reviews/queue"); if (!qRes.ok) return;
      const q = await qRes.json();
      const ww = q.wildWest;
      const myOrgs = new Set(user.orgIds || (user.orgId ? [user.orgId] : []));
      const isEligible = (s) => s.submittedBy !== user.username && s.diPartner !== user.username;
      setReviewCount((q.submissions || []).filter(s => s.status !== "cross_review" && isEligible(s)).length);
      setCrossCount((q.submissions || []).filter(s => s.status === "cross_review").length);
      setDisputeCount((q.disputes || []).length);
    } catch {} };
    check(); const i = setInterval(check, 5000); return () => clearInterval(i);
  }, [user, screen]);

  const refreshUser = async () => { try { if (!user) return; const users = (await sG(SK.USERS)) || {}; const u = users[user.username]; if (u) { setUser(u); setNotifications(u.notifications || []); } } catch {} };
  useEffect(() => {
    if (user) refreshUser();
    // Mark review-related notifications as read when the Review tab is opened
    if (user && screen === "review") markNotifsRead();
  }, [screen]);

  // Check if user has submitted feedback (to show Feedback nav item)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch("/api/feedback");
        if (res.ok) {
          const data = await res.json();
          setHasSubmittedFeedback((data.feedback || []).length > 0);
        }
      } catch {}
    })();
  }, [user?.username]);

  // Notification dropdown: dismiss on outside click or Escape
  useEffect(() => {
    if (!showNotifDropdown) return;
    const handleClick = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifDropdown(false); };
    const handleKey = (e) => { if (e.key === "Escape") setShowNotifDropdown(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [showNotifDropdown]);

  // Mark notifications as read
  const markNotifsRead = async () => {
    if (!user || notifications.length === 0) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    try {
      await fetch("/api/users/me/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" } });
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const logout = async () => {
    trackAction("button", "click:logout", { component: "App", screen: "navbar" });
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    setUser(null); setScreen("login");
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    trackAction("button", "click:submit_feedback", { component: "FeedbackModal", screen: "feedback" });
    setFeedbackSending(true); setFeedbackError("");
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: feedbackText.trim() }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setFeedbackError(d.error || "Failed to send"); setFeedbackSending(false); return; }
      setFeedbackSent(true); setFeedbackText(""); setFeedbackSending(false); setHasSubmittedFeedback(true);
      setTimeout(() => { setShowFeedbackModal(false); setFeedbackSent(false); }, 2000);
    } catch (e) { setFeedbackError("Network error"); setFeedbackSending(false); }
  };

  const isAdmin = user && user.username === ADMIN_USERNAME;

  if (loading) return <div className="ta-root"><Loader /></div>;

  if (showOnboarding && user) {
    return <OnboardingFlow onComplete={() => { setShowOnboarding(false); setScreen("orgs"); }} />;
  }

  return (
    <div className="ta-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600;6..72,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        :root {
          --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          --serif: 'Newsreader', Georgia, serif; --mono: 'IBM Plex Mono', monospace; --body: var(--font);
          --accent: #2563EB; --accent-hover: #1D4ED8; --accent-light: #EFF6FF;
          --navy: #0F172A; --linen: #F0EDE6; --vellum: #FFFFFF; --charcoal: #1E293B;
          --stone: #64748B; --brass: #E2E8F0; --evergreen: #059669; --fired-clay: #DC2626;
          --crimson: #991B1B; --amber: #D97706; --purple: #7C3AED; --teal: #0D9488;
          --sienna: #EA580C; --indigo: #4F46E5; --gold: #B8963E; --slate: #94A3B8; --bronze: #A16207;
        }
        @keyframes ta-fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ta-prog { from { width:0%; } to { width:100%; } }
        .ta-root { min-height:100vh; background:var(--linen); font-family:var(--font); color:var(--charcoal); font-size:15px; line-height:1.6; }
        /* ── DARK BAND HEADER ── */
        .ta-dark-band { position:sticky; top:0; z-index:100; background:linear-gradient(180deg, #1a1a1a 0%, #222 100%); padding:14px 24px; display:flex; align-items:center; gap:12; }
        .ta-dark-band-title { font-family:var(--serif); font-weight:600; font-size:18px; color:#F0EDE6; letter-spacing:0.12em; line-height:1; }
        .ta-dark-band-cap { font-size:25px; }
        .ta-dark-band-sub { font-size:9px; letter-spacing:0.15em; color:var(--gold); font-weight:600; }
        .ta-dark-band-beta { background:#16A085; color:#fff; padding:1px 6px; border-radius:3px; font-size:8px; font-weight:700; letter-spacing:0.05em; }
        /* ── NAV ROWS (white, below dark band) ── */
        .ta-nav-row { background:#fff; padding:0 24px; display:flex; align-items:stretch; border-bottom:1px solid #eee; }
        .ta-nav-row-item { padding:10px 0; margin-right:20px; font-size:13.5px; font-weight:400; color:#999; border-bottom:2px solid transparent; cursor:pointer; transition:all 0.12s; white-space:nowrap; }
        .ta-nav-row-item.active { font-weight:600; color:#1a1a1a; border-bottom-color:#1a1a1a; }
        .ta-nav-row-item .ta-nav-badge { position:relative; top:-1px; }
        .ta-nav-row-secondary .ta-nav-row-item { font-size:12px; padding:8px 0; margin-right:16px; }
        .ta-nav-row-secondary .ta-nav-row-item.active { color:#1a1a1a; border-bottom-color:#1a1a1a; }
        /* ── USER BAR ── */
        .ta-user-bar-new { background:#fff; padding:8px 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #eee; }
        /* ── LEGACY HEADER (kept for fallback) ── */
        .ta-header { background:#FFFFFF; color:var(--charcoal); border-bottom:1px solid var(--brass); box-shadow:0 1px 3px rgba(0,0,0,0.05); }
        .ta-header-inner { max-width:780px; margin:0 auto; padding:14px 20px 0; }
        .ta-masthead { text-align:center; padding-bottom:10px; border-bottom:1px solid var(--brass); }
        .ta-masthead h1 { font-family:var(--font); font-size:24px; font-weight:700; margin:0; letter-spacing:.02em; }
        .ta-masthead-sub { font-family:var(--font); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); margin-top:3px; font-weight:500; }
        .ta-nav { display:flex; justify-content:center; overflow-x:auto; }
        .ta-nav button { background:none; border:none; color:var(--stone); font-family:var(--font); font-size:11px; font-weight:500; letter-spacing:.02em; padding:9px 10px; cursor:pointer; border-bottom:2px solid transparent; position:relative; white-space:nowrap; transition:color 0.2s; }
        .ta-nav button:hover { color:var(--charcoal); }
        .ta-nav button.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
        .ta-nav-secondary { border-top:1px solid var(--brass); }
        .ta-nav-secondary button { font-size:10px; padding:6px 8px; }
        .ta-nav-secondary button.active { color:var(--accent); }
        .ta-nav-badge { position:absolute; top:3px; right:1px; background:var(--fired-clay); color:#fff; font-size:8px; width:13px; height:13px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; }
        .ta-user-bar { display:flex; justify-content:space-between; align-items:center; padding:5px 20px; max-width:780px; margin:0 auto; font-size:11px; color:var(--stone); border-top:1px solid var(--brass); }
        .ta-content { max-width:780px; margin:0 auto; padding:20px; }
        .ta-section-rule { height:0; border-top:1px solid var(--brass); margin:0 0 16px; }
        .ta-section-head { font-family:var(--font); font-size:24px; font-weight:700; margin:0 0 14px; color:var(--navy); }
        .ta-card { background:var(--vellum); border:1px solid #E2E8F0; padding:16px; margin-bottom:14px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04); }
        .ta-field { margin-bottom:14px; }
        .ta-field label { display:block; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:#475569; margin-bottom:5px; font-family:var(--font); }
        .ta-field input,.ta-field textarea,.ta-field select { width:100%; padding:9px 11px; border:1.5px solid var(--brass); background:var(--vellum); font-family:var(--font); font-size:14px; color:var(--charcoal); border-radius:6px; outline:none; box-sizing:border-box; transition:border-color 0.2s; }
        .ta-field input:focus,.ta-field textarea:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
        .ta-field textarea { resize:vertical; }
        .ta-input { box-sizing:border-box; border:1.5px solid var(--brass); background:var(--vellum); font-family:var(--font); font-size:14px; color:var(--charcoal); border-radius:6px; outline:none; transition:border-color 0.2s; }
        .ta-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
        .ta-btn-primary { background:var(--accent); color:#fff; border:none; padding:10px 20px; font-family:var(--font); font-size:13px; font-weight:600; cursor:pointer; border-radius:6px; transition:background 0.2s; }
        .ta-btn-primary:hover { background:var(--accent-hover); }
        .ta-btn-primary:disabled { background:var(--stone); cursor:not-allowed; }
        .ta-btn-secondary { background:var(--vellum); color:var(--charcoal); border:1.5px solid var(--brass); padding:7px 14px; font-family:var(--font); font-size:12px; font-weight:500; cursor:pointer; border-radius:6px; transition:all 0.2s; }
        .ta-btn-secondary:hover { background:#F1F5F9; border-color:#CBD5E1; }
        .ta-btn-ghost { background:none; border:none; padding:6px 12px; font-family:var(--font); font-size:12px; color:var(--stone); cursor:pointer; transition:color 0.2s; }
        .ta-btn-ghost:hover { color:var(--accent); }
        .ta-link-btn { background:none; border:none; color:var(--accent); font-size:13px; cursor:pointer; text-decoration:underline; padding:0; font-family:var(--font); }
        .ta-error { background:#FEF2F2; border:1px solid var(--fired-clay); color:var(--fired-clay); padding:8px 12px; margin-bottom:14px; font-size:12px; border-radius:6px; }
        .ta-success { background:#ECFDF5; border:1px solid var(--evergreen); color:var(--evergreen); padding:8px 12px; margin-bottom:14px; font-size:12px; border-radius:6px; }
        .ta-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:var(--stone); font-family:var(--font); }
        @media(max-width:640px) { .ta-masthead h1{font-size:20px} .ta-content{padding:14px} .ta-nav button{padding:7px 7px;font-size:9px} .ta-section-head{font-size:20px} }
        /* ── NAV DROPDOWN MENUS ── */
        .ta-nav-dropdown-trigger { background:none; border:none; font-family:var(--font); cursor:pointer; padding:10px 0; margin-right:20px; font-size:13.5px; font-weight:400; color:#999; border-bottom:2px solid transparent; transition:all 0.12s; white-space:nowrap; }
        .ta-nav-dropdown-trigger:hover { color:#1a1a1a; }
        .ta-nav-dropdown-trigger.active { font-weight:600; color:#1a1a1a; border-bottom-color:#1a1a1a; }
        .ta-nav-dropdown-menu { position:absolute; top:100%; left:0; min-width:180px; background:#fff; border:1px solid #E2E8F0; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.1); z-index:110; padding:4px 0; margin-top:2px; }
        .ta-nav-dropdown-item { display:block; width:100%; padding:8px 16px; font-size:13px; color:#475569; text-decoration:none; cursor:pointer; border:none; background:none; text-align:left; font-family:var(--font); transition:background 0.1s; box-sizing:border-box; }
        .ta-nav-dropdown-item:hover { background:#F1F5F9; color:#1a1a1a; }
        .ta-nav-dropdown-item.active { color:#1a1a1a; font-weight:600; background:#F8FAFC; }
        /* ── MOBILE NAV ── */
        .ta-nav-mobile { display:none; background:#fff; padding:8px 24px; border-bottom:1px solid #eee; position:relative; }
        .ta-hamburger { background:none; border:none; cursor:pointer; padding:6px 2px; display:flex; flex-direction:column; gap:4px; }
        .ta-hamburger-line { display:block; width:22px; height:2px; background:#333; border-radius:2px; transition:transform 0.2s, opacity 0.2s; }
        .ta-hamburger-line.open:nth-child(1) { transform:translateY(6px) rotate(45deg); }
        .ta-hamburger-line.open:nth-child(2) { opacity:0; }
        .ta-hamburger-line.open:nth-child(3) { transform:translateY(-6px) rotate(-45deg); }
        .ta-mobile-menu { position:absolute; top:100%; left:0; right:0; background:#fff; border-bottom:1px solid #E2E8F0; box-shadow:0 4px 16px rgba(0,0,0,0.1); z-index:110; padding:8px 0; max-height:70vh; overflow-y:auto; }
        .ta-mobile-menu-item { display:block; padding:10px 24px; font-size:14px; color:#475569; text-decoration:none; font-family:var(--font); transition:background 0.1s; }
        .ta-mobile-menu-item:hover { background:#F1F5F9; }
        .ta-mobile-menu-item.active { color:#1a1a1a; font-weight:600; background:#F8FAFC; }
        .ta-mobile-menu-divider { height:1px; background:#E2E8F0; margin:6px 0; }
        .ta-mobile-menu-group { padding:8px 24px 4px; font-size:10px; font-family:var(--mono); text-transform:uppercase; letter-spacing:0.1em; color:#94A3B8; font-weight:600; }
        @media(max-width:768px) { .ta-nav-desktop{display:none !important;} .ta-nav-mobile{display:block;} }
        .ta-notif-bell { position:relative; color:var(--stone); padding:4px; cursor:pointer; }
        .ta-notif-bell:hover { color:var(--charcoal); }
        .ta-notif-badge { position:absolute; top:-2px; right:-4px; background:var(--fired-clay); color:#fff; font-size:8px; min-width:14px; height:14px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-weight:700; padding:0 3px; }
        .ta-notif-dropdown { position:absolute; top:28px; right:0; width:300px; max-height:400px; background:#fff; border:1px solid var(--brass); border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.12); z-index:100; overflow:hidden; }
        .ta-notif-header { padding:10px 14px; font-size:12px; font-weight:700; border-bottom:1px solid var(--brass); color:var(--navy); }
        .ta-notif-empty { padding:24px 14px; text-align:center; color:var(--stone); font-size:12px; }
        .ta-notif-list { max-height:350px; overflow-y:auto; }
        .ta-notif-item { padding:10px 14px; border-bottom:1px solid #f1f5f9; font-size:12px; }
        .ta-notif-item:last-child { border-bottom:none; }
        .ta-notif-unread { background:#f0f7ff; }
        .ta-notif-text { color:var(--charcoal); line-height:1.4; }
        .ta-notif-time { color:var(--stone); font-size:10px; margin-top:3px; }
        .ta-feedback-fab { position:fixed; bottom:24px; right:24px; z-index:90; background:var(--accent); color:#fff; border:none; padding:10px 16px; font-family:var(--font); font-size:12px; font-weight:600; cursor:pointer; border-radius:24px; box-shadow:0 2px 8px rgba(37,99,235,0.3); transition:all 0.2s; }
        .ta-feedback-fab:hover { background:var(--accent-hover); box-shadow:0 4px 12px rgba(37,99,235,0.4); transform:translateY(-1px); }
        .ta-feedback-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
        .ta-feedback-modal { background:#fff; border-radius:12px; padding:24px; max-width:480px; width:100%; box-shadow:0 20px 40px rgba(0,0,0,0.15); }
        .ta-feedback-modal h3 { margin:0 0 6px; font-size:18px; font-weight:700; color:var(--navy); }
        .ta-feedback-modal p { margin:0 0 16px; font-size:13px; color:var(--stone); line-height:1.5; }
        .ta-feedback-charcount { text-align:right; font-size:11px; color:var(--stone); margin-top:4px; }
        @media(max-width:640px) { .ta-feedback-fab { bottom:16px; right:16px; font-size:11px; padding:8px 14px; } }
      `}</style>


      {!user && viewingRecord ? (
        <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px" }}>
          <RecordScreen recordId={viewingRecord} onBack={() => { setViewingRecord(null); window.history.back(); }} onViewCitizen={navigateToCitizen} />
        </div>
      ) : !user && showExtPage ? (
        /* ── EXTENSION PAGE (unauthenticated, standalone) ── */
        <div>
          <div className="ta-dark-band" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CrestIcon size={38} />
            <div>
              <span className="ta-dark-band-title"><span className="ta-dark-band-cap">T</span>RUST<span style={{ letterSpacing: "0.22em" }}> </span><span className="ta-dark-band-cap">A</span>SSEMBLY</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="ta-dark-band-sub">TRUTH WILL OUT.</span>
                <span className="ta-dark-band-beta">BETA</span>
              </div>
            </div>
          </div>
          <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px" }}>
            <button className="ta-link-btn" style={{ fontSize: 12, marginBottom: 16 }} onClick={() => setShowExtPage(false)}>&larr; Back to home</button>
            <ExtensionsScreen />
          </div>
        </div>
      ) : !user ? (
        /* ═══════════════════════════════════
           LANDING PAGE — Hero with showcase
           ═══════════════════════════════════ */
        <div style={{ minHeight: "100vh", backgroundColor: "#fff" }}>
          {/* DARK BAND */}
          <div className="ta-dark-band" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CrestIcon size={38} />
            <div style={{ flex: 1 }}>
              <span className="ta-dark-band-title"><span className="ta-dark-band-cap">T</span>RUST<span style={{ letterSpacing: "0.22em" }}> </span><span className="ta-dark-band-cap">A</span>SSEMBLY</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="ta-dark-band-sub">TRUTH WILL OUT.</span>
                <span className="ta-dark-band-beta">BETA</span>
              </div>
            </div>
            <button onClick={() => { setScreen("login"); setLoginAccordion(true); }} style={{ fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--gold)", background: "none", border: "none", cursor: "pointer", padding: "8px 12px" }}>Login</button>
          </div>

          {/* HERO SECTION */}
          <div style={{ background: "linear-gradient(180deg, #0D0D0D 0%, #1B2A4A 100%)", padding: "40px 24px 40px", textAlign: "center", overflow: "hidden" }}>
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, fontWeight: 400, color: "#F0EDE6", lineHeight: 1.3, maxWidth: 560, margin: "0 auto 16px", animation: "ta-fadeUp 0.6s ease" }}>
              The internet's corrections layer.
            </h1>

            {/* CTAs */}
            <div style={{ marginBottom: 28, display: "flex", justifyContent: "center", gap: 12 }}>
              <button style={{ fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 600, color: "#1a1a1a", backgroundColor: "var(--gold)", border: "none", borderRadius: 6, padding: "12px 28px", cursor: "pointer" }}
                onClick={() => setShowExtPage(true)}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#D4B45E"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "#B8963E"}
              >Install Extension</button>
              <button style={{ fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 500, color: "#ccc", backgroundColor: "transparent", border: "1px solid #444", borderRadius: 6, padding: "12px 28px", cursor: "pointer" }}
                onClick={() => { setScreen("register"); setLoginAccordion(true); }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#888"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#444"}
              >Register an Account</button>
            </div>

            {/* Slide label */}
            <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: 13, color: "#999", marginBottom: 14, fontStyle: "italic", opacity: heroFading ? 0 : 1, transition: "opacity 0.2s" }}>
              {HERO_SLIDES[heroIdx].label}
            </div>

            {/* CONTENT AREA */}
            <div style={{ maxWidth: 740, margin: "0 auto", height: 480, overflow: "hidden", opacity: heroFading ? 0 : 1, transform: heroFading ? "translateY(5px)" : "translateY(0)", transition: "opacity 0.25s ease, transform 0.25s ease" }}
              onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}>
              {HERO_SLIDES[heroIdx].layout === "columns" ? (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 6, padding: "0 4px" }}>
                    <div style={{ flex: 1, textAlign: "left" }}><span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.06em" }}>BEFORE</span></div>
                    <div style={{ flex: 1, textAlign: "left" }}><span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--gold)", letterSpacing: "0.06em" }}>AFTER TRUST ASSEMBLY</span></div>
                  </div>
                  <div style={{ display: "flex", gap: 16, minHeight: 200 }}>
                    <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", border: "1px solid #333", opacity: 0.72 }}>{HERO_SLIDES[heroIdx].before}</div>
                    <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px #B8963E33", border: "1px solid #B8963E44" }}>{HERO_SLIDES[heroIdx].after}</div>
                  </div>
                </>
              ) : (
                <div style={{ maxWidth: 520, margin: "0 auto" }}>
                  <div style={{ textAlign: "left", marginBottom: 6 }}><span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.06em" }}>BEFORE</span></div>
                  <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", border: "1px solid #333", opacity: 0.72, marginBottom: 12 }}>{HERO_SLIDES[heroIdx].before}</div>
                  <div style={{ textAlign: "left", marginBottom: 6 }}><span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--gold)", letterSpacing: "0.06em" }}>AFTER TRUST ASSEMBLY</span></div>
                  <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px #B8963E33", border: "1px solid #B8963E44" }}>{HERO_SLIDES[heroIdx].after}</div>
                </div>
              )}
            </div>


            {/* Descriptive text */}
            <div style={{ maxWidth: 480, margin: "28px auto 0" }}>
              <p style={{ fontFamily: "-apple-system, sans-serif", fontSize: 14.5, color: "#888", lineHeight: 1.65 }}>
                Community juries review headlines and claims across the web.
                Corrections appear right where the misinformation lives — in your browser,
                on every platform. No algorithm decides what's true. People do.
              </p>
            </div>

          </div>

          {/* HOW IT WORKS */}
          <div style={{ padding: "48px 24px", backgroundColor: "#fff", maxWidth: 660, margin: "0 auto" }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 400, color: "#1a1a1a", textAlign: "center", marginBottom: 32 }}>How it works</h2>
            {[
              { n: "1", title: "Someone notices a misleading claim", desc: "A citizen submits a correction with evidence. An affirmation if the reporting is accurate. Both go through the same jury process." },
              { n: "2", title: "A random jury reviews it", desc: "Jurors are randomly drawn from the citizen's Assembly. They vote independently. The math rewards honesty and makes deception structurally irrational." },
              { n: "3", title: "Independent groups verify it", desc: "Approved corrections advance to juries from other Assemblies — people with different perspectives reviewing the same evidence. What survives both achieves Consensus." },
              { n: "4", title: "The correction appears in your browser", desc: "Misleading headlines turn red. Accurate reporting turns green. Correction cards appear in social feeds. The truth surfaces everywhere the original claim lives." },
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 16, padding: "18px 0", borderBottom: i < 3 ? "1px solid #eee" : "none" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: "#1a1a1a", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: 13.5, color: "#777", lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>
            ))}

            {/* Closing CTA */}
            <div style={{ textAlign: "center", marginTop: 40, padding: "32px 0", borderTop: "1px solid #eee" }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20, color: "#1a1a1a", marginBottom: 6 }}>Honesty has a browser extension.</div>
              <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>Free. Open. Jury-verified. No algorithm decides what's true.</div>
              <button style={{ fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 600, color: "#fff", backgroundColor: "#1a1a1a", border: "none", borderRadius: 6, padding: "12px 32px", cursor: "pointer" }}
                onClick={() => setLoginAccordion(true)}
              >Get Started</button>
            </div>
          </div>

          {/* LOGIN/REGISTER MODAL */}
          {loginAccordion && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
              onClick={e => { if (e.target === e.currentTarget) setLoginAccordion(false); }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: "28px", maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
                    {screen === "login" ? "Return to the Assembly" : "Become a Citizen"}
                  </h2>
                  <button onClick={() => setLoginAccordion(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#999", cursor: "pointer", lineHeight: 1 }}>&times;</button>
                </div>
                {screen === "login" ? (
                  <LoginScreen onLogin={u => { setLoginAccordion(false); setUser(u); const isNew = !u.orgIds || u.orgIds.length <= 1; setScreen(isNew ? "orgs" : "feed"); }} onGoRegister={() => setScreen("register")} />
                ) : (
                  <div>
                    <RegisterScreen onRegister={u => { setLoginAccordion(false); setUser(u); setShowOnboarding(true); }} />
                    <div style={{ marginTop: 16, textAlign: "center" }}>
                      <button className="ta-link-btn" onClick={() => setScreen("login")}>Already a citizen? Sign in</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DISCOVERY FEED */}
          <div style={{ maxWidth: 580, margin: "0 auto", padding: "0 20px 40px" }}>
            <DiscoveryFeed onLogin={() => { setLoginAccordion(true); setScreen("login"); }} onRegister={() => { setLoginAccordion(true); setScreen("register"); }} />
          </div>
        </div>
      ) : (
        <div>
          {/* ── DARK BAND HEADER (logged-in) ── */}
          <div className="ta-dark-band" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CrestIcon size={38} />
            <div>
              <span className="ta-dark-band-title"><span className="ta-dark-band-cap">T</span>RUST<span style={{ letterSpacing: "0.22em" }}> </span><span className="ta-dark-band-cap">A</span>SSEMBLY</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="ta-dark-band-sub">TRUTH WILL OUT.</span>
                <span className="ta-dark-band-beta">BETA</span>
              </div>
            </div>
          </div>

          {/* NAV — consolidated with dropdowns */}
          <div className="ta-nav-row ta-nav-desktop">
            {NAV_PRIMARY.map(n => (
              <a key={n.key} href={`#${n.key}`} className={`ta-nav-row-item ${screen === n.key ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen(n.key); }} style={n.bold ? { fontWeight: 700 } : undefined}>
                {n.label}
                {n.key === "review" && (reviewCount + crossCount + disputeCount) > 0 && <span className="ta-nav-badge" style={{ position: "relative", top: -1, marginLeft: 4, background: "var(--fired-clay)", color: "#fff", fontSize: 8, width: 13, height: 13, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{reviewCount + crossCount + disputeCount}</span>}
              </a>
            ))}
            {NAV_DROPDOWNS.map(dd => (
              <NavDropdown key={dd.label} label={dd.label} items={dd.items} screen={screen} setScreen={setScreen} isAdmin={isAdmin} hasSubmittedFeedback={hasSubmittedFeedback} />
            ))}
          </div>

          {/* MOBILE HAMBURGER */}
          <div className="ta-nav-mobile">
            <button className="ta-hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={mobileMenuOpen}>
              <span className={`ta-hamburger-line ${mobileMenuOpen ? "open" : ""}`} />
              <span className={`ta-hamburger-line ${mobileMenuOpen ? "open" : ""}`} />
              <span className={`ta-hamburger-line ${mobileMenuOpen ? "open" : ""}`} />
            </button>
            {mobileMenuOpen && (
              <div className="ta-mobile-menu">
                {NAV_PRIMARY.map(n => (
                  <a key={n.key} href={`#${n.key}`} className={`ta-mobile-menu-item ${screen === n.key ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen(n.key); setMobileMenuOpen(false); }}>
                    {n.label}
                    {n.key === "review" && (reviewCount + crossCount + disputeCount) > 0 && <span className="ta-nav-badge" style={{ marginLeft: 6 }}>{reviewCount + crossCount + disputeCount}</span>}
                  </a>
                ))}
                <div className="ta-mobile-menu-divider" />
                {NAV_DROPDOWNS.map(dd => (
                  <React.Fragment key={dd.label}>
                    <div className="ta-mobile-menu-group">{dd.label}</div>
                    {dd.items.map(n => (
                      <a key={n.key} href={`#${n.key}`} className={`ta-mobile-menu-item ${screen === n.key ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen(n.key); setMobileMenuOpen(false); }}>{n.label}</a>
                    ))}
                  </React.Fragment>
                ))}
                {(isAdmin || hasSubmittedFeedback) && (
                  <a href="#feedback" className={`ta-mobile-menu-item ${screen === "feedback" ? "active" : ""}`} style={isAdmin ? { color: "var(--sienna)", fontWeight: 600 } : undefined} onClick={(e) => { e.preventDefault(); setScreen("feedback"); setMobileMenuOpen(false); }}>Feedback</a>
                )}
                {isAdmin && (
                  <a href="#diagnostic" className={`ta-mobile-menu-item ${screen === "diagnostic" ? "active" : ""}`} style={{ color: "var(--purple)", fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setScreen("diagnostic"); setMobileMenuOpen(false); }}>Diagnostic</a>
                )}
              </div>
            )}
          </div>

          {/* USER BAR */}
          <div className="ta-user-bar-new">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>{isDIUser(user) ? "\u{1F916}" : user.username === ADMIN_USERNAME ? "\u{1F451}" : ""}</span>
              <span style={{ fontSize: 13, color: "#333", cursor: "pointer", textDecoration: "underline", textDecorationColor: "#CBD5E1" }} onClick={() => setScreen("profile")}>@{user.displayName || user.username}</span>
              <span style={{ fontSize: 13, color: "#333" }}>&middot;</span>
              <Badge profile={navProfile.profile} score={navProfile.trustScore} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div ref={notifRef} style={{ position: "relative" }}>
                <button className="ta-btn-ghost ta-notif-bell" onClick={() => { setShowNotifDropdown(v => !v); if (!showNotifDropdown) markNotifsRead(); }} title="Notifications" aria-label="Notifications">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  {notifications.filter(n => !n.read).length > 0 && <span className="ta-notif-badge">{notifications.filter(n => !n.read).length}</span>}
                </button>
                {showNotifDropdown && (
                  <div className="ta-notif-dropdown">
                    <div className="ta-notif-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Notifications</span>
                      <button onClick={() => setShowNotifDropdown(false)} style={{ background: "none", border: "none", fontSize: 16, color: "#999", cursor: "pointer", lineHeight: 1, padding: 0 }} aria-label="Close notifications">&times;</button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="ta-notif-empty">No notifications yet</div>
                    ) : (
                      <div className="ta-notif-list">
                        {notifications.slice(0, 20).map(n => {
                          const info = formatNotification(n);
                          return (
                          <div key={n.id} className={`ta-notif-item ${n.read ? "" : "ta-notif-unread"}`} onClick={() => { if (info.screen) { setScreen(info.screen); setShowNotifDropdown(false); } }} style={info.screen ? { cursor: "pointer" } : {}}>
                            <div className="ta-notif-text">{info.text}{info.screen && <span style={{ fontSize: 10, color: "#2563EB", marginLeft: 4 }}>&rarr; Go</span>}</div>
                            <div className="ta-notif-time">{new Date(n.createdAt).toLocaleDateString()}</div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#999", cursor: "pointer" }} onClick={logout}>Sign Out</span>
            </div>
          </div>

          <div className="ta-content">
            {screen === "feed" && !viewingRecord && !viewingCitizen && <CitizenCounter />}
            {viewingRecord ? (
              <RecordScreen recordId={viewingRecord} onBack={() => window.history.back()} onViewCitizen={navigateToCitizen} />
            ) : viewingCitizen ? (
              <CitizenLookupScreen username={viewingCitizen} onBack={() => window.history.back()} onViewCitizen={navigateToCitizen} />
            ) : <>
            {screen === "feed" && <FeedScreen user={user} onNavigate={(s, draftId) => { if (draftId) setActiveDraftId(draftId); setScreen(s); }} onViewCitizen={navigateToCitizen} onViewRecord={navigateToRecord} />}
            {screen === "orgs" && <OrgScreen user={user} onUpdate={setUser} onViewCitizen={navigateToCitizen} />}
            {screen === "submit" && <SubmitScreen user={user} onUpdate={setUser} draftId={activeDraftId} onDraftLoaded={() => setActiveDraftId(null)} />}
            {screen === "review" && <ReviewScreen user={user} />}
            {screen === "vault" && <VaultScreen user={user} />}
            {screen === "consensus" && <ConsensusScreen onViewCitizen={navigateToCitizen} />}
            {screen === "stories" && <StoriesScreen user={user} onViewCitizen={navigateToCitizen} onViewRecord={navigateToRecord} />}
            {screen === "profile" && <ProfileScreen user={user} onViewCitizen={navigateToCitizen} />}
            {screen === "audit" && <AuditScreen />}
            {screen === "guide" && <OnboardingFlow onComplete={() => setScreen("feed")} embedded />}
            {screen === "rules" && <RulesScreen />}
            {screen === "about" && <AboutScreen />}
            {screen === "vision" && <VisionScreen />}
            {screen === "extensions" && <ExtensionsScreen />}
            {screen === "feedback" && (isAdmin || hasSubmittedFeedback) && <FeedbackScreen isAdmin={isAdmin} currentUsername={user.username} />}
            {screen === "diagnostic" && isAdmin && <DiagnosticScreen />}
            </>}
          </div>

          {/* Floating feedback button — visible to all non-admin users */}
          {!isAdmin && (
            <button className="ta-feedback-fab" onClick={() => { setShowFeedbackModal(true); setFeedbackSent(false); setFeedbackError(""); }}>
              Submit Feedback / Feature Request
            </button>
          )}

          {/* Feedback modal */}
          {showFeedbackModal && (
            <div className="ta-feedback-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowFeedbackModal(false); }}>
              <div className="ta-feedback-modal">
                <h3>Feedback &amp; Feature Requests</h3>
                <p>Help shape the Trust Assembly. Bug reports, feature ideas, and suggestions are all welcome. Your username will be attached so we can follow up.</p>
                {feedbackSent ? (
                  <div className="ta-success">Thank you! Your feedback has been submitted.</div>
                ) : (
                  <>
                    {feedbackError && <div className="ta-error">{feedbackError}</div>}
                    <div className="ta-field">
                      <textarea
                        value={feedbackText}
                        onChange={e => { if (e.target.value.length <= 1000) setFeedbackText(e.target.value); }}
                        placeholder="What's on your mind? Describe a bug, suggest a feature, or share your thoughts..."
                        rows={5}
                        style={{ fontSize: 14 }}
                      />
                      <div className="ta-feedback-charcount">{feedbackText.length} / 1,000</div>
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button className="ta-btn-secondary" onClick={() => setShowFeedbackModal(false)}>Cancel</button>
                      <button className="ta-btn-primary" onClick={submitFeedback} disabled={feedbackSending || !feedbackText.trim()}>
                        {feedbackSending ? "Sending..." : "Submit Feedback"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
