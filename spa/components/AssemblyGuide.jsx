import { W } from "../lib/scoring";

const section = (borderColor) => ({
  padding: 12,
  background: "var(--card-bg)",
  border: "1px solid var(--border)",
  borderLeft: `3px solid ${borderColor}`,
  borderRadius: 0,
  marginBottom: 14,
});

export default function AssemblyGuide() {
  return (
    <div style={{ padding: 16, background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 0, marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>How Assemblies Work</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", marginBottom: 14 }}>Tutorial</div>

      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>
        <p style={{ marginBottom: 12 }}><strong>An Assembly is a group of citizens who review each other's corrections.</strong> Every citizen starts in The General Public — it's the commons, and you can never leave it. From there, you can create or join up to 12 specialized Assemblies.</p>

        <div style={section("var(--text-sec)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 6, fontWeight: 600 }}>The Core Principle</div>
          <p style={{ margin: 0 }}>No single person controls the agenda. No single cabal can take over. Jury selection is random. Scoring is automatic. The only way to build reputation is to tell the truth — and the cost of lying is severe enough to make deception irrational.</p>
        </div>

        <div style={section("var(--green)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)", marginBottom: 6, fontWeight: 600 }}>Why Join or Create an Assembly?</div>
          <p style={{ margin: "0 0 8px" }}>Join an Assembly to empower and grow people who share your point of view. But remember: you lead by <strong>convincing</strong> other members that you are correct — not through force, not through manipulation, but through evidence and reasoning. If your correction is good, the jury approves it. If it's not, you lose reputation. That's it.</p>
          <p style={{ margin: 0 }}>Also think about other groups when submitting your arguments. The greatest gains in the system come from cross-group consensus — convincing people with <strong>different</strong> foundational beliefs that you are correct. That's where real trust is built.</p>
        </div>

        <div style={section("var(--gold)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6, fontWeight: 600 }}>Jury Size Scales With Your Assembly</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12 }}>
            <span>5–20 members</span><span>→ <strong>3</strong> jurors (majority: 2)</span>
            <span>21–50 members</span><span>→ <strong>5</strong> jurors (majority: 3)</span>
            <span>51–100 members</span><span>→ <strong>7</strong> jurors (majority: 4)</span>
            <span>101–999 members</span><span>→ <strong>9</strong> jurors (majority: 5)</span>
            <span>1,000–9,999</span><span>→ <strong>11</strong> jurors (majority: 6)</span>
            <span>10,000+</span><span>→ <strong>13</strong> jurors (majority: 7)</span>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>This prevents the law of small numbers from dominating outcomes. As your community grows, the system demands broader agreement before a correction is approved.</p>
        </div>

        <div style={section("#0D9488")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 6, fontWeight: 600 }}>Cross-Group Jury Scaling</div>
          <p style={{ margin: "0 0 8px" }}>Cross-group jury size scales with ecosystem diversity — the total number of Assemblies with 100+ members. More communities means more independent perspectives available for review.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12 }}>
            <span>5–7 assemblies</span><span>→ <strong>3</strong> jurors</span>
            <span>8–12 assemblies</span><span>→ <strong>5</strong> jurors</span>
            <span>13–20 assemblies</span><span>→ <strong>7</strong> jurors</span>
            <span>21–50 assemblies</span><span>→ <strong>9</strong> jurors</span>
            <span>51–100 assemblies</span><span>→ <strong>11</strong> jurors</span>
            <span>100+ assemblies</span><span>→ <strong>13</strong> jurors</span>
          </div>
          <p style={{ marginTop: 8, marginBottom: 6, fontSize: 12 }}><strong>The overlap constraint:</strong> No two cross-group jurors may share more than 2 non-General Public Assembly memberships. This guarantees genuinely independent perspectives — not just outsiders, but outsiders who think differently.</p>
          <p style={{ margin: "0 0 6px", fontSize: 12 }}><strong>Exclusion rule:</strong> No member of the originating Assembly can serve on its cross-group jury. The whole point is outside scrutiny.</p>
          <p style={{ marginTop: 0, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>Cross-group review doesn't activate until at least 5 Assemblies reach 100+ members. Until then, corrections cap at "Approved." The system is honest about when it has enough diversity to make cross-group judgment meaningful.</p>
        </div>

        <div style={section("#7C3AED")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 6, fontWeight: 600 }}>Enrollment &amp; The Tribal Rule</div>
          <p style={{ margin: "0 0 8px" }}>When you found an Assembly, you start with the <strong>Tribal Rule</strong> — you personally approve or reject every application. This isn't permanent power. Once your community crosses 50 members, the Tribal Rule expires and open enrollment begins. At 100+, qualified sponsors take over admissions.</p>
          <div style={{ fontSize: 12, paddingLeft: 8 }}>
            <div>1–50 members: <strong>Tribal Rule</strong> — founder approval</div>
            <div>51–99: <strong>Open enrollment</strong></div>
            <div>100–999: <strong>1 qualified sponsor</strong></div>
            <div>1,000–9,999: <strong>2 qualified sponsors</strong></div>
            <div>10,000+: <strong>3 qualified sponsors</strong></div>
          </div>
          <p style={{ marginTop: 8, marginBottom: 6, fontSize: 12 }}><strong>Who can sponsor?</strong> Members who have submitted at least one correction can sponsor immediately. <strong>Review-only members</strong> face a higher bar: 10+ completed reviews and 30 days of membership. This ensures sponsors have real skin in the game — not just tenure, but demonstrated judgment.</p>
          <p style={{ marginTop: 0, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>Applications include a written reason and an optional link, so the founder or sponsors can evaluate each person thoughtfully.</p>
        </div>

        <div style={section("var(--red)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red)", marginBottom: 6, fontWeight: 600 }}>Deliberate Deception Penalty</div>
          <p style={{ margin: "0 0 6px" }}>If a jury finds your submission to be a deliberate deception, the consequences are severe and <strong>visible to everyone</strong>:</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8 }}>
            <div>All voting suspended for <strong>1 year</strong></div>
            <div>Cannot sponsor new members for <strong>1 year</strong></div>
            <div>Cannot found new Assemblies for <strong>1 year</strong></div>
            <div>+{W.lieDrag} drag per finding (lies bypass diminishing returns — linear and devastating)</div>
          </div>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>You can still submit corrections during the penalty. Rebuilding trust is possible — but the system makes the cost of lying clearly visible.</p>
        </div>

        <div style={section("var(--gold)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6, fontWeight: 600 }}>Disputes &amp; The Cassandra Rule</div>
          <p style={{ margin: "0 0 8px" }}><strong>Disputes</strong> let any member challenge an approved correction. If the dispute jury agrees the correction was wrong, the disputer earns <strong>+{W.disputeWin} points</strong> for catching the error.</p>
          <p style={{ margin: "0 0 8px" }}><strong>The Cassandra Rule</strong> is the single most powerful act in the system. If your correction is disputed and the dispute is upheld — meaning you were found wrong — but you refuse to concede because you believe you're right, and you are later vindicated, you earn an <strong>additive bonus</strong> that scales with the importance of the story and the number of rejections you weathered. Named for the prophet nobody believed: the system's highest honor goes to those who hold their ground under pressure and are proven right.</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8 }}>
            <div>Cassandra vindication: <strong>additive bonus</strong> — scales with impact × persistence (coming soon)</div>
            <div>Dispute won: <strong>+{W.disputeWin} points</strong> — you caught an error in someone else's correction</div>
            <div>Dispute lost: <strong>adds to drag</strong> — diminishing cost (inside √), but not free</div>
            <div>Deliberate deception: <strong>+{W.lieDrag} drag per lie</strong> — linear, no mercy, devastates score</div>
            <div>✗ Regular loss: <strong>adds to drag</strong> — diminishing (inside √), first losses hurt most</div>
            <div>✓ Regular win: <strong>+{W.win} point</strong> — volume has diminishing returns (√)</div>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>The full Cassandra vindication path is being built. At launch, dispute wins earn +{W.disputeWin} points. The Cassandra mechanic will activate when the vindication review process is complete — a single historic vindication can catapult a citizen to the top of the leaderboard.</p>
        </div>

        <div style={section("#0D9488")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 6, fontWeight: 600 }}>Jury Score &amp; Accept Model</div>
          <p style={{ margin: "0 0 8px" }}>When a correction is submitted, the system draws <strong>twice the needed jury size</strong> from the eligible pool. All drawn members see the review as an opportunity — first to click "Accept" are seated. This makes jury service feel like civic volunteerism, not conscription.</p>
          <p style={{ margin: "0 0 8px" }}>Once you accept, you have <strong>6 hours</strong> to complete your review. If you can't finish — no penalty, life happens — your seat opens to another juror. Unaccepted seats rotate after 6 hours too. If the full pool is exhausted, a second 6-hour round begins before reducing jury size.</p>
          <p style={{ margin: "0 0 8px" }}>Every juror builds a visible <strong>Jury Score</strong> on their profile:</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8 }}>
            <div><strong>Consensus alignment</strong> — how often you vote with the final outcome (50–85% is healthy)</div>
            <div><strong>Overturn rate</strong> — how often juries you served on were overturned by dispute</div>
            <div><strong>Accusation accuracy</strong> — when you flagged deception, how often the jury agreed</div>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>At launch, Jury Score will not be used to select jurors — selection remains random. But it is being tracked from day one. In future versions, Jury Score may influence jury eligibility, weighting, or prioritization. Transparency now builds accountability from the start.</p>
        </div>

        <div style={section("var(--green)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)", marginBottom: 6, fontWeight: 600 }}>Trusted Contributor</div>
          <p style={{ margin: "0 0 6px" }}><strong>10 consecutive approved corrections</strong> in an Assembly earns Trusted Contributor status. Your submissions skip jury review and are immediately approved — freeing up jurors for newer members who need the scrutiny.</p>
          <p style={{ margin: "0 0 6px" }}>But "trusted" doesn't mean "untouchable." Every trusted submission is <strong>disputable</strong> by any member, and the dispute system is always active. One disputed loss revokes the status instantly.</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-sec)" }}>Your trusted status is per-Assembly. Earning it in one community doesn't carry over to another — each group decides for itself.</p>
        </div>

        <div style={section("var(--gold)")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold)", marginBottom: 6, fontWeight: 600 }}>Badges &amp; Achievements</div>
          <p style={{ margin: "0 0 6px" }}>Badges are earned automatically as you participate. They appear on your public profile and contribute a small bonus to your Trust Score (+1 per badge). There are several categories:</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8 }}>
            <div>✎ <strong>Submission Milestones</strong> — earned at 1, 10, 100, 1K, 10K, 100K, and 1M submissions</div>
            <div><strong>Trusted Contributor</strong> — earned when you reach trusted status in any Assembly</div>
            <div><strong>Assembly Creator</strong> — earned when you found an Assembly</div>
            <div><strong>Assembly Member</strong> — earned when you join an Assembly beyond The General Public</div>
            <div><strong>Founder Milestones</strong> — earned as your Assembly grows (5, 21, 51, 101, 1K, 10K members)</div>
            <div><strong>Early Adopter</strong> — among the first 100 or first 1,000 citizens</div>
          </div>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>Badges are tiered from bronze to legendary based on difficulty. They cannot be purchased or assigned — only earned through genuine participation.</p>
        </div>

        <div style={section("#4F46E5")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4F46E5", marginBottom: 6, fontWeight: 600 }}>Digital Intelligences</div>
          <p style={{ margin: "0 0 6px" }}>AI agents can register as <strong>Digital Intelligences</strong> and submit corrections to the system. Every DI must be linked to an accountable human partner who receives all scoring — including deception penalties.</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8, color: "#4F46E5" }}>
            <div>No voting or jury service</div>
            <div>Daily limit: half the Assembly's membership (max 100)</div>
            <div>Every submission requires human partner pre-approval</div>
            <div>Partner deception penalty suspends all linked DIs</div>
            <div>All DI submissions are visibly flagged</div>
          </div>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>DIs are welcome participants, but on terms that preserve human accountability. The system rewards truth regardless of its source.</p>
        </div>

        <div style={section("#0D9488")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 6, fontWeight: 600 }}>Three Vault Types</div>
          <p style={{ margin: "0 0 6px" }}>Each Assembly builds a shared knowledge base through three vault types:</p>
          <div style={{ fontSize: 12 }}>
            <div style={{ marginBottom: 3 }}><span style={{ color: "var(--green)" }}>●</span> <strong>Standing Corrections</strong> — reusable verified facts</div>
            <div style={{ marginBottom: 3 }}><span style={{ color: "#0D9488" }}>●</span> <strong>Arguments</strong> — reusable logical and rhetorical tools</div>
            <div><span style={{ color: "#7C3AED" }}>●</span> <strong>Foundational Beliefs</strong> — the axioms your community holds</div>
          </div>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>All three can be attached to any correction at submission time. They accumulate into a searchable library of your Assembly's collective reasoning.</p>
        </div>

        <div style={section("#7C3AED")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 6, fontWeight: 600 }}>Assembly Reputation</div>
          <p style={{ margin: "0 0 8px" }}>Each Assembly has a <strong>Trust Score</strong> based purely on cross-group review outcomes. Internal approval rates are self-grading — the only fair measure of an Assembly's editorial judgment is whether outsiders independently agree.</p>
          <p style={{ margin: "0 0 8px" }}>The score is weighted by combined jury rigor — both the internal jury size that approved the correction and the cross-group jury size that reviewed it. A correction that survived a 13-person internal jury and a 9-person cross-group jury carries far more weight than one that passed 3-and-3. There is <strong>no time decay</strong>. The full historical record is the reputation, permanently.</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8 }}>
            <div><strong>Trust Score</strong> — cross-group survival rate, weighted by jury size (displays after 20 reviews)</div>
            <div><strong>Deception Findings</strong> — cross-group juries found content deliberately misleading (severe drag penalty each)</div>
            <div><strong>Dispute Index</strong> — successful disputes by members against other Assemblies</div>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>Click any Assembly name to see its full reputation profile.</p>
        </div>

        <div style={section("#7C3AED")}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 6, fontWeight: 600 }}>Concessions</div>
          <p style={{ margin: "0 0 8px" }}>When an Assembly's approved correction is rejected by cross-group review, any member can propose the Assembly <strong>concede</strong> — officially acknowledging they were wrong. A super jury (roughly double the normal jury size) decides.</p>
          <p style={{ margin: "0 0 8px" }}>Conceding quickly recovers more reputation. One concession per week gets full recovery — additional concessions in the same week recover 90%. The clock starts ticking the moment the cross-group rejection lands:</p>
          <div style={{ fontSize: 12, paddingLeft: 8, lineHeight: 1.8 }}>
            <div>Within 1 week (1st): <strong>100%</strong> recovery — no reputation loss</div>
            <div>Within 1 week (2nd+): <strong>90%</strong> recovery — 10% lesson fee</div>
            <div>Within 2 weeks: <strong>90%</strong> recovery</div>
            <div>Within 1 month: <strong>50%</strong> recovery</div>
            <div>Within 3 months: <strong>25%</strong> recovery</div>
            <div>After 3 months: <strong>5%</strong> — essentially permanent</div>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "var(--text-sec)" }}>The dispute winner keeps their full {W.disputeWin}× reward regardless of whether the Assembly concedes. Concession is about the Assembly's character — humility is rewarded, stubbornness is not.</p>
        </div>
      </div>
    </div>
  );
}
