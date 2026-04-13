import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SK, ADMIN_USERNAME, HERO_SLIDES, CREST_IMG, EXTENSION_LATEST_VERSION } from "./lib/constants";
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
import BadgesScreen from "./pages/BadgesScreen";
import VisionScreen from "./pages/VisionScreen";
import AboutScreen from "./pages/AboutScreen";
import AIAgentLearnPage from "./pages/AIAgentLearnPage";
import VaultScreen from "./pages/VaultScreen";
import ConsensusScreen from "./pages/ConsensusScreen";
import AuditScreen from "./pages/AuditScreen";
import StoriesScreen from "./pages/StoriesScreen";
import FeedbackScreen from "./pages/FeedbackScreen";
import CitizenLookupScreen from "./pages/CitizenLookupScreen";
import RecordScreen from "./pages/RecordScreen";
import RegisterScreen from "./pages/RegisterScreen";
import LoginScreen from "./pages/LoginScreen";
import ResetPasswordScreen from "./pages/ResetPasswordScreen";
import VerifyEmailScreen from "./pages/VerifyEmailScreen";
import AdminToolsScreen from "./pages/AdminToolsScreen";
import AgentPage from "./pages/AgentPage";
import EmailVerifyPopup from "./components/EmailVerifyPopup";
import DiscoveryFeed from "./pages/DiscoveryFeed";
import LandingPage from "./pages/LandingPage";
// DiagnosticScreen moved to /admin/system-health page

import { ensureGeneralPublic } from "./lib/storage";
import { isDIUser } from "./lib/permissions";
import { trackAction } from "./lib/action-tracker";
import { Badge, Loader, CitizenCounter } from "./components/ui";

const NAV_PRIMARY = [
  { key: "feed", label: "Home" }, { key: "submit", label: "Submit", bold: true }, { key: "review", label: "Review", bold: true }, { key: "orgs", label: "Assemblies" },
];
const NAV_DROPDOWNS = [
  { label: "More", items: [
    { key: "_group", label: "EXPLORE" },
    { key: "consensus", label: "Consensus" }, { key: "stories", label: "Stories" }, { key: "audit", label: "Ledger" }, { key: "vault", label: "Vaults" },
    { key: "_group2", label: "LEARN" },
    { key: "guide", label: "Guide" }, { key: "ai-agents", label: "AI Agents" }, { key: "rules", label: "Rules" }, { key: "about", label: "About" },
  ]},
  { label: "Account", items: [
    { key: "profile", label: "Citizen Profile" }, { key: "extensions", label: "Extension" },
  ]},
];

function formatNotification(n) {
  const d = n.data || {};
  const title = n.title || "";
  const body = n.body || "";
  const entityId = n.entity_id || d.entityId;
  switch (n.type) {
    case "jury_assigned": return { text: title || "You've been selected as a juror.", screen: "review" };
    case "submission_resolved": return { text: title || "Your submission was resolved.", screen: null, recordId: entityId };
    case "cross_group_started": return { text: title || "Your submission has been promoted to cross-group review!", screen: null, recordId: entityId };
    case "consensus_reached": return { text: title || "Your submission achieved cross-group consensus!", screen: null, recordId: entityId };
    case "consensus_rejected": return { text: title || "Your submission was rejected in cross-group review.", screen: "review" };
    case "dispute_jury_assigned": return { text: title || "You've been assigned to a dispute jury.", screen: "review" };
    case "dispute_filed": return { text: title || "Your submission has been disputed.", screen: "review" };
    case "submission_disputed": return { text: title || "Your submission has been disputed.", screen: "review" };
    case "dispute_resolved": return { text: title || "A dispute was resolved.", screen: "review" };
    case "di_needs_approval": return { text: title || "An AI Agent submission needs your pre-approval.", screen: "review" };
    case "di_approved": return { text: title || "Your AI Agent submission was approved.", screen: "feed" };
    case "trusted_earned": return { text: title || "You've earned Trusted Contributor status!", screen: "profile" };
    case "trusted_lost": return { text: title || "Your Trusted Contributor status was revoked.", screen: "profile" };
    case "story_resolved": return { text: title || "Your story proposal was resolved.", screen: "stories" };
    default: return { text: title || d.message || body || "New notification", screen: null };
  }
}

