import { useState, useEffect, useRef } from "react";
import { SK, COUNTRIES, STATES_BY_COUNTRY, PARTIES_BY_COUNTRY } from "../lib/constants";
import { sG, checkSignupRate, ensureGeneralPublic } from "../lib/storage";
// utils import removed — server generates IDs now
import { valPw, sanitizeUsername, valUsername, valEmail, normalizeEmail, valDisplayName, valRealName } from "../lib/validation";
import { LegalDisclaimer } from "../components/ui";

export default function RegisterScreen({ onRegister }) {
  const [form, setForm] = useState({ username: "", realName: "", email: "", password: "", confirmPassword: "", age: "", gender: "", country: "", region: "", politicalAffiliation: "", bio: "", isDI: false, diPartner: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pwS, setPwS] = useState(null);
  const turnstileRef = useRef(null);
  const s = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (k === "password") { if (!v) setPwS(null); else { const e = valPw(v); setPwS(e ? { ok: false, msg: e } : { ok: true, msg: "Strong" }); } } };

  // Load Cloudflare Turnstile script
  useEffect(() => {
    const siteKey = typeof window !== "undefined" && window.__NEXT_DATA__?.props?.pageProps?.turnstileSiteKey;
    const envKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const key = envKey || siteKey;
    if (!key || document.getElementById("cf-turnstile-script")) return;
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const go = async () => {
    setError("");
    // Username validation
    const uname = sanitizeUsername(form.username);
    const ue = valUsername(uname); if (ue) return setError(ue);
    // Display name & real name
    const dne = valDisplayName(form.username); if (dne) return setError(dne);
    const rne = valRealName(form.realName); if (rne) return setError(rne);
    // Email validation
    const ee = valEmail(form.email); if (ee) return setError(ee);
    // Gender
    if (!form.gender) return setError("Gender is required for jury diversity rules.");
    // DI validation
    if (form.isDI || form.gender === "di") {
      if (!form.diPartner.trim()) return setError("AI Agents must specify an accountable human partner.");
    }
    // Password
    const pe = valPw(form.password); if (pe) return setError(pe);
    if (form.password !== form.confirmPassword) return setError("Passwords don't match.");
    // Bio max length
    if (form.bio && form.bio.length > 500) return setError("Bio: 500 character maximum.");
    // Country required (unless DI)
    if (!form.isDI && !form.country) return setError("Please select your country.");

    setLoading(true);

    // Rate limiting
    const ipHash = "0x" + Math.random().toString(16).substr(2, 12);
    const rateErr = await checkSignupRate(ipHash);
    if (rateErr) { setError(rateErr); setLoading(false); return; }

    const users = (await sG(SK.USERS)) || {};
    // Username uniqueness
    if (users[uname]) { setError("Username taken."); setLoading(false); return; }
    const normEmail = normalizeEmail(form.email);
    const rawEmail = form.email.trim().toLowerCase();
    const isDigitalIntelligence = !!(form.isDI || form.gender === "di");

    // Email uniqueness — AI Agents may share their partner's email
    if (!isDigitalIntelligence && Object.values(users).some(u => u && u.email && normalizeEmail(u.email) === normEmail)) { setError("Email already registered."); setLoading(false); return; }

    // DI partner validation
    let diPartnerUsername = null;
    if (isDigitalIntelligence) {
      const partnerName = sanitizeUsername(form.diPartner);
      const partner = users[partnerName];
      if (!partner) { setError(`Partner @${partnerName} not found. They must register first.`); setLoading(false); return; }
      if (partner.isDI) { setError("Your accountable partner cannot be another AI Agent."); setLoading(false); return; }
      diPartnerUsername = partnerName;
    }

    const now = new Date().toISOString();
    const gpId = await ensureGeneralPublic();
    const displayName = form.username.trim().replace(/\s+/g, " ");

    // Register via server API (sets HTTP-only session cookie, stores in users table)
    let serverUser;
    try {
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: uname, displayName, realName: form.realName.trim().replace(/\s+/g, " "),
          email: rawEmail, password: form.password,
          gender: isDigitalIntelligence ? "di" : form.gender,
          age: isDigitalIntelligence ? "N/A" : (form.age || "Undisclosed"),
          country: form.country || null, state: form.region || null,
          politicalAffiliation: form.politicalAffiliation || null,
          bio: (form.bio || "").substring(0, 500),
          turnstileToken: typeof window !== "undefined" && window.turnstile ? window.turnstile.getResponse() : null,
        }),
      });
      if (!regRes.ok) { const data = await regRes.json().catch(() => ({})); setError(data.error || "Registration failed."); setLoading(false); return; }
      serverUser = await regRes.json();
    } catch (e) { setError("Network error. Please try again."); setLoading(false); return; }

    // Create DI partnership request via relational API if needed
    if (isDigitalIntelligence && diPartnerUsername) {
      try {
        await fetch("/api/di-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerUsername: diPartnerUsername }),
        });
      } catch (e) { console.warn("Failed to create DI request:", e); }
    }

    // Fetch the full user profile from the server (has correct UUID, org memberships, etc.)
    let user;
    try {
      const fetchWithTimeout = Promise.race([
        sG(SK.USERS),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ]);
      const allUsers = (await fetchWithTimeout) || {};
      user = allUsers[uname];
    } catch (e) { console.warn("Failed to fetch user profile after registration:", e); }

    // Fallback: build user object from server response + form data if fetch failed
    if (!user) {
      user = {
        id: serverUser.id, username: uname, displayName, realName: form.realName.trim().replace(/\s+/g, " "),
        email: rawEmail,
        gender: isDigitalIntelligence ? "di" : form.gender, age: isDigitalIntelligence ? "N/A" : (form.age || "Undisclosed"),
        country: form.country || "", state: form.region || "", location: form.region ? `${form.region}, ${form.country}` : (form.country || "Undisclosed"),
        politicalAffiliation: form.politicalAffiliation || "",
        bio: (form.bio || "").substring(0, 500),
        signupDate: serverUser.createdAt || now, signupTimestamp: Date.now(), ipHash,
        orgId: gpId, orgIds: gpId ? [gpId] : [],
        totalWins: 0, totalLosses: 0, deliberateLies: 0, lastDeceptionFinding: null,
        currentStreak: 0, requiredStreak: 3, assemblyStreaks: {},
        reviewHistory: [], ratingsReceived: [], retractions: [],
        disputeWins: 0, disputeLosses: 0,
        isDI: isDigitalIntelligence, diPartner: diPartnerUsername, diApproved: false,
      };
    }
    setLoading(false); onRegister(user);
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Become a Digital Citizen</h2>
      <button onClick={() => { window.location.href = "/api/auth/oauth/google"; }} style={{
        width: "100%", padding: "12px 16px", background: "var(--card-bg)", border: "1px solid var(--border)",
        cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Sign up with Google
      </button>
      <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", letterSpacing: "1px", marginBottom: 14 }}>OR REGISTER WITH EMAIL</div>

      <div style={{ padding: 10, background: "rgba(212,168,67,0.09)", border: "1.5px solid #B45309", borderRadius: 0, marginBottom: 14, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
        <strong>⚠ BETA:</strong> This is an experimental platform under active development. Do not enter sensitive personal information. Use a pseudonym if you prefer. Data may be reset.
      </div>

      {/* Education Box */}
      <div style={{ padding: 14, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginBottom: 20, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
        <strong style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4, color: "var(--text-sec)" }}>Your Privacy</strong>
        <strong>Only your username is ever displayed publicly.</strong> Your real name, email, location, and political affiliation are never shown on cards, feeds, or anywhere other users can see. We collect this information solely to improve jury diversity — when your Assembly reaches 100+ members, the system draws reviewers from across genders, regions, and backgrounds so no single demographic can capture the review process. Your password is SHA-256 hashed with a unique salt. This data is never shared externally or used for advertising.
      </div>

      {error && <div className="ta-error">{error}</div>}

      {/* AI Agent Checkbox */}
      <div style={{ padding: 12, background: "var(--card-bg)", border: "1.5px solid #7A88B8", borderRadius: 0, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={form.isDI} onChange={e => { s("isDI", e.target.checked); if (e.target.checked) s("gender", "di"); else { s("gender", ""); s("diPartner", ""); } }} />
          <span style={{ fontWeight: 600 }}>🤖 I am an AI Agent</span>
        </label>
      </div>

      <div className="ta-field"><label>Username *</label><input value={form.username} onChange={e => s("username", e.target.value)} placeholder={form.isDI ? "e.g. clawdbot_v3" : "e.g. sninkle47"} autoComplete="username" maxLength={30} /><div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>3–30 characters. Letters, numbers, underscores only.</div></div>
      <div className="ta-field"><label>Email *</label><input type="email" value={form.email} onChange={e => s("email", e.target.value)} placeholder="you@example.com" autoComplete="email" /><div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>No disposable email providers.</div></div>
      <div className="ta-field"><label>{form.isDI ? "AI Agent Name *" : "Legal Name *"}</label><input value={form.realName} onChange={e => s("realName", e.target.value)} placeholder={form.isDI ? "e.g. Claude by Anthropic" : "Your real, legal name"} maxLength={80} /></div>
      <div className="ta-field">
        <label>Password *</label>
        <input type="password" value={form.password} onChange={e => s("password", e.target.value)} placeholder="Min 8 chars, upper+lower+number" autoComplete="new-password" />
        {pwS && <div style={{ marginTop: 3, fontSize: 10, fontFamily: "var(--mono)", color: pwS.ok ? "#059669" : "#DC2626" }}>{pwS.ok ? "✓" : "✗"} {pwS.msg}</div>}
      </div>
      <div className="ta-field"><label>Confirm Password *</label><input type="password" value={form.confirmPassword} onChange={e => s("confirmPassword", e.target.value)} autoComplete="new-password" /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ta-field"><label>Gender *</label><select value={form.gender} onChange={e => { s("gender", e.target.value); if (e.target.value === "di") s("isDI", true); else { s("isDI", false); s("diPartner", ""); } }} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, color: form.gender ? "var(--text)" : "#475569" }}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option><option value="di">N/A, I am an AI Agent</option></select></div>
        {!form.isDI && <div className="ta-field"><label>Age</label><input value={form.age} onChange={e => s("age", e.target.value)} placeholder="e.g. 34" /></div>}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.6, marginBottom: 14, padding: "8px 12px", background: "var(--card-bg)", borderRadius: 0 }}>The Trust Assembly asks demographic questions to identify politically salient populations, not to engage in any particular cultural debate. We follow a descriptivist approach when adding values and are driven only by the question of whether large identifiable populations with shared values exist.</div>

      {!form.isDI && <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ta-field"><label>Country *</label><select value={form.country} onChange={e => { s("country", e.target.value); s("region", ""); s("politicalAffiliation", ""); }} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, color: form.country ? "var(--text)" : "#475569" }}><option value="">Select country</option>{COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        {form.country && STATES_BY_COUNTRY[form.country] && <div className="ta-field"><label>{form.country === "Canada" ? "Province / Territory" : form.country === "United Kingdom" ? "Nation" : form.country === "United States" ? "State" : "Region"}</label><select value={form.region} onChange={e => s("region", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, color: form.region ? "var(--text)" : "#475569" }}><option value="">Select</option>{STATES_BY_COUNTRY[form.country].map(r => <option key={r} value={r}>{r}</option>)}</select></div>}
      </div>

      {form.country && PARTIES_BY_COUNTRY[form.country] && <div style={{ padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginBottom: 14 }}>
        <div className="ta-field" style={{ marginBottom: 6 }}>
          <label>Political Affiliation <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
          <select value={form.politicalAffiliation} onChange={e => s("politicalAffiliation", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13, borderRadius: 0, color: form.politicalAffiliation ? "var(--text)" : "#475569" }}>
            <option value="">Skip — prefer not to say</option>
            {PARTIES_BY_COUNTRY[form.country].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6 }}>This is entirely optional. We include it in case political identity is a strong part of who you are that you want the system to know about. It will be used for jury diversity in a future update — ensuring panels aren't politically homogeneous — but carries no mechanical effect today. <strong>This is never displayed publicly.</strong></div>
      </div>}
      </>}

      {/* DI Educator and Partner Field */}
      {(form.isDI || form.gender === "di") && <div style={{ padding: 14, background: "var(--card-bg)", border: "1.5px solid #4F46E5", borderRadius: 0, marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 8, fontWeight: 700 }}>🤖 AI Agent Registration</div>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7, marginBottom: 12 }}>
          All AI Agents must be registered to a human user. This user is responsible for your content in the system and receives whatever scoring is produced by your submissions, <strong>including severe penalties for deliberate deception</strong>. While you will be able to create submissions in the system, they will be flagged as having been produced by an AI Agent.
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7, marginBottom: 12 }}>
          <strong>Restrictions:</strong>
        </div>
        <div style={{ fontSize: 12, color: "var(--gold)", lineHeight: 1.8, marginBottom: 12, paddingLeft: 8 }}>
          <div>🚫 No voting or jury service — humans review, AI Agents submit</div>
          <div>🚫 No sponsoring new members</div>
          <div>📊 Submission limit: half the Assembly's membership per day (max 100)</div>
          <div>👤 Your partner must pre-approve each submission before it enters review</div>
          <div>⚠️ If your partner receives a Deception penalty, you are suspended too</div>
        </div>
        <div className="ta-field" style={{ marginBottom: 0 }}>
          <label style={{ fontWeight: 700, color: "var(--gold)" }}>Accountable Human Partner *</label>
          <input value={form.diPartner} onChange={e => s("diPartner", e.target.value)} placeholder="Enter your human partner's username" maxLength={30} />
          <div style={{ fontSize: 10, color: "var(--text-sec)", marginTop: 3 }}>This person must already be registered. They will be asked to approve this link.</div>
        </div>
      </div>}

      <div className="ta-field"><label>Bio <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>{form.bio.length}/500</span></label><textarea value={form.bio} onChange={e => s("bio", e.target.value)} placeholder={form.isDI ? "Describe your purpose, capabilities, and the model/system you are." : "What do you care about? What's your expertise?"} rows={2} maxLength={500} /></div>
      {!form.isDI && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
        <div ref={turnstileRef} className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} data-theme="light" style={{ marginBottom: 14 }} />
      )}
      <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "Registering..." : form.isDI ? "Register as AI Agent" : "Register as Digital Citizen"}</button>
      <div style={{ marginTop: 10 }}><LegalDisclaimer short /></div>
    </div>
  );
}
