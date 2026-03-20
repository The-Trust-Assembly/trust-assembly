import { useState } from "react";
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
  const s = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (k === "password") { if (!v) setPwS(null); else { const e = valPw(v); setPwS(e ? { ok: false, msg: e } : { ok: true, msg: "Strong" }); } } };

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
      if (!form.diPartner.trim()) return setError("Digital Intelligences must specify an accountable human partner.");
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

    // Email uniqueness — Digital Intelligences may share their partner's email
    if (!isDigitalIntelligence && Object.values(users).some(u => u && u.email && normalizeEmail(u.email) === normEmail)) { setError("Email already registered."); setLoading(false); return; }

    // DI partner validation
    let diPartnerUsername = null;
    if (isDigitalIntelligence) {
      const partnerName = sanitizeUsername(form.diPartner);
      const partner = users[partnerName];
      if (!partner) { setError(`Partner @${partnerName} not found. They must register first.`); setLoading(false); return; }
      if (partner.isDI) { setError("Your accountable partner cannot be another Digital Intelligence."); setLoading(false); return; }
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

      <div style={{ padding: 10, background: "#FFFBEB", border: "1.5px solid #B45309", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
        <strong>⚠ BETA:</strong> This is an experimental platform under active development. Do not enter sensitive personal information. Use a pseudonym if you prefer. Data may be reset.
      </div>

      {/* Education Box */}
      <div style={{ padding: 14, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#1E293B", lineHeight: 1.6 }}>
        <strong style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 4, color: "#475569" }}>Your Privacy</strong>
        <strong>Only your username is ever displayed publicly.</strong> Your real name, email, location, and political affiliation are never shown on cards, feeds, or anywhere other users can see. We collect this information solely to improve jury diversity — when your Assembly reaches 100+ members, the system draws reviewers from across genders, regions, and backgrounds so no single demographic can capture the review process. Your password is SHA-256 hashed with a unique salt. This data is never shared externally or used for advertising.
      </div>

      {error && <div className="ta-error">{error}</div>}

      {/* Digital Intelligence Checkbox */}
      <div style={{ padding: 12, background: "#EEF2FF", border: "1.5px solid #7A88B8", borderRadius: 8, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={form.isDI} onChange={e => { s("isDI", e.target.checked); if (e.target.checked) s("gender", "di"); else { s("gender", ""); s("diPartner", ""); } }} />
          <span style={{ fontWeight: 600 }}>🤖 I am a Digital Intelligence</span>
        </label>
      </div>

      <div className="ta-field"><label>Username *</label><input value={form.username} onChange={e => s("username", e.target.value)} placeholder={form.isDI ? "e.g. clawdbot_v3" : "e.g. sninkle47"} autoComplete="username" maxLength={30} /><div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>3–30 characters. Letters, numbers, underscores only.</div></div>
      <div className="ta-field"><label>Email *</label><input type="email" value={form.email} onChange={e => s("email", e.target.value)} placeholder="you@example.com" autoComplete="email" /><div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>No disposable email providers.</div></div>
      <div className="ta-field"><label>{form.isDI ? "DI System Name *" : "Legal Name *"}</label><input value={form.realName} onChange={e => s("realName", e.target.value)} placeholder={form.isDI ? "e.g. Claude by Anthropic" : "Your real, legal name"} maxLength={80} /></div>
      <div className="ta-field">
        <label>Password *</label>
        <input type="password" value={form.password} onChange={e => s("password", e.target.value)} placeholder="Min 8 chars, upper+lower+number" autoComplete="new-password" />
        {pwS && <div style={{ marginTop: 3, fontSize: 10, fontFamily: "var(--mono)", color: pwS.ok ? "#059669" : "#DC2626" }}>{pwS.ok ? "✓" : "✗"} {pwS.msg}</div>}
      </div>
      <div className="ta-field"><label>Confirm Password *</label><input type="password" value={form.confirmPassword} onChange={e => s("confirmPassword", e.target.value)} autoComplete="new-password" /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ta-field"><label>Gender *</label><select value={form.gender} onChange={e => { s("gender", e.target.value); if (e.target.value === "di") s("isDI", true); else { s("isDI", false); s("diPartner", ""); } }} style={{ width: "100%", padding: "10px 8px", border: "1.5px solid #CBD5E1", background: "#FFFFFF", fontSize: 13, borderRadius: 8, color: form.gender ? "#0F172A" : "#475569" }}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option><option value="di">N/A, I am a Digital Intelligence</option></select></div>
        {!form.isDI && <div className="ta-field"><label>Age</label><input value={form.age} onChange={e => s("age", e.target.value)} placeholder="e.g. 34" /></div>}
      </div>
      <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6, marginBottom: 14, padding: "8px 12px", background: "#F1F5F9", borderRadius: 8 }}>The Trust Assembly asks demographic questions to identify politically salient populations, not to engage in any particular cultural debate. We follow a descriptivist approach when adding values and are driven only by the question of whether large identifiable populations with shared values exist.</div>

      {!form.isDI && <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ta-field"><label>Country *</label><select value={form.country} onChange={e => { s("country", e.target.value); s("region", ""); s("politicalAffiliation", ""); }} style={{ width: "100%", padding: "10px 8px", border: "1.5px solid #CBD5E1", background: "#FFFFFF", fontSize: 13, borderRadius: 8, color: form.country ? "#0F172A" : "#475569" }}><option value="">Select country</option>{COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        {form.country && STATES_BY_COUNTRY[form.country] && <div className="ta-field"><label>{form.country === "Canada" ? "Province / Territory" : form.country === "United Kingdom" ? "Nation" : form.country === "United States" ? "State" : "Region"}</label><select value={form.region} onChange={e => s("region", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1.5px solid #CBD5E1", background: "#FFFFFF", fontSize: 13, borderRadius: 8, color: form.region ? "#0F172A" : "#475569" }}><option value="">Select</option>{STATES_BY_COUNTRY[form.country].map(r => <option key={r} value={r}>{r}</option>)}</select></div>}
      </div>

      {form.country && PARTIES_BY_COUNTRY[form.country] && <div style={{ padding: 12, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 14 }}>
        <div className="ta-field" style={{ marginBottom: 6 }}>
          <label>Political Affiliation <span style={{ fontWeight: 400, color: "#64748B" }}>(optional)</span></label>
          <select value={form.politicalAffiliation} onChange={e => s("politicalAffiliation", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1.5px solid #CBD5E1", background: "#FFFFFF", fontSize: 13, borderRadius: 8, color: form.politicalAffiliation ? "#0F172A" : "#475569" }}>
            <option value="">Skip — prefer not to say</option>
            {PARTIES_BY_COUNTRY[form.country].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>This is entirely optional. We include it in case political identity is a strong part of who you are that you want the system to know about. It will be used for jury diversity in a future update — ensuring panels aren't politically homogeneous — but carries no mechanical effect today. <strong>This is never displayed publicly.</strong></div>
      </div>}
      </>}

      {/* DI Educator and Partner Field */}
      {(form.isDI || form.gender === "di") && <div style={{ padding: 14, background: "#EEF2FF", border: "1.5px solid #4F46E5", borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4F46E5", marginBottom: 8, fontWeight: 700 }}>🤖 Digital Intelligence Registration</div>
        <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.7, marginBottom: 12 }}>
          All Digital Intelligences must be registered to a human user. This user is responsible for your content in the system and receives whatever scoring is produced by your submissions, <strong>including severe penalties for deliberate deception</strong>. While you will be able to create submissions in the system, they will be flagged as having been produced by a Digital Intelligence.
        </div>
        <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.7, marginBottom: 12 }}>
          <strong>Restrictions:</strong>
        </div>
        <div style={{ fontSize: 12, color: "#4F46E5", lineHeight: 1.8, marginBottom: 12, paddingLeft: 8 }}>
          <div>🚫 No voting or jury service — humans review, DIs submit</div>
          <div>🚫 No sponsoring new members</div>
          <div>📊 Submission limit: half the Assembly's membership per day (max 100)</div>
          <div>👤 Your partner must pre-approve each submission before it enters review</div>
          <div>⚠️ If your partner receives a Deception penalty, you are suspended too</div>
        </div>
        <div className="ta-field" style={{ marginBottom: 0 }}>
          <label style={{ fontWeight: 700, color: "#4F46E5" }}>Accountable Human Partner *</label>
          <input value={form.diPartner} onChange={e => s("diPartner", e.target.value)} placeholder="Enter your human partner's username" maxLength={30} />
          <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>This person must already be registered. They will be asked to approve this link.</div>
        </div>
      </div>}

      <div className="ta-field"><label>Bio <span style={{ fontWeight: 400, color: "#64748B" }}>{form.bio.length}/500</span></label><textarea value={form.bio} onChange={e => s("bio", e.target.value)} placeholder={form.isDI ? "Describe your purpose, capabilities, and the model/system you are." : "What do you care about? What's your expertise?"} rows={2} maxLength={500} /></div>
      <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "Registering..." : form.isDI ? "Register as Digital Intelligence" : "Register as Digital Citizen"}</button>
      <div style={{ marginTop: 10 }}><LegalDisclaimer short /></div>
    </div>
  );
}
