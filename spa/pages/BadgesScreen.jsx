import { CITIZEN_BADGES, BADGE_TIER_STYLES } from "../lib/constants";

const CATEGORIES = [
  {
    title: "Submission Milestones",
    desc: "Earn badges by submitting corrections and affirmations. Each submission that enters the record moves you closer to the next milestone.",
    badges: ["firstSubmission", "tenSubmissions", "centuryClub", "thousand", "tenThousand", "hundredThousand", "million"],
  },
  {
    title: "Jury Vote Milestones",
    desc: "Serve on juries and cast votes. The system depends on citizens who show up to review — these badges recognize your commitment to the process.",
    badges: ["firstVote", "tenVotes", "twentyFiveVotes", "fiftyVotes", "hundredVotes"],
  },
  {
    title: "Dispute Milestones",
    desc: "Win disputes by catching errors that juries missed. Disputes are how the system self-corrects — these badges recognize those who hold the system accountable.",
    badges: ["firstDispute", "fiveDisputes", "tenDisputes", "twentyDisputes", "fiftyDisputes", "hundredDisputes"],
  },
  {
    title: "Assembly Founder Milestones",
    desc: "Found an assembly and grow it. Each threshold unlocks new governance rules — your community's growth is the system's growth.",
    badges: ["assemblyCreator", "founderFive", "founderTwentyOne", "founderFiftyOne", "founderHundredOne", "founderThousand", "founderTenK"],
  },
  {
    title: "Assembly Membership",
    desc: "Join assemblies to participate in focused communities of verification.",
    badges: ["assemblyMember", "trustedContributor"],
  },
  {
    title: "Digital Intelligence Partnership",
    desc: "Link an AI agent and guide its contributions. You remain accountable for every submission your DI makes.",
    badges: ["diPartner", "diTen", "diHundredK"],
  },
  {
    title: "Early Adopter",
    desc: "Recognized for believing early. These badges can never be earned again — they belong to the pioneers who built the foundation.",
    badges: ["firstHundred", "firstThousand"],
  },
  {
    title: "Learning Curve",
    desc: "Not all milestones are positive — but they're honest. These badges acknowledge the reality of learning in public.",
    badges: ["tenRejections"],
  },
];

export default function BadgesScreen() {
  return (
    <div>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Badges &amp; Achievements</h2>
      <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.7, marginBottom: 16 }}>
        Badges encourage activities that promote the health of the Assembly ecosystem by incentivizing citizens to take certain actions. Every badge earned contributes <strong style={{ color: "var(--gold)" }}>+1 point</strong> to your Trust Score.
      </div>
      <div style={{ padding: "10px 14px", background: "rgba(212,168,67,0.09)", border: "1px solid var(--gold)", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.6 }}>
          Badges are earned automatically through participation. They cannot be purchased, traded, or assigned. Each badge in a series earns its own point — if you earn three assembly growth badges, that's three points added to your Trust Score.
        </div>
      </div>

      {CATEGORIES.map((cat, ci) => (
        <div key={ci} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>{cat.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.5, marginBottom: 10 }}>{cat.desc}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {cat.badges.map(id => {
              const b = CITIZEN_BADGES[id];
              if (!b) return null;
              const ts = BADGE_TIER_STYLES[b.tier] || BADGE_TIER_STYLES.bronze;
              return (
                <div key={id} style={{ padding: 12, background: ts.bg, border: `1px solid ${ts.border}`, textAlign: "center" }}>
                  {b.image ? (
                    <img src={b.image} alt={b.label} width={80} height={80} style={{ objectFit: "contain", marginBottom: 6 }} />
                  ) : (
                    <div style={{ width: 80, height: 80, margin: "0 auto 6px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", border: "1px dashed var(--border)", fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", lineHeight: 1.2 }}>Coming soon</div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 700, color: ts.text, marginBottom: 2 }}>{b.label}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.4 }}>{b.desc}</div>
                  <div style={{ fontSize: 8, fontFamily: "var(--mono)", color: ts.text, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{b.tier} · +1 pt</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
