import { W } from "../lib/scoring";

export default function AboutScreen() {
  return (
    <div><div className="ta-section-rule" /><h2 className="ta-section-head">About</h2>
      <div style={{ padding: "20px 24px", background: "var(--card-bg)", border: "1px solid var(--border)", borderLeft: "3px solid var(--gold)", borderRadius: 0, marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", marginBottom: 10 }}>Mission Statement</div>
        <p style={{ fontSize: 16, lineHeight: 1.8, color: "var(--text)", fontFamily: "var(--serif)", fontWeight: 600, margin: 0 }}>The Trust Assembly is an experiment in self-government.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0" }}>It begins with a simple question: what happens when ordinary people are given a place to reason together in public, under fair rules, with truth as the aim rather than attention?</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0" }}>We believe the answer matters. Much of the modern internet has become a continuous, unregulated election in which every claim competes for power through speed, outrage, and repetition. The Trust Assembly is an attempt to build something different. A place where claims can be examined, language can be challenged, evidence can be weighed, and judgment can be made visible.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0" }}>This system is not designed for ease in the manner of social media. It is designed for seriousness. It asks for patience, good faith, and the courage to make an argument plainly. We cannot automate wisdom, and we do not intend to. Human beings must still bear the responsibility of speaking honestly, listening carefully, and revising their views when better reasoning appears.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0" }}>What a system can do is establish rules. It can create a structure in which thoughtful participation is rewarded, deception is punished, and a serious voice cannot simply be buried by noise. It can make room for people to pay purposeful attention.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0" }}>We do not claim perfection. We do not claim finality. The rules of this institution will change as we learn. But we are convinced that something like a civic algorithm is needed. One that strengthens discernment instead of undermining it, and that helps truth travel as far and as fast as falsehood.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0" }}>Our purpose is not to abolish fun, spontaneity, or disagreement. It is to create one place of esteem. A place where a person is not foolish for wanting to pursue the truth, and where public trust can be rebuilt through reasoned, accountable process.</p>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "var(--text)", fontFamily: "var(--serif)", fontWeight: 600, fontStyle: "italic", margin: "12px 0 0" }}>We hope to build a lighthouse on a hill.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text)", margin: "12px 0 0", padding: "12px 16px", background: "var(--card-bg)", borderRadius: 0 }}>To succeed in this institution, you must make sense to those who agree with you. And you must make sense to those who do not. Everything worth building in civilization rests on that foundation.</p>
      </div>
      <div className="ta-card" style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)" }}>
        <p style={{ marginBottom: 14 }}>The Trust Assembly was created by a technologist and writer who grew tired of watching institutional trust decay while no one built anything to replace it.</p>
        <p style={{ marginBottom: 14 }}>The core insight: truth is the only thing that survives adversarial review. Structure conflict correctly — where winning requires being right — and selfishness serves honesty. This is mechanism design applied to editorial integrity.</p>
        <p style={{ marginBottom: 14 }}>Two-tier review (in-group, then cross-group) prevents filter bubbles while maintaining trust foundations. Your group checks your work. Then strangers check your group. What survives both is the closest thing to verified truth that distributed systems can produce.</p>
        <p style={{ marginBottom: 14 }}>This platform was vibe-coded with Claude by Anthropic — an AI that served as architect, engineer, and sparring partner throughout the build. Every feature, every algorithm, every design decision was a conversation between a human with a vision and an AI that could execute it.</p>
        <div style={{ padding: 14, background: "var(--card-bg)", borderRadius: 0 }}><div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-sec)", marginBottom: 6 }}>Motto</div><div style={{ fontFamily: "var(--serif)", fontSize: 18, fontStyle: "italic" }}>Truth Will Out.</div><div style={{ fontSize: 13, color: "var(--text-sec)", marginTop: 2 }}>The truth cannot be hidden forever.</div></div>

        <div style={{ padding: 14, background: "rgba(212,168,67,0.09)", border: "1px solid #CA8A04", borderRadius: 0, marginTop: 14 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", marginBottom: 8 }}>The Scoring Formula</div>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Trust Score = √Points × Quality / Drag + Cassandra</div>
            <div>✓ Regular win: <strong>+{W.win} point</strong> — volume under √ (diminishing returns)</div>
            <div>⚖ Dispute won: <strong>+{W.disputeWin} points</strong></div>
            <div>📈 Streak bonus: <strong>+1</strong> per {W.streakInterval} consecutive wins</div>
            <div>🎯 Quality: (news + fun)/{W.qualityDivisor}, capped at {W.qualityCap}, raised to ^{W.qualityExp}</div>
            <div>✗ Regular loss: <strong>adds to drag</strong> — diminishing (inside √)</div>
            <div>⚖ Dispute lost: <strong>adds to drag</strong> — same as a regular loss</div>
            <div>💀 Deliberate deception: <strong>+{W.lieDrag} drag per lie</strong> — linear, bypasses √</div>
            <div style={{ color: "var(--gold)", fontWeight: 700 }}>🔮 Cassandra vindication: <strong>additive bonus</strong> — scales with impact × persistence (coming soon)</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 8 }}>All weights are community-votable in future elections. The formula shape is permanent; only the coefficients change. The Cassandra vindication path is being built — a single historic vindication can propel a brand-new citizen to the top of the entire system.</div>
        </div>
      </div>
    </div>
  );
}