function NavDropdown({ label, items, screen, setScreen, isAdmin, hasSubmittedFeedback, dropDown }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const allItems = [...items];
  // Inject feedback into Account dropdown
  if (label === "Account" && (isAdmin || hasSubmittedFeedback)) {
    allItems.push({ key: "feedback", label: "Feedback" });
  }
  // Inject admin items
  if (label === "Account" && isAdmin) {
    allItems.push({ key: "agent", label: "Agent" });
    allItems.push({ key: "admin", label: "Admin Dashboard" });
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
        <div className="ta-nav-dropdown-menu" role="menu" style={dropDown ? { top: "100%", bottom: "auto", right: 0, left: "auto", transform: "none", marginTop: 2, marginBottom: 0 } : undefined}>
          {allItems.map(n => n.key.startsWith("_group") ? (
            <div key={n.key} style={{ padding: "6px 16px 2px", fontSize: 8, fontFamily: "var(--mono)", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, borderTop: n.key === "_group" ? "none" : "1px solid var(--border)", marginTop: n.key === "_group" ? 0 : 4 }}>{n.label}</div>
          ) : (
            <a key={n.key} href={`/${n.key}`} role="menuitem" className={`ta-nav-dropdown-item ${screen === n.key ? "active" : ""}`}
              style={n.key === "admin" ? { color: "var(--purple)", fontWeight: 600 } : n.key === "agent" && isAdmin ? { color: "var(--gold)", fontWeight: 600 } : n.key === "feedback" && isAdmin ? { color: "var(--sienna)", fontWeight: 600 } : undefined}
              onClick={(e) => { e.preventDefault(); if (n.key === "admin") { window.open("/admin/system-health", "_blank"); } else { setScreen(n.key); } setOpen(false); }}>
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
  // Apply theme + font from localStorage on mount (before first render)
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem("ta-theme") || "light"; } catch { return "light"; } });
  const [fontSize, setFontSizeState] = useState(() => { try { return localStorage.getItem("ta-font-size") || "large"; } catch { return "large"; } });
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : ""); }, [theme]);

  const setTheme = (t) => { setThemeState(t); try { localStorage.setItem("ta-theme", t); } catch {} document.documentElement.setAttribute("data-theme", t === "light" ? "light" : ""); };
  const setFontSize = (s) => { setFontSizeState(s); try { localStorage.setItem("ta-font-size", s); } catch {} };

  const [contentWidth, setContentWidthState] = useState(() => { try { return localStorage.getItem("ta-content-width") || "compact"; } catch { return "compact"; } });
  const setContentWidth = (w) => { setContentWidthState(w); try { localStorage.setItem("ta-content-width", w); } catch {} };

  const [hideCarousel, setHideCarouselState] = useState(() => { try { return localStorage.getItem("ta-hide-carousel") === "true"; } catch { return false; } });
  const setHideCarousel = (v) => { setHideCarouselState(v); try { localStorage.setItem("ta-hide-carousel", v ? "true" : "false"); } catch {} };

  const [hideStatusCards, setHideStatusCardsState] = useState(() => { try { return localStorage.getItem("ta-hide-status-cards") === "true"; } catch { return false; } });
  const setHideStatusCards = (v) => { setHideStatusCardsState(v); try { localStorage.setItem("ta-hide-status-cards", v ? "true" : "false"); } catch {} };

  const [user, setUser] = useState(null); const [screen, setScreenRaw] = useState("login"); const [loading, setLoading] = useState(true);
  const [reviewCount, setReviewCount] = useState(0); const [crossCount, setCrossCount] = useState(0); const [disputeCount, setDisputeCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showEmailVerifyPopup, setShowEmailVerifyPopup] = useState(false);
  const [showExtDetails, setShowExtDetails] = useState(false);
  const [showExtPage, setShowExtPage] = useState(false);
  const [showManifesto, setShowManifesto] = useState(false);
  const [loginAccordion, setLoginAccordion] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroFading, setHeroFading] = useState(false);
  const [viewingAssemblyId, setViewingAssemblyId] = useState(null);
  const [extCta, setExtCta] = useState(null); // null | "install" | "update"
  const [viewingCitizen, setViewingCitizen] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [resetToken, setResetToken] = useState(null);
  const [verifyEmailToken, setVerifyEmailToken] = useState(null);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackPrompt, setFeedbackPrompt] = useState("");
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(() => { try { return localStorage.getItem("ta_alerts_enabled") !== "false"; } catch { return true; } });
  const [announcementDismissed, setAnnouncementDismissed] = useState(() => { try { return localStorage.getItem("ta_announcement_dismissed") || null; } catch { return null; } });
  const [navProfile, setNavProfile] = useState({ trustScore: 100, profile: "New Citizen" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteAnnouncement, setSiteAnnouncement] = useState(null);
  const notifRef = useRef(null);

  // Load full profile data for navbar trust score.
  // Only re-fetch when the user object itself changes (login, profile update),
  // NOT on every screen change — avoids 3 massive API calls per navigation.
  const navProfileLoaded = useRef(false);
  useEffect(() => {
    if (!user) return;
    // Skip if we already loaded once this session and user hasn't changed
    if (navProfileLoaded.current) return;
    navProfileLoaded.current = true;
    (async () => {
      try {
        const [allUsers, allOrgs, allSubs] = await Promise.all([sG(SK.USERS), sG(SK.ORGS), sG(SK.SUBS)]);
        const freshUser = (allUsers || {})[user.username] || user;
        const p = computeProfile(freshUser, { allUsers: allUsers || {}, allOrgs: allOrgs || {}, allSubs: allSubs || {} });
        setNavProfile(p);
      } catch {}
    })();
  }, [user]);

  // Browser history integration — hash-based URLs for back-button + deep links
  const skipPush = useRef(false);
  const [screenTransition, setScreenTransition] = useState(false);
  const setScreen = useCallback((s) => {
    trackAction("nav", `screen:${s}`, { screen: s });
    setScreenTransition(true);
    setTimeout(() => { setScreenRaw(s); setScreenTransition(false); window.scrollTo(0, 0); }, 80);
    setViewingCitizen(null);
    setViewingRecord(null);
    if (!skipPush.current) {
      window.history.pushState({ screen: s, citizen: null, record: null }, "", "/" + s);
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
    window.history.pushState({ screen: screenRef.current, citizen: username, record: null }, "", "/citizen/" + encodeURIComponent(username));
  }, []);

  const navigateToRecord = useCallback((recordId) => {
    if (!recordId) { window.history.back(); return; }
    setViewingRecord(recordId);
    setViewingCitizen(null);
    window.history.pushState({ screen: screenRef.current, citizen: null, record: recordId }, "", "/record/" + encodeURIComponent(recordId));
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
        // Handle initial state — parse from URL pathname
        setViewingCitizen(null);
        setViewingRecord(null);
        const path = window.location.pathname.slice(1);
        if (path && !path.startsWith("citizen/") && !path.startsWith("record/")) setScreenRaw(path);
      }
      skipPush.current = false;
    };
    window.addEventListener("popstate", onPop);

    // On mount: restore from pathname if present (deep link / reload support)
    const path = window.location.pathname.slice(1);
    if (path === "verify-email") {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (token) setVerifyEmailToken(token);
    } else if (path === "reset-password") {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (token) setResetToken(token);
    } else if (path.startsWith("citizen/")) {
      const username = decodeURIComponent(path.slice(8));
      setViewingCitizen(username);
    } else if (path.startsWith("record/")) {
      const recordId = decodeURIComponent(path.slice(7));
      setViewingRecord(recordId);
    } else if (path && path !== "login" && path !== "register") {
      setScreenRaw(path);
    }

    // Handle admin query params (from Admin Dashboard links)
    const qp = new URLSearchParams(window.location.search);
    if (qp.get("tutorial") === "1") {
      setShowOnboarding(true);
      window.history.replaceState({}, "", "/");
    }
    if (qp.get("screen")) {
      setScreenRaw(qp.get("screen"));
      window.history.replaceState({}, "", "/" + qp.get("screen"));
    }

    // Seed initial history entry
    window.history.replaceState({ screen, citizen: null, record: null }, "", window.location.pathname !== "/" ? window.location.pathname : "/" + screen);
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
                bio: serverUser.bio, isDI: serverUser.is_di, diApproved: serverUser.di_approved, emailVerified: serverUser.email_verified,
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
            if (u) { setUser(u); setNotifications(u.notifications || []); const isNew = !u.orgIds || u.orgIds.length <= 1; const p = window.location.pathname.slice(1); const hasDeepLink = p && p !== "login" && p !== "register"; if (!hasDeepLink) setScreen(isNew ? "orgs" : "feed"); }
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

  // Poll review queue for badge counts — 30s interval (was 5s).
  // Full data is loaded by ReviewScreen itself when the user navigates there.
  useEffect(() => {
    if (!user) return;
    const check = async () => { try {
      const qRes = await fetch("/api/reviews/queue"); if (!qRes.ok) return;
      const q = await qRes.json();
      const isEligible = (s) => s.submittedBy !== user.username && s.diPartner !== user.username;
      setReviewCount((q.submissions || []).filter(s => s.status !== "cross_review" && isEligible(s)).length);
      setCrossCount((q.submissions || []).filter(s => s.status === "cross_review").length);
      setDisputeCount((q.disputes || []).length);
    } catch {} };
    check(); const i = setInterval(check, 30000); return () => clearInterval(i);
  }, [user]);

  const refreshUser = async () => { try { if (!user) return; const users = (await sG(SK.USERS)) || {}; const u = users[user.username]; if (u) { setUser(u); setNotifications(u.notifications || []); navProfileLoaded.current = false; } } catch {} };
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

  // Fetch site announcement
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/announcement");
        if (res.ok) {
          const data = await res.json();
          setSiteAnnouncement(data.announcement || null);
        }
      } catch {}
    })();
  }, [user?.username]);

  // Extension detection — check after login with delay for content script injection
  useEffect(() => {
    if (!user) return;
    const dismissKey = `ta-ext-cta-dismissed-${EXTENSION_LATEST_VERSION}`;
    if (typeof localStorage !== "undefined" && localStorage.getItem(dismissKey)) return;
    const t = setTimeout(() => {
      if (!window.__trustAssemblyLoaded) {
        setExtCta("install");
      } else if (window.__trustAssemblyVersion && window.__trustAssemblyVersion !== EXTENSION_LATEST_VERSION) {
        setExtCta("update");
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [user]);

  const dismissExtCta = () => {
    setExtCta(null);
    try { localStorage.setItem(`ta-ext-cta-dismissed-${EXTENSION_LATEST_VERSION}`, "1"); } catch {}
  };

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
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: feedbackText.trim(), promptSuggestion: feedbackPrompt.trim() || null }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setFeedbackError(d.error || "Failed to send"); setFeedbackSending(false); return; }
      setFeedbackSent(true); setFeedbackText(""); setFeedbackPrompt(""); setFeedbackSending(false); setHasSubmittedFeedback(true);
      setTimeout(() => { setShowFeedbackModal(false); setFeedbackSent(false); }, 2000);
    } catch (e) { setFeedbackError("Network error"); setFeedbackSending(false); }
  };

  const isAdmin = user && user.username === ADMIN_USERNAME;

  if (loading) return <div className="ta-root"><Loader /></div>;

  if (showOnboarding && user) {
    return <OnboardingFlow onComplete={() => {
      setShowOnboarding(false);
      setScreen("orgs");
      // Show email verification popup if not yet verified
      if (user && user.emailVerified === false) {
        setShowEmailVerifyPopup(true);
      }
    }} />;
  }

  return (
    <div className={`ta-root${fontSize === "medium" ? " font-medium" : fontSize === "large" ? " font-large" : ""}`}>
      {showEmailVerifyPopup && <EmailVerifyPopup onClose={() => setShowEmailVerifyPopup(false)} userEmail={user?.email} />}
      <style>{`
        :root {
          --bg:#0d0d0a; --card-bg:#14130e; --border:#2a2518;
          --gold:#d4a843; --text:#ffffff; --text-sec:#bbb5aa; --text-muted:#8a8278;
          --green:#4a9e55; --red:#c44a3a; --purple:#7C3AED; --teal:#0D9488;
          --ward:#8B6CC4;
          --font:'Helvetica Neue',Helvetica,sans-serif; --serif:Georgia,serif; --mono:'Courier New',monospace;
        }
        [data-theme="light"] {
          --bg:#f5f2ec; --card-bg:#ffffff; --border:#d9d3c7;
          --gold:#b8922e; --text:#1a1714; --text-sec:#5c564d; --text-muted:#9a948b;
          --green:#2d7a38; --red:#b03a2e; --ward:#6B4C9A;
        }
        *{margin:0;padding:0;box-sizing:border-box;}
        @keyframes ta-fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ta-prog { from{width:0%} to{width:100%} }
        .ta-root { min-height:100vh; background:var(--bg); font-family:var(--font); color:var(--text); font-size:13px; line-height:1.6; }
        .ta-root.font-medium { zoom:1.15; }
        .ta-root.font-large { zoom:1.3; }
        /* ── HEADER ── */
        .hdr { padding:14px 24px; display:flex; justify-content:space-between; align-items:center; }
        .hdr-left { display:flex; align-items:center; gap:8px; }
        .hdr-bar { width:3px; height:18px; background:var(--gold); }
        .hdr-title { font-size:13px; font-weight:800; letter-spacing:2px; text-transform:uppercase; font-family:var(--serif); }
        .hdr-sub { font-size:8px; color:var(--gold); letter-spacing:2px; font-weight:600; }
        .hdr-beta { font-size:7px; padding:1px 5px; background:var(--green); color:var(--bg); font-weight:700; }
        .hdr-nav { display:flex; gap:14px; font-size:9px; text-transform:uppercase; letter-spacing:1px; }
        .hdr-nav span { color:var(--text); cursor:pointer; }
        .hdr-nav span.active { color:var(--gold); font-weight:700; }
        .gold-rule { height:1px; background:var(--gold); margin:0 24px; }
        /* ── USER BAR ── */
        .user-bar { padding:6px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); font-size:10px; }
        .user-bar .name { font-weight:600; }
        .user-bar .meta { color:var(--text-muted); }
        .user-bar .score { color:var(--gold); font-weight:600; }
        .user-bar .signout { color:var(--text-muted); cursor:pointer; }
        /* ── CONTENT ── */
        .ta-content { max-width:1080px; margin:0 auto; padding:14px 24px 6px; }
        .ta-content.compact { max-width:820px; }
        .ta-section-rule { height:0; border-top:1px solid var(--border); margin:0 0 10px; }
        .ta-section-head { font-family:var(--font); font-size:10px; letter-spacing:3px; color:var(--gold); text-transform:uppercase; margin:0 0 6px; font-weight:600; }
        /* ── CARDS ── */
        .ta-card { border:1px solid var(--border); background:var(--card-bg); padding:10px 12px; margin-bottom:6px; }
        .manila-tab { display:inline-flex; align-items:center; background:var(--bg); border:1px solid var(--border); border-bottom:none; padding:3px 12px; font-size:9px; font-family:var(--mono); letter-spacing:1px; color:var(--text-muted); font-weight:400; cursor:pointer; margin-left:0; margin-bottom:-1px; position:relative; z-index:1; border-radius:4px 4px 0 0; text-transform:uppercase; opacity:0.6; }
        .manila-tab:hover { opacity:0.85; color:var(--text); }
        .manila-tab-active { background:var(--gold); color:var(--bg); font-weight:700; opacity:1; border-color:var(--gold); }
        .manila-tab-active:hover { color:var(--bg); opacity:1; }
        .manila-tab-name { max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; vertical-align:middle; }
        .card { border:1px solid var(--border); background:var(--card-bg); margin-bottom:6px; padding:10px 12px; position:relative; }
        .card-top { display:flex; justify-content:space-between; margin-bottom:4px; }
        .card-meta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; font-size:10px; }
        .card-meta .muted { color:var(--text-muted); }
        .card-url { font-size:9px; color:var(--gold); margin-bottom:4px; }
        .card-reason { font-size:10px; color:var(--text-sec); line-height:1.5; margin-bottom:6px; }
        .card-edits { font-size:9px; color:var(--text-muted); margin-bottom:3px; }
        .card-evidence { font-size:9px; color:var(--text-muted); margin-bottom:6px; }
        .card-actions { display:flex; gap:6px; }
        .card-btn { font-size:8px; padding:3px 8px; border:1px solid var(--border); color:var(--text-sec); cursor:pointer; background:none; }
        .headline-struck { font-size:12px; font-weight:600; text-decoration:line-through; color:var(--text-muted); margin-bottom:1px; }
        .headline-corrected { font-size:12px; font-weight:600; color:var(--red); }
        .headline-affirmed { font-size:12px; font-weight:600; }
        .headline-affirmed .prefix { color:var(--green); }
        .hidden-user { color:var(--text-muted); font-style:italic; }
        /* ── STATUS BADGES ── */
        .status-badge { font-size:8px; padding:2px 6px; letter-spacing:1px; font-weight:700; }
        .status-approved { background:rgba(74,158,85,0.09); border:1px solid rgba(74,158,85,0.27); color:var(--green); }
        .status-rejected { background:rgba(196,74,58,0.09); border:1px solid rgba(196,74,58,0.27); color:var(--red); }
        .status-pending { background:rgba(212,168,67,0.09); border:1px solid rgba(212,168,67,0.27); color:var(--gold); }
        .status-consensus { background:rgba(212,168,67,0.09); border:1px solid rgba(212,168,67,0.27); color:var(--gold); }
        .type-badge { font-size:8px; padding:1px 5px; letter-spacing:1px; font-weight:700; }
        .type-correction { background:rgba(196,74,58,0.09); border:1px solid rgba(196,74,58,0.27); color:var(--red); }
        .type-affirmation { background:rgba(74,158,85,0.09); border:1px solid rgba(74,158,85,0.27); color:var(--green); }
        .di-badge { font-size:8px; padding:1px 5px; background:rgba(212,168,67,0.13); border:1px solid rgba(212,168,67,0.27); color:var(--gold); font-weight:700; letter-spacing:.5px; }
        /* ── RIBBONS (ACCORDIONS) ── */
        .ribbon { margin-bottom:6px; border:1px solid var(--border); }
        .ribbon-head { padding:8px 12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; }
        .ribbon-head.open { background:var(--card-bg); }
        .ribbon-head.closed { background:var(--bg); }
        .ribbon-num { font-size:14px; font-weight:900; color:var(--gold); }
        .ribbon-title { font-size:9px; letter-spacing:2px; text-transform:uppercase; font-weight:600; margin-left:8px; }
        .ribbon-meta { font-size:9px; color:var(--text-muted); margin-left:6px; }
        .ribbon-arrow { font-size:11px; color:var(--gold); transition:transform .2s; }
        .ribbon-body { padding:12px; border-top:1px solid var(--border); }
        /* ── FILTERS ── */
        .filters { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:10px; }
        .filt { padding:3px 8px; font-size:8px; letter-spacing:1px; cursor:pointer; border:1px solid var(--border); color:var(--text-sec); background:none; }
        .filt.active { background:var(--gold); color:var(--bg); font-weight:700; border-color:var(--gold); }
        /* ── FORMS ── */
        .ta-field { margin-bottom:8px; }
        .ta-field label { display:block; font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:3px; font-family:var(--font); }
        .ta-field input,.ta-field textarea,.ta-field select { width:100%; background:var(--card-bg); border:1px solid var(--border); padding:7px 10px; font-size:11px; color:var(--text); font-family:inherit; outline:none; box-sizing:border-box; }
        .ta-field input:focus,.ta-field textarea:focus { border-color:var(--gold); }
        .ta-field textarea { resize:vertical; }
        .field-label { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:3px; }
        .field-input { width:100%; background:var(--card-bg); border:1px solid var(--border); padding:7px 10px; font-size:11px; color:var(--text); font-family:inherit; outline:none; margin-bottom:8px; }
        .field-textarea { width:100%; background:var(--card-bg); border:1px solid var(--border); padding:7px 10px; font-size:11px; color:var(--text); font-family:inherit; outline:none; resize:vertical; margin-bottom:8px; }
        .ta-input { box-sizing:border-box; background:var(--card-bg); border:1px solid var(--border); padding:7px 10px; font-size:11px; color:var(--text); font-family:inherit; outline:none; }
        .ta-input:focus { border-color:var(--gold); }
        /* ── BUTTONS ── */
        .ta-btn-primary,.btn-gold { background:var(--gold); color:var(--bg); border:none; padding:7px 18px; font-size:10px; font-weight:700; letter-spacing:1px; cursor:pointer; font-family:var(--font); }
        .ta-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .btn-gold-outline { font-size:8px; padding:4px 12px; border:1px solid var(--gold); color:var(--gold); font-weight:700; cursor:pointer; background:none; }
        .ta-btn-secondary,.btn-muted { font-size:8px; padding:4px 12px; border:1px solid var(--border); color:var(--text-sec); cursor:pointer; background:none; }
        .ta-btn-ghost { background:none; border:none; padding:4px 8px; font-size:10px; color:var(--text-muted); cursor:pointer; }
        .ta-btn-ghost:hover { color:var(--gold); }
        .ta-link-btn { background:none; border:none; color:var(--gold); font-size:10px; cursor:pointer; text-decoration:underline; padding:0; font-family:var(--font); }
        .import-btn { background:var(--gold); color:var(--bg); padding:7px 12px; font-size:9px; font-weight:700; letter-spacing:1px; cursor:pointer; border:none; }
        .add-btn { font-size:8px; padding:2px 8px; border:1px solid rgba(212,168,67,0.27); color:var(--gold); cursor:pointer; font-weight:600; background:none; }
        /* ── ALERTS ── */
        .ta-error { background:rgba(196,74,58,0.09); border:1px solid rgba(196,74,58,0.27); color:var(--red); padding:8px 12px; margin-bottom:10px; font-size:10px; }
        .ta-success { background:rgba(74,158,85,0.09); border:1px solid rgba(74,158,85,0.27); color:var(--green); padding:8px 12px; margin-bottom:10px; font-size:10px; }
        .ta-label { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); }
        /* ── ADMIN / INFO BOXES ── */
        .admin-box { background:rgba(212,168,67,0.07); border-left:3px solid var(--gold); padding:10px 14px; margin-bottom:8px; }
        .admin-title { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--gold); font-weight:700; margin-bottom:3px; }
        .admin-text { font-size:10px; color:var(--text-sec); line-height:1.5; }
        .wild-box { background:rgba(212,168,67,0.08); border:1px solid rgba(212,168,67,0.2); padding:8px 12px; margin-bottom:10px; }
        .wild-title { font-size:9px; font-weight:700; color:var(--gold); letter-spacing:1px; margin-bottom:3px; }
        .wild-text { font-size:9px; color:var(--text-sec); line-height:1.5; }
        /* ── STEPS ROW ── */
        .steps-row { display:flex; gap:6px; margin-bottom:8px; }
        .step-card { flex:1; background:var(--card-bg); border:1px solid var(--border); padding:10px; }
        .step-title { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--gold); font-weight:700; margin-bottom:4px; }
        .step-text { font-size:10px; color:var(--text-sec); line-height:1.5; }
        .step-text .w { color:var(--text); font-weight:600; }
        .step-text .g { color:var(--gold); font-weight:600; }
        /* ── SPLIT PANE ── */
        .split { display:flex; min-height:calc(100vh - 80px); }
        .form-side { flex:1; padding:14px 16px; border-right:1px solid var(--border); overflow-y:auto; }
        .preview-side { flex:0 0 340px; display:flex; flex-direction:column; }
        .preview-header { background:var(--bg); padding:6px 12px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); flex-shrink:0; }
        .preview-label { font-size:8px; letter-spacing:1px; text-transform:uppercase; color:var(--gold); font-weight:600; }
        .preview-body { flex:1; overflow-y:auto; background:#f8f8f6; padding:14px 12px; font-family:var(--serif); color:#333; }
        /* ── TABS ── */
        .tabs { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:8px; }
        .tab { padding:4px 8px; font-size:8px; letter-spacing:.5px; cursor:pointer; border:1px solid var(--border); color:var(--text-sec); background:none; }
        .tab.active { background:var(--gold); color:var(--bg); font-weight:700; border-color:var(--gold); }
        .tab .count { font-weight:700; }
        .tab.active .count { color:var(--bg); }
        .tab:not(.active) .count { color:var(--gold); }
        /* ── VOTE PANEL ── */
        .vote-panel { padding:8px 12px; border-top:1px solid var(--border); flex-shrink:0; }
        .vote-label { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:3px; }
        .vote-label .req { color:var(--red); }
        .vote-textarea { width:100%; background:var(--card-bg); border:1px solid var(--border); padding:6px 8px; font-size:10px; color:var(--text); font-family:inherit; outline:none; resize:vertical; margin-bottom:4px; }
        .vote-actions { display:flex; gap:3px; }
        .vote-btn { flex:1; text-align:center; padding:5px; font-size:9px; font-weight:700; letter-spacing:1px; cursor:pointer; border:none; }
        .vote-approve { background:var(--green); color:var(--bg); }
        .vote-reject { background:var(--red); color:#fff; }
        .vote-recuse { padding:5px 8px; font-size:9px; color:var(--text-muted); border:1px solid var(--border); cursor:pointer; background:none; flex:0; }
        /* ── REVIEW PAGE ── */
        .section-label { font-size:10px; letter-spacing:3px; color:var(--gold); text-transform:uppercase; margin-bottom:6px; font-weight:600; }
        .education { font-size:14px; color:var(--text); line-height:1.5; margin-bottom:8px; font-weight:500; }
        .anon-box { background:rgba(212,168,67,0.08); border:1px solid rgba(212,168,67,0.2); padding:8px 12px; margin-bottom:10px; }
        .anon-text { font-size:10px; color:var(--text); line-height:1.5; }
        .anon-text .gold { color:var(--gold); font-weight:700; }
        .review-card { margin-bottom:6px; border:1px solid var(--border); position:relative; }
        .review-split { display:flex; min-height:360px; }
        .article-panel { flex:0 0 260px; border-right:1px solid var(--border); display:flex; flex-direction:column; }
        .article-header { padding:6px 10px; border-bottom:1px solid var(--border); font-size:8px; letter-spacing:1px; text-transform:uppercase; color:var(--gold); font-weight:600; flex-shrink:0; }
        .article-body { flex:1; overflow-y:auto; background:#f8f8f6; padding:10px; font-family:var(--serif); }
        .article-body h2 { font-size:12px; font-weight:700; color:#1a1a1a; margin-bottom:4px; }
        .article-body .source { font-size:9px; color:#999; margin-bottom:8px; font-family:sans-serif; }
        .article-body p { font-size:10px; line-height:1.6; color:#333; margin-bottom:8px; }
        .article-body .highlight { background:rgba(212,168,67,0.2); padding:0 2px; }
        .submission-panel { flex:1; display:flex; flex-direction:column; }
        .submission-body { padding:10px 12px; background:var(--card-bg); flex:1; overflow-y:auto; }
        .sub-meta { display:flex; gap:6px; align-items:center; margin-bottom:6px; font-size:10px; flex-wrap:wrap; }
        .sub-meta .hidden { color:var(--text-muted); font-style:italic; }
        .sub-meta .muted { color:var(--text-muted); }
        .sub-original { font-size:12px; font-weight:600; text-decoration:line-through; color:var(--text-muted); margin-bottom:1px; }
        .sub-corrected { font-size:12px; font-weight:600; color:var(--red); margin-bottom:8px; }
        .sub-affirmed { font-size:12px; font-weight:600; color:var(--green); margin-bottom:8px; }
        .sub-reason { font-size:10px; color:var(--text-sec); line-height:1.5; margin-bottom:8px; }
        .sub-evidence { display:flex; justify-content:space-between; align-items:center; font-size:9px; color:var(--text-muted); border-top:1px solid var(--border); padding-top:6px; }
        .confirm-overlay { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(10,10,6,0.94); display:flex; align-items:center; justify-content:center; z-index:10; }
        .confirm-box { border:1px solid var(--border); padding:20px; text-align:center; max-width:280px; background:var(--card-bg); }
        .confirm-title { font-size:13px; font-weight:700; margin-bottom:6px; }
        .confirm-desc { font-size:10px; color:var(--text-sec); margin-bottom:14px; line-height:1.5; }
        .confirm-actions { display:flex; gap:6px; justify-content:center; }
        .confirm-yes { padding:6px 16px; font-size:10px; font-weight:700; letter-spacing:1px; cursor:pointer; border:none; color:var(--bg); }
        .confirm-no { padding:6px 16px; font-size:10px; border:1px solid var(--border); color:var(--text-sec); cursor:pointer; background:none; }
        .card-collapsed { border:1px solid var(--border); padding:10px 12px; background:var(--card-bg); margin-bottom:6px; }
        .dispute-box { padding:10px 12px; border:1px solid rgba(212,168,67,0.27); background:rgba(212,168,67,0.05); margin-bottom:8px; }
        .outcome-box { padding:10px 12px; border:1px solid var(--border); margin-bottom:6px; }
        .juror-note { font-size:10px; padding:6px 8px; margin-bottom:4px; border-left:3px solid var(--border); line-height:1.5; }
        .recovery-box { padding:10px 12px; border:1px solid rgba(212,168,67,0.27); background:rgba(212,168,67,0.05); margin-top:8px; }
        @media(max-width:768px) { .review-split{flex-direction:column;} .article-panel{flex:none;max-height:200px;} }
        /* ── TRUST BAR ── */
        .trust-bar { background:var(--card-bg); border:1px solid var(--border); padding:6px 10px; margin-bottom:4px; }
        .trust-top { display:flex; justify-content:space-between; font-size:9px; margin-bottom:3px; }
        .trust-name { color:var(--gold); font-weight:600; }
        .trust-count { color:var(--text-muted); }
        .trust-track { display:flex; height:4px; background:var(--border); }
        .trust-fill { background:var(--gold); }
        /* ── STAT CARDS ── */
        .stat-row { display:flex; gap:6px; margin-bottom:12px; }
        .stat-card { flex:1; background:var(--card-bg); border:1px solid var(--border); padding:10px; text-align:center; }
        .stat-num { font-size:24px; font-weight:900; }
        .stat-label { font-size:8px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
        /* ── PAGINATION ── */
        .pagination { padding:10px 24px; display:flex; justify-content:center; gap:3px; }
        .page-btn { padding:3px 8px; font-size:9px; border:1px solid var(--border); color:var(--text-sec); cursor:pointer; background:none; }
        .page-btn.active { background:var(--gold); color:var(--bg); font-weight:700; border-color:var(--gold); }
        /* ── ASSEMBLY CARDS ── */
        .asm-card { border:1px solid var(--border); background:var(--card-bg); padding:14px; margin-bottom:8px; }
        .asm-card.joined { border-color:rgba(212,168,67,0.27); }
        .asm-card.following { border-color:rgba(212,168,67,0.2); }
        .asm-name { font-size:14px; font-weight:700; margin-bottom:2px; }
        .asm-desc { font-size:10px; color:var(--text-sec); line-height:1.5; }
        .asm-tag { padding:3px 7px; font-size:8px; border:1px solid var(--border); color:var(--text-sec); cursor:pointer; }
        .asm-tag.selected { background:var(--gold); color:var(--bg); font-weight:700; border-color:var(--gold); }
        /* ── SUBMIT SCREEN — ledger white design ── */
        .headline-big { font-size:22px; font-weight:900; font-family:var(--serif); margin-bottom:4px; }
        .sub-text { font-size:11px; color:var(--text-sec); line-height:1.5; margin-bottom:10px; }
        .mode-row { display:flex; gap:6px; margin-bottom:10px; }
        .mode-btn { flex:1; padding:8px; font-size:10px; letter-spacing:1px; text-align:center; cursor:pointer; text-transform:uppercase; }
        .mode-correction { background:rgba(196,74,58,0.13); border:1.5px solid var(--red); color:var(--red); font-weight:700; }
        .mode-correction.dim { background:rgba(196,74,58,0.05); border:1.5px solid rgba(196,74,58,0.27); color:var(--red); font-weight:400; }
        .mode-affirmation { background:rgba(74,158,85,0.07); border:1.5px solid rgba(74,158,85,0.27); color:var(--green); }
        .mode-affirmation.bright { background:rgba(74,158,85,0.13); border:1.5px solid var(--green); font-weight:700; }
        .mode-desc { font-size:8px; font-weight:400; margin-top:2px; color:var(--text-sec); text-transform:none; letter-spacing:0; }
        .asm-label { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:3px; }
        .asm-label .gold { color:var(--gold); }
        .asm-row { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:4px; }
        .loaded-box { background:var(--card-bg); border:1px solid rgba(74,158,85,0.27); padding:10px; margin-bottom:6px; }
        .loaded-label { font-size:9px; color:var(--green); letter-spacing:1px; font-weight:600; margin-bottom:6px; text-transform:uppercase; }
        .unlock-msg { font-size:9px; color:var(--gold); text-align:center; margin-top:6px; }
        .evidence-row { display:flex; justify-content:space-between; align-items:center; margin-top:4px; border-top:1px solid var(--border); padding-top:4px; }
        .evidence-count { font-size:9px; color:var(--text-muted); }
        .edit-block { background:var(--card-bg); border:1px solid var(--border); padding:10px; margin-bottom:6px; }
        .edit-header { display:flex; justify-content:space-between; margin-bottom:4px; }
        .edit-num { font-size:9px; color:var(--gold); letter-spacing:1px; font-weight:600; }
        .edit-hint { font-size:8px; color:var(--text-muted); }
        .add-link { font-size:10px; color:var(--gold); cursor:pointer; background:none; border:none; font-family:inherit; }
        .search-input { width:100%; background:var(--card-bg); border:1px solid var(--border); padding:7px 10px; font-size:11px; color:var(--text); font-family:inherit; outline:none; margin-bottom:10px; }
        .create-label { font-size:9px; color:var(--gold); letter-spacing:1px; font-weight:600; margin:8px 0 6px; text-transform:uppercase; }
        .vault-item { background:var(--card-bg); border:1px solid var(--border); padding:8px; margin-bottom:6px; }
        .vault-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; }
        .vault-type { font-size:9px; color:var(--gold); letter-spacing:1px; font-weight:600; text-transform:uppercase; }
        .vault-desc { font-size:8px; color:var(--text-muted); margin-bottom:4px; }
        .vault-note { font-size:8px; color:var(--text-muted); }
        .vault-note .gold { color:var(--gold); font-weight:600; }
        .action-row { padding:6px 0; display:flex; justify-content:space-between; }
        .btn-draft { font-size:9px; border:1px solid var(--border); color:var(--text-sec); padding:6px 12px; cursor:pointer; background:none; font-family:inherit; }
        .btn-submit { background:var(--gold); color:var(--bg); padding:7px 18px; font-size:10px; font-weight:700; letter-spacing:1px; cursor:pointer; border:none; font-family:inherit; }
        .btn-submit:disabled { opacity:0.5; cursor:default; }
        .pv-section { font-size:9px; color:var(--red); font-weight:600; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; font-family:var(--font); }
        .pv-headline { font-size:15px; font-weight:700; line-height:1.25; color:#1a1a1a; margin-bottom:3px; }
        .pv-corrected { font-size:14px; font-weight:700; line-height:1.25; color:var(--red); margin-bottom:3px; }
        .pv-subtitle { font-size:11px; color:#666; font-style:italic; margin-bottom:4px; }
        .pv-author { font-size:10px; color:#999; margin-bottom:12px; font-family:var(--font); }
        .pv-diff-del { background:rgba(196,74,58,0.12); text-decoration:line-through; text-decoration-color:#9e3527; color:#9e3527; }
        .pv-diff-ins { background:rgba(74,158,85,0.12); border-left:2px solid var(--green); padding-left:4px; color:#2d6e34; }
        .pv-p { font-size:11px; line-height:1.7; color:#333; margin-bottom:10px; }
        .pv-annot-section { border-top:1px solid #ddd; padding-top:10px; font-family:var(--font); margin-top:14px; }
        .pv-annot-label { font-size:8px; letter-spacing:1px; text-transform:uppercase; color:#999; margin-bottom:6px; }
        .pv-annot-box { background:#f0f0ea; border:1px solid #ddd; padding:6px 8px; margin-bottom:4px; }
        .pv-annot-type { font-size:7px; color:#b8963e; letter-spacing:1px; font-weight:600; text-transform:uppercase; }
        .pv-annot-text { font-size:10px; color:#333; margin-top:2px; }
        .pv-headline.struck { text-decoration:line-through; text-decoration-color:var(--red); color:#999; }
        .toggle { display:flex; border:1px solid var(--border); cursor:pointer; }
        .toggle span { padding:3px 7px; font-size:8px; letter-spacing:1px; text-transform:uppercase; }
        .toggle .off { color:var(--text-sec); }
        .toggle .on { background:var(--gold); color:var(--bg); font-weight:700; }
        .confirm-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:1000; display:flex; align-items:center; justify-content:center; }
        .confirm-box { background:var(--card-bg); border:1px solid var(--border); padding:24px; max-width:440px; width:90%; }
        .di-banner { padding:8px 10px; background:var(--card-bg); border:1px solid var(--border); margin-bottom:6px; font-size:9px; color:var(--text-sec); line-height:1.6; }
        .penalty-banner { padding:8px 10px; background:rgba(196,74,58,0.08); border:1px solid rgba(196,74,58,0.27); margin-bottom:6px; font-size:9px; color:var(--red); line-height:1.6; }
        .grace-banner { padding:10px; background:rgba(74,158,85,0.08); border:1px solid rgba(74,158,85,0.27); margin-top:10px; }
        /* ── REVIEW PAGE TABS ── */
        .ta-review-tabs { display:flex; flex-wrap:wrap; gap:0; margin-bottom:16px; border-bottom:2px solid var(--border); }
        .ta-review-tab { padding:8px 16px; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-2px; font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:0.08em; cursor:pointer; white-space:nowrap; color:var(--text-muted); transition:color 0.15s; }
        .ta-review-tab:hover { color:var(--text); }
        .ta-review-tab.active { color:var(--gold); font-weight:700; border-bottom-color:var(--gold); }
        @media(max-width:640px) { .ta-review-tab{padding:6px 10px;font-size:9px} .manila-tab-name{display:none} .manila-tab{padding:3px 8px;} }
        /* ── MOBILE NAV ── */
        .ta-nav-mobile { display:none; background:var(--bg); padding:8px 24px; border-bottom:1px solid var(--border); position:relative; }
        .ta-hamburger { background:none; border:none; cursor:pointer; padding:6px 2px; display:flex; flex-direction:column; gap:4px; }
        .ta-hamburger-line { display:block; width:22px; height:2px; background:var(--gold); transition:transform 0.2s, opacity 0.2s; }
        .ta-hamburger-line.open:nth-child(1) { transform:translateY(6px) rotate(45deg); }
        .ta-hamburger-line.open:nth-child(2) { opacity:0; }
        .ta-hamburger-line.open:nth-child(3) { transform:translateY(-6px) rotate(-45deg); }
        .ta-mobile-menu { position:absolute; top:100%; left:0; right:0; background:var(--card-bg); border-bottom:1px solid var(--border); z-index:110; padding:8px 0; max-height:70vh; overflow-y:auto; }
        .ta-mobile-menu-item { display:block; padding:10px 24px; font-size:14px; color:var(--text-sec); text-decoration:none; font-family:var(--font); }
        .ta-mobile-menu-item:hover { background:var(--bg); }
        .ta-mobile-menu-item.active { color:var(--gold); font-weight:600; }
        .ta-mobile-menu-divider { height:1px; background:var(--border); margin:6px 0; }
        .ta-mobile-menu-group { padding:8px 24px 4px; font-size:10px; font-family:var(--mono); text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); font-weight:600; }
        @media(max-width:768px) { .ta-nav-desktop{display:none !important;} .ta-nav-mobile{display:block;} .split{flex-direction:column;} .preview-side{flex:none;height:300px;} .ta-preview-panel{display:none !important;} }
        /* ── NOTIFICATIONS ── */
        .ta-notif-bell { position:relative; color:var(--text-muted); padding:4px; cursor:pointer; }
        .ta-notif-bell:hover { color:var(--gold); }
        .ta-notif-badge { position:absolute; top:-2px; right:-4px; background:var(--gold); color:#0d0d0a; font-size:8px; min-width:14px; height:14px; display:flex; align-items:center; justify-content:center; font-weight:700; padding:0 3px; border-radius:50%; }
        .ta-notif-dropdown { position:absolute; top:28px; right:0; width:300px; max-height:400px; background:var(--card-bg); border:1px solid var(--border); z-index:100; overflow:hidden; }
        .ta-notif-header { padding:10px 14px; font-size:12px; font-weight:700; border-bottom:1px solid var(--border); color:var(--gold); }
        .ta-notif-empty { padding:24px 14px; text-align:center; color:var(--text-muted); font-size:12px; }
        .ta-notif-list { max-height:350px; overflow-y:auto; }
        .ta-notif-item { padding:10px 14px; border-bottom:1px solid var(--border); font-size:12px; }
        .ta-notif-item:last-child { border-bottom:none; }
        .ta-notif-unread { background:rgba(212,168,67,0.05); }
        .ta-notif-text { color:var(--text-sec); line-height:1.4; }
        .ta-notif-time { color:var(--text-muted); font-size:10px; margin-top:3px; }
        /* ── FEEDBACK ── */
        .ta-feedback-fab { position:fixed; bottom:24px; right:24px; z-index:90; background:var(--gold); color:var(--bg); border:none; padding:10px 16px; font-family:var(--font); font-size:12px; font-weight:600; cursor:pointer; }
        .ta-feedback-fab:hover { opacity:0.9; }
        .ta-feedback-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
        .ta-feedback-modal { background:var(--card-bg); border:1px solid var(--border); padding:24px; max-width:480px; width:100%; }
        .ta-feedback-modal h3 { margin:0 0 6px; font-size:18px; font-weight:700; color:var(--gold); }
        .ta-feedback-modal p { margin:0 0 16px; font-size:13px; color:var(--text-sec); line-height:1.5; }
        .ta-feedback-charcount { text-align:right; font-size:11px; color:var(--text-muted); margin-top:4px; }
        @media(max-width:640px) { .ta-feedback-fab{bottom:16px;right:16px;font-size:11px;padding:8px 14px;} .ta-content{padding:10px 16px;} }
        /* ── FOOTER ── */
        .footer { padding:12px 24px; border-top:1px solid var(--border); display:flex; justify-content:center; gap:20px; font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); }
        .footer span { cursor:pointer; }
        .disclaimer { padding:4px 24px 8px; font-size:8px; color:var(--text-muted); text-align:center; }
        /* ── NAV DROPDOWN (for More menu) ── */
        .ta-nav-dropdown-trigger { background:none; border:none; font-family:var(--font); cursor:pointer; font-size:9px; text-transform:uppercase; letter-spacing:1px; color:var(--text); }
        .ta-nav-dropdown-trigger.active { color:var(--gold); font-weight:700; }
        .ta-nav-dropdown-menu { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); min-width:180px; background:var(--card-bg); border:1px solid var(--border); z-index:110; padding:4px 0; margin-bottom:2px; }
        .ta-nav-dropdown-item { display:block; width:100%; padding:8px 16px; font-size:11px; color:var(--text-sec); text-decoration:none; cursor:pointer; border:none; background:none; text-align:left; font-family:var(--font); }
        .ta-nav-dropdown-item:hover { background:var(--bg); color:var(--gold); }
        .ta-nav-dropdown-item.active { color:var(--gold); font-weight:600; }
        .ta-nav-badge { background:var(--gold); color:#0d0d0a; font-size:8px; padding:1px 5px; font-weight:700; margin-left:4px; border-radius:50%; }
      `}</style>

      {verifyEmailToken ? (
        <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px" }}>
          <VerifyEmailScreen token={verifyEmailToken} onDone={() => { setVerifyEmailToken(null); window.history.replaceState(null, "", "/feed"); setScreenRaw("feed"); }} />
        </div>
      ) : resetToken ? (
        <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px" }}>
          <ResetPasswordScreen token={resetToken} onDone={() => { setResetToken(null); setScreenRaw("login"); window.history.replaceState(null, "", "/login"); }} />
        </div>
      ) : !user && viewingRecord ? (
        <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px" }}>
          <RecordScreen recordId={viewingRecord} onBack={() => { setViewingRecord(null); window.history.back(); }} onViewCitizen={navigateToCitizen} />
        </div>
      ) : !user && showExtPage ? (
        /* ── EXTENSION PAGE (unauthenticated, standalone) ── */
        <div>
          <div className="hdr">
            <div className="hdr-left">
              <div className="hdr-bar" />
              <span className="hdr-title">Trust Assembly</span>
              <span className="hdr-sub">TRUTH WILL OUT</span>
              <span className="hdr-beta">BETA</span>
            </div>
          </div>
          <div className="gold-rule" />
          <div style={{ maxWidth: 580, margin: "0 auto", padding: "20px" }}>
            <button className="ta-link-btn" style={{ fontSize: 12, marginBottom: 16 }} onClick={() => setShowExtPage(false)}>&larr; Back to home</button>
            <ExtensionsScreen />
          </div>
        </div>
      ) : !user ? (
        /* ══════════════════════════════════════
           ANONYMOUS LANDING / SUBMIT
           ══════════════════════════════════════ */
        <div style={{ color: "#1a1a1a" }}>
          {/* Header */}
          <div className="hdr" style={{ background: "#f5f2ec" }}>
            <div className="hdr-left">
              <div className="hdr-bar" />
              <span className="hdr-title">Trust Assembly</span>
              <span className="hdr-sub">TRUTH WILL OUT</span>
              <span className="hdr-beta">BETA</span>
            </div>
            <button onClick={() => { setScreen("login"); setLoginAccordion(true); }} style={{ fontSize: 10, fontWeight: 700, color: "var(--gold)", background: "none", border: "1px solid var(--gold)", cursor: "pointer", padding: "4px 12px", letterSpacing: "1px", textTransform: "uppercase" }}>Login</button>
          </div>
          <div className="gold-rule" />

          {/* LOGIN/REGISTER MODAL */}
          {loginAccordion && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "40px 20px" }}
              onClick={e => { if (e.target === e.currentTarget) setLoginAccordion(false); }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: "28px", maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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
                    <RegisterScreen onRegister={u => { setLoginAccordion(false); setUser(u); setTheme("light"); setFontSize("large"); setContentWidth("compact"); setShowOnboarding(true); }} />
                    <div style={{ marginTop: 16, textAlign: "center" }}>
                      <button className="ta-link-btn" onClick={() => setScreen("login")}>Already a citizen? Sign in</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Anonymous submit page or Landing page */}
          {screen === "submit" ? (
            <div style={{ maxWidth: 660, margin: "0 auto", padding: "20px" }}>
              <SubmitScreen user={null} onShowRegistration={() => { setLoginAccordion(true); setScreen("register"); }} />
            </div>
          ) : (
            <LandingPage
              onSubmitUrl={(url) => { setScreen("submit"); window.history.pushState({ screen: "submit" }, "", "/submit?url=" + encodeURIComponent(url)); }}
              onLogin={() => { setLoginAccordion(true); setScreen("login"); }}
              onRegister={() => { setLoginAccordion(true); setScreen("register"); }}
            />
          )}
        </div>
      ) : (
        <div>
          {/* ── HEADER ── */}
          <div className="hdr">
            <div className="hdr-left" style={{ cursor: "pointer" }} onClick={() => setScreen("feed")}>
              <div className="hdr-bar" />
              <span className="hdr-title">Trust Assembly</span>
              <span className="hdr-sub">TRUTH WILL OUT</span>
              <span className="hdr-beta">BETA</span>
            </div>
          </div>
          <div className="gold-rule" />

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
                  <a key={n.key} href={`/${n.key}`} className={`ta-mobile-menu-item ${screen === n.key ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen(n.key); setMobileMenuOpen(false); }}>
                    {n.label}
                    {n.key === "review" && (reviewCount + crossCount + disputeCount) > 0 && <span className="ta-nav-badge" style={{ marginLeft: 6 }}>{reviewCount + crossCount + disputeCount}</span>}
                  </a>
                ))}
                <div className="ta-mobile-menu-divider" />
                {NAV_DROPDOWNS.map(dd => (
                  <React.Fragment key={dd.label}>
                    <div className="ta-mobile-menu-group">{dd.label}</div>
                    {dd.items.map(n => (
                      <a key={n.key} href={`/${n.key}`} className={`ta-mobile-menu-item ${screen === n.key ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen(n.key); setMobileMenuOpen(false); }}>{n.label}</a>
                    ))}
                  </React.Fragment>
                ))}
                {(isAdmin || hasSubmittedFeedback) && (
                  <a href="/feedback" className={`ta-mobile-menu-item ${screen === "feedback" ? "active" : ""}`} style={isAdmin ? { color: "var(--sienna)", fontWeight: 600 } : undefined} onClick={(e) => { e.preventDefault(); setScreen("feedback"); setMobileMenuOpen(false); }}>Feedback</a>
                )}
                {isAdmin && (
                  <a href="/agent" className={`ta-mobile-menu-item ${screen === "agent" ? "active" : ""}`} style={{ color: "var(--gold)", fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setScreen("agent"); setMobileMenuOpen(false); }}>Agent</a>
                )}
                {isAdmin && (
                  <a href="/admin/system-health" className="ta-mobile-menu-item" style={{ color: "var(--purple)", fontWeight: 600 }} onClick={(e) => { e.preventDefault(); window.open("/admin/system-health", "_blank"); setMobileMenuOpen(false); }}>Admin Dashboard</a>
                )}
              </div>
            )}
          </div>

          {/* USER BAR */}
          <div className="user-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div>
                <span className="name" style={{ cursor: "pointer" }} onClick={() => setScreen("profile")}>@{user.displayName || user.username}</span>
                <span className="meta"> · {navProfile.profile} ·</span>
                <span className="score"> {navProfile.trustScore}</span>
              </div>
              <div className="hdr-nav ta-nav-desktop">
                {NAV_PRIMARY.map(n => (
                  <span key={n.key} style={{ fontWeight: 700 }} className={screen === n.key ? "active" : ""} onClick={() => setScreen(n.key)}>
                    {n.label}
                    {n.key === "review" && (reviewCount + crossCount + disputeCount) > 0 && <span className="ta-nav-badge">{reviewCount + crossCount + disputeCount}</span>}
                  </span>
                ))}
                <NavDropdown label="More" dropDown items={[
                  ...NAV_DROPDOWNS.flatMap(dd => dd.items)
                ]} screen={screen} setScreen={setScreen} isAdmin={isAdmin} hasSubmittedFeedback={hasSubmittedFeedback} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div ref={notifRef} style={{ position: "relative" }}>
                {alertsEnabled && <button className="ta-btn-ghost ta-notif-bell" onClick={() => { setShowNotifDropdown(v => !v); if (!showNotifDropdown) markNotifsRead(); }} title="Notifications" aria-label="Notifications">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  {notifications.filter(n => !n.read).length > 0 && <span className="ta-notif-badge">{notifications.filter(n => !n.read).length}</span>}
                </button>}
                {showNotifDropdown && (
                  <div className="ta-notif-dropdown">
                    <div className="ta-notif-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Notifications</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {notifications.length > 0 && <button onClick={() => { setNotifications([]); markNotifsRead(); }} style={{ background: "none", border: "none", fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", cursor: "pointer", letterSpacing: "0.5px", padding: 0 }}>CLEAR ALL</button>}
                        <button onClick={() => setShowNotifDropdown(false)} style={{ background: "none", border: "none", fontSize: 16, color: "var(--text-muted)", cursor: "pointer", lineHeight: 1, padding: 0 }} aria-label="Close notifications">&times;</button>
                      </div>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="ta-notif-empty">No notifications yet</div>
                    ) : (
                      <div className="ta-notif-list">
                        {notifications.slice(0, 20).map(n => {
                          const info = formatNotification(n);
                          return (
                          <div key={n.id} className={`ta-notif-item ${n.read ? "" : "ta-notif-unread"}`} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                            <div style={{ flex: 1, cursor: info.screen || info.recordId ? "pointer" : "default" }} onClick={() => { if (info.recordId) { navigateToRecord(info.recordId); setShowNotifDropdown(false); } else if (info.screen) { setScreen(info.screen); setShowNotifDropdown(false); } }}>
                              <div className="ta-notif-text">{info.text}{info.screen && <span style={{ fontSize: 10, color: "var(--gold)", marginLeft: 4 }}>&rarr; Go</span>}</div>
                              <div className="ta-notif-time">{new Date(n.createdAt).toLocaleDateString()}</div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setNotifications(prev => prev.filter(x => x.id !== n.id)); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: "0 2px", lineHeight: 1, flexShrink: 0 }} title="Dismiss">&times;</button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="signout" onClick={logout}>Sign Out</span>
            </div>
          </div>

          <div className={`ta-content${contentWidth === "compact" ? " compact" : ""}`} style={{ opacity: screenTransition ? 0.3 : 1, transition: "opacity 0.08s ease" }}>
            {/* Breadcrumb */}
            {!viewingRecord && !viewingCitizen && screen !== "feed" && (() => {
              const labels = { submit: "Submit", review: "Review", orgs: "Assemblies", vault: "Vaults", consensus: "Consensus", stories: "Stories", audit: "Ledger", profile: "Citizen Profile", extensions: "Extension", guide: "Learn", "ai-agents": "AI Agents", rules: "Rules", about: "About", feedback: "Feedback", badges: "Badges", vision: "Vision" };
              const label = labels[screen];
              return label ? (
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: "0.5px", marginBottom: 6 }}>
                  <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => setScreen("feed")}>Home</span>
                  <span style={{ margin: "0 6px", color: "var(--border)" }}>/</span>
                  <span>{label}</span>
                </div>
              ) : null;
            })()}
            {user && user.emailVerified === false && (
              <div style={{ background: "rgba(212,168,67,0.09)", border: "1.5px solid var(--gold)", padding: "10px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 9, fontFamily: "var(--mono)", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 3 }}>Verify your email</div>
                  <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.5 }}>Check your inbox for the verification link to start submitting corrections.</div>
                </div>
                <button onClick={async () => {
                  try {
                    const res = await fetch("/api/auth/resend-verification", { method: "POST" });
                    const data = await res.json();
                    alert((data.data || data).message || "Verification email sent.");
                  } catch { alert("Network error."); }
                }} style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--gold)", background: "none", border: "1px solid var(--gold)", padding: "4px 10px", cursor: "pointer", letterSpacing: "0.5px", whiteSpace: "nowrap", marginLeft: 12 }}>RESEND</button>
              </div>
            )}
            {extCta && (
              <div style={{ background: "rgba(212,168,67,0.09)", border: "1.5px solid var(--gold)", padding: "10px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 9, fontFamily: "var(--mono)", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 3 }}>{extCta === "install" ? "Get the browser extension" : "Extension update available"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.5 }}>
                    {extCta === "install"
                      ? "See corrections, affirmations, and translations on every news site you visit."
                      : "A new version of the Trust Assembly extension is available with the latest features."}
                    {" "}<span style={{ color: "var(--gold)", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setScreen("extensions"); dismissExtCta(); }}>{extCta === "install" ? "Download now" : "Update now"}</span>
                  </div>
                </div>
                <button onClick={dismissExtCta} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, padding: "0 0 0 12px", lineHeight: 1 }}>&times;</button>
              </div>
            )}
            {viewingRecord ? (
              <RecordScreen recordId={viewingRecord} onBack={() => window.history.back()} onViewCitizen={navigateToCitizen} />
            ) : viewingCitizen ? (
              <CitizenLookupScreen username={viewingCitizen} onBack={() => window.history.back()} onViewCitizen={navigateToCitizen} currentUser={user} />
            ) : <>
            {screen === "feed" && <FeedScreen user={user} siteAnnouncement={announcementDismissed === siteAnnouncement ? null : siteAnnouncement} hideCarousel={hideCarousel} hideStatusCards={hideStatusCards} onDismissAnnouncement={() => { setAnnouncementDismissed(siteAnnouncement); try { localStorage.setItem("ta_announcement_dismissed", siteAnnouncement); } catch {} }} onNavigate={(s, draftId) => { if (draftId) setActiveDraftId(draftId); setScreen(s); }} onViewCitizen={navigateToCitizen} onViewRecord={navigateToRecord} onViewAssembly={(orgId) => { setViewingAssemblyId(orgId); setScreen("orgs"); }} />}
            {screen === "orgs" && <OrgScreen user={user} onUpdate={setUser} onViewCitizen={navigateToCitizen} initialViewingOrg={viewingAssemblyId} onViewingOrgChange={() => setViewingAssemblyId(null)} />}
            {screen === "submit" && <SubmitScreen user={user} onUpdate={setUser} draftId={activeDraftId} onDraftLoaded={() => setActiveDraftId(null)} onShowRegistration={() => { setLoginAccordion(true); setScreen("register"); }} onShowEmailVerify={() => setShowEmailVerifyPopup(true)} />}
            {screen === "review" && <ReviewScreen user={user} />}
            {screen === "vault" && <VaultScreen user={user} />}
            {screen === "consensus" && <ConsensusScreen onViewCitizen={navigateToCitizen} />}
            {screen === "stories" && <StoriesScreen user={user} onViewCitizen={navigateToCitizen} onViewRecord={navigateToRecord} />}
            {screen === "profile" && <ProfileScreen user={user} onViewCitizen={navigateToCitizen} theme={theme} setTheme={setTheme} fontSize={fontSize} setFontSize={setFontSize} contentWidth={contentWidth} setContentWidth={setContentWidth} hideCarousel={hideCarousel} setHideCarousel={setHideCarousel} hideStatusCards={hideStatusCards} setHideStatusCards={setHideStatusCards} alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled} />}
            {screen === "audit" && <AuditScreen />}
            {screen === "guide" && <OnboardingFlow onComplete={() => setScreen("feed")} embedded />}
            {screen === "rules" && <RulesScreen />}
            {screen === "badges" && <BadgesScreen />}
            {screen === "about" && <AboutScreen />}
            {screen === "ai-agents" && <AIAgentLearnPage />}
            {screen === "vision" && <VisionScreen />}
            {screen === "extensions" && <ExtensionsScreen />}
            {screen === "admin-tools" && isAdmin && <AdminToolsScreen setShowOnboarding={setShowOnboarding} user={user} />}
            {screen === "agent" && <AgentPage user={user} />}
            {screen === "feedback" && (isAdmin || hasSubmittedFeedback) && <FeedbackScreen isAdmin={isAdmin} currentUsername={user.username} />}
            </>}
          </div>

          <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center", gap: 20, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-muted)", maxWidth: contentWidth === "compact" ? 820 : 1080, margin: "0 auto" }}>
            {NAV_DROPDOWNS.map(dd => (
              <NavDropdown key={dd.label} label={dd.label} items={dd.items} screen={screen} setScreen={setScreen} isAdmin={isAdmin} hasSubmittedFeedback={hasSubmittedFeedback} />
            ))}
          </div>

          {/* Floating feedback button — collapsible, visible to non-admin */}
          {!isAdmin && !feedbackDismissed && (
            <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 90, display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => { setShowFeedbackModal(true); setFeedbackSent(false); setFeedbackError(""); }}
                style={{ background: "var(--gold)", color: "var(--bg)", border: "none", padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
                Feedback
              </button>
              <button onClick={() => setFeedbackDismissed(true)}
                style={{ background: "var(--gold)", color: "var(--bg)", border: "none", width: 28, height: 28, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
                &times;
              </button>
            </div>
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
                        rows={4}
                        style={{ fontSize: 14 }}
                      />
                      <div className="ta-feedback-charcount">{feedbackText.length} / 1,000</div>
                    </div>
                    <div className="ta-field" style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", fontWeight: 600 }}>Suggest a Prompt</label>
                      <textarea
                        value={feedbackPrompt}
                        onChange={e => { if (e.target.value.length <= 5000) setFeedbackPrompt(e.target.value); }}
                        placeholder="What do you want changed and in what part of the system? Try writing a prompt that the admin can copy and paste into Claude Code to get your change delivered more quickly."
                        rows={3}
                        style={{ fontSize: 12, color: "var(--text-sec)" }}
                      />
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
