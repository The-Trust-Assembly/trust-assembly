import { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME } from "../lib/constants";
import { sDate } from "../lib/utils";
import { sG } from "../lib/storage";
import { Loader, Empty, StatusPill, LegalDisclaimer } from "../components/ui";

export default function VaultScreen({ user }) {
  const [tab, setTab] = useState("vault");
  const [vault, setVault] = useState([]); const [args, setArgs] = useState([]); const [beliefs, setBeliefs] = useState([]); const [translations, setTranslations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newArg, setNewArg] = useState(""); const [newBelief, setNewBelief] = useState("");
  const [newTrans, setNewTrans] = useState({ original: "", translated: "", type: "clarity" });
  const [myOrgs, setMyOrgs] = useState([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState([]);
  const [orgsMap, setOrgsMap] = useState({});

  const toggleOrg = (oid) => { setSelectedOrgIds(prev => prev.includes(oid) ? prev.filter(id => id !== oid) : [...prev, oid]); };

  const load = async () => {
    const allOrgs = (await sG(SK.ORGS)) || {};
    setOrgsMap(allOrgs);
    const ids = user.orgIds || (user.orgId ? [user.orgId] : []);
    const orgs = ids.map(id => allOrgs[id]).filter(Boolean);
    setMyOrgs(orgs);
    if (selectedOrgIds.length === 0 && user.orgId) setSelectedOrgIds([user.orgId]);
    const myOrgSet = new Set(ids);
    const v = (await sG(SK.VAULT)) || {}; const a = (await sG(SK.ARGS)) || {}; const b = (await sG(SK.BELIEFS)) || {}; const t = (await sG(SK.TRANSLATIONS)) || {};
    const approvedOrg = (x) => myOrgSet.has(x.orgId) && x.status === "approved";
    setVault(Object.values(v).filter(approvedOrg).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setArgs(Object.values(a).filter(approvedOrg).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setBeliefs(Object.values(b).filter(approvedOrg).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setTranslations(Object.values(t).filter(approvedOrg).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setLoading(false);
  };
  useEffect(() => { load(); }, [user.orgId, user.orgIds]);

  const addArg = async () => { if (!newArg.trim() || selectedOrgIds.length === 0) return; for (const oid of selectedOrgIds) { try { await fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "argument", orgId: oid, content: newArg.trim() }) }); } catch {} } setNewArg(""); load(); };
  const addBelief = async () => { if (!newBelief.trim() || selectedOrgIds.length === 0) return; for (const oid of selectedOrgIds) { try { await fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "belief", orgId: oid, content: newBelief.trim() }) }); } catch {} } setNewBelief(""); load(); };
  const addTrans = async () => { if (!newTrans.original.trim() || !newTrans.translated.trim() || selectedOrgIds.length === 0) return; for (const oid of selectedOrgIds) { try { await fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "translation", orgId: oid, original: newTrans.original.trim(), translated: newTrans.translated.trim(), translationType: newTrans.type }) }); } catch {} } setNewTrans({ original: "", translated: "", type: "clarity" }); load(); };

  const OrgLabel = ({ orgId }) => { const o = orgsMap[orgId]; if (!o) return null; return <span style={{ fontSize: 9, padding: "1px 5px", fontFamily: "var(--mono)", borderRadius: 8, background: o.isGeneralPublic ? "#F0FDFA" : "#F1F5F9", color: o.isGeneralPublic ? "#0D9488" : "#475569", marginRight: 4 }}>{o.isGeneralPublic ? "\u{1F3DB}" : "\u2B21"} {o.name}</span>; };

  const AssemblySelector = () => myOrgs.length > 1 ? (
    <div style={{ marginBottom: 10, padding: 8, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 6 }}>Submit to assemblies: <span style={{ fontWeight: 400, textTransform: "none" }}>(select one or more)</span></div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {myOrgs.map(o => { const sel = selectedOrgIds.includes(o.id); return <button key={o.id} onClick={() => toggleOrg(o.id)} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--mono)", border: `1.5px solid ${sel ? "#059669" : "#CBD5E1"}`, background: sel ? "#059669" : "#fff", color: sel ? "#fff" : "#475569", borderRadius: 8, cursor: "pointer", fontWeight: sel ? 700 : 400 }}>{sel ? "\u2713 " : ""}{o.isGeneralPublic ? "\u{1F3DB} " : ""}{o.name}</button>; })}
      </div>
    </div>
  ) : null;

  const TRANS_TYPES = { clarity: "Clarity", propaganda: "Anti-Propaganda", euphemism: "Euphemism", satirical: "Satirical" };
  const tabs = [["vault", "Corrections"], ["args", "Arguments"], ["beliefs", "Beliefs"], ["trans", "Translations"]];
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Assembly Vaults</h2>
      <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>Vaults are per-assembly. Only approved entries that have survived jury review are shown. To add new entries, include them when submitting a correction through the Submit tab — all vault entries must be tied to an actual piece of media.</p>
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E2E8F0" }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === k ? "2px solid #2563EB" : "2px solid transparent", marginBottom: -2, fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", color: tab === k ? "#2563EB" : "#64748B", fontWeight: tab === k ? 700 : 400 }}>{l}</button>)}
      </div>
      {loading ? <Loader /> : <>
        {tab === "vault" && <div><p style={{ color: "#475569", marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>Standing Corrections — reusable facts verified through jury review. Each time a correction is linked to a submission and survives review, it gains reputation.</p>{vault.length === 0 ? <Empty text="No vault entries yet. Submit one with your next correction." /> : vault.map(v => <div key={v.id} className="ta-card" style={{ borderLeft: "4px solid #CBD5E1" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}><OrgLabel orgId={v.orgId} />@{v.submittedBy} · {sDate(v.createdAt)}{v.survivalCount > 0 ? ` · survived ${v.survivalCount} review${v.survivalCount !== 1 ? "s" : ""}` : ""}</span><StatusPill status={v.status} /></div><div style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600, lineHeight: 1.6 }}>{v.assertion}</div>{v.evidence && <div style={{ fontSize: 12, color: "#0D9488", marginTop: 3 }}>{v.evidence}</div>}</div>)}</div>}
        {tab === "args" && <div><p style={{ color: "#475569", marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>Argument Vault — store fundamental arguments your Assembly uses across corrections. Reusable rhetorical and logical tools.</p>{args.map(a => <div key={a.id} className="ta-card" style={{ borderLeft: "4px solid #0D9488" }}><div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", marginBottom: 4 }}><OrgLabel orgId={a.orgId} />@{a.submittedBy} · {sDate(a.createdAt)}{a.survivalCount > 0 ? ` · survived ${a.survivalCount} review${a.survivalCount !== 1 ? "s" : ""}` : ""}</div><div style={{ fontSize: 14, lineHeight: 1.6 }}>{a.content}</div></div>)}{args.length === 0 && <Empty text="No arguments stored yet." />}<div style={{ marginTop: 14, padding: 12, background: "#F1F5F9", borderRadius: 8, fontSize: 12, color: "#475569" }}>To add new arguments, include them when submitting a correction through the Submit tab. All vault entries must be tied to an actual piece of media.</div></div>}
        {tab === "beliefs" && <div><p style={{ color: "#475569", marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>Foundational Belief Vault — core beliefs your Assembly holds as axioms. Not claims of fact but starting premises.</p>{beliefs.map(b => <div key={b.id} className="ta-card" style={{ borderLeft: "4px solid #7C3AED" }}><div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", marginBottom: 4 }}><OrgLabel orgId={b.orgId} />@{b.submittedBy} · {sDate(b.createdAt)}{b.survivalCount > 0 ? ` · survived ${b.survivalCount} review${b.survivalCount !== 1 ? "s" : ""}` : ""}</div><div style={{ fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>{b.content}</div></div>)}{beliefs.length === 0 && <Empty text="No foundational beliefs stored yet." />}<div style={{ marginTop: 14, padding: 12, background: "#F1F5F9", borderRadius: 8, fontSize: 12, color: "#475569" }}>To add new foundational beliefs, include them when submitting a correction through the Submit tab. All vault entries must be tied to an actual piece of media.</div></div>}
        {tab === "trans" && <div>
          <p style={{ color: "#475569", marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>Translation Vault — plain-language replacements for jargon, spin, propaganda, and euphemisms. Approved translations can be applied automatically by the browser extension across all articles. Categories: Clarity (strip jargon), Anti-Propaganda (rename spin), Euphemism (call it what it is), Satirical (approved humor).</p>
          {translations.map(t => <div key={t.id} className="ta-card" style={{ borderLeft: "4px solid #B45309" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}><OrgLabel orgId={t.orgId} />{t.submittedBy === ADMIN_USERNAME ? "\u{1F451} " : ""}@{t.submittedBy} · {sDate(t.createdAt)} · {TRANS_TYPES[t.type] || t.type}{t.survivalCount > 0 ? ` · survived ${t.survivalCount}` : ""}</span><StatusPill status={t.status || "pending"} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span style={{ textDecoration: "line-through", color: "#475569" }}>{t.original}</span>
              <span style={{ color: "#B45309", fontWeight: 700 }}>{"\u2192"}</span>
              <span style={{ color: "#B45309", fontWeight: 700 }}>{t.translated}</span>
            </div>
          </div>)}
          {translations.length === 0 && <Empty text="No translations stored yet. Propose one with your next submission." />}
          <div style={{ marginTop: 14, padding: 12, background: "#F1F5F9", borderRadius: 8, fontSize: 12, color: "#475569" }}>To add new translations, include them when submitting a correction through the Submit tab. All vault entries must be tied to an actual piece of media.</div>
        </div>}
      </>}
      <LegalDisclaimer short />
    </div>
  );
}
