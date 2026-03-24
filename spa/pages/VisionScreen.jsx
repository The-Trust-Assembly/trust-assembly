export default function VisionScreen() {
  const S = ({ children }) => <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, margin: "24px 0 8px", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>{children}</h3>;
  const Sub = ({ children }) => <h4 style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700, margin: "16px 0 6px", color: "var(--text)" }}>{children}</h4>;
  const P = ({ children, ...props }) => <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", marginBottom: 10, ...props.style }}>{children}</p>;
  const Note = ({ icon, color, children }) => <div style={{ padding: 14, background: color + "10", border: `1.5px solid ${color}`, borderRadius: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}><strong>{icon}</strong> {children}</div>;
  return (
    <div><div className="ta-section-rule" /><h2 className="ta-section-head">Future Vision</h2>
      <div className="ta-card" style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)" }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-sec)", fontStyle: "italic", marginBottom: 16 }}>A roadmap for building the credibility infrastructure of the future.</p>

        <Note icon="🏛" color="#059669">Trust Assembly intends to register as a <strong>nonprofit organization</strong> before accepting any revenue. We will also accept <strong>donations</strong> from individuals and foundations who share this vision. Every dollar that enters the system will be used to support its growth, with a primary focus on rewarding participants for high quality work and to build a support staff and architecture.</Note>

        <S>How This Will Make Money</S>
        <P>The platform is free to use. The corrections are free to read. But the process of producing verified truth at scale requires real resources — jurors who are compensated for careful review, infrastructure that runs reliably, and development that keeps the system ahead of those who would game it.</P>
        <P style={{ fontWeight: 700, color: "var(--text)" }}>All money flows through to preserve credibility and fund it. Nobody in the system is paid to reach a specific conclusion. The money is fuel. The credibility engine runs on the math. A republic-style voting process will be introduced in later iterations so that new rules can be added as needed to protect the integrity of the system.</P>
        <P>We intend to pursue the following revenue streams, with a primary focus on <strong>subscriptions</strong> and <strong>bounties</strong>.</P>

        <Sub>Subscriptions</Sub>
        <P>Anyone can follow any Assembly for free. Assemblies are lenses — curated perspectives from communities whose values and rigor you trust. An environmental activist follows the Climate Science Assembly. A libertarian follows the Government Accountability Assembly. The browser extension delivers each Assembly's approved corrections directly into the reader's experience.</P>
        <P>Extension users will see a call to action to <strong>support the work</strong> of the Assemblies they follow by subscribing. Subscription fees flow directly to the Assembly's jury payment pool, funding faster reviews and higher-quality adjudication for the work that Assembly produces.</P>
        <P>An <strong>Institutional tier</strong> provides API access, bulk correction feeds, embeddable widgets, and analytics dashboards for newsrooms, platforms, and research organizations integrating Trust Assembly's credibility signals.</P>

        <Sub>Prominence & Visibility Rules</Sub>
        <P>Not all corrections are equal. Rules will govern what content is elevated to visibility: high-quality work — corrections with high jury ratings, from high-Trust-Score citizens and Assemblies — will be pushed to prominence. Low-quality work will be filtered out before it reaches the visibility layer. At scale, we will also provide <strong>ratings for entire websites, organizations, and public figures</strong> engaged in the dissemination of information. Prominence rules will apply when these features are enabled.</P>
        <Note icon="📜" color="#CA8A04">This will be called <strong>"The Illuminatus Uncle Rule"</strong> — or: you don't need a system this powerful because you want to win an argument with your uncle at Thanksgiving. Prominence exists to serve the public interest, not personal vendettas.</Note>

        <Sub>Bounties</Sub>
        <P>Anyone can post a bounty by submitting a <strong>piece of media and related information about that media</strong>. Bounties must be submitted as a neutral set of facts in need of analysis — <strong>they are not permitted to include a point of view</strong>. The bounty is a question, not an argument.</P>
        <P>High-reputation submitters get <strong>first access</strong> to review and respond to bounties. The submitter files a correction through the normal submission and review flow and receives payment only if the correction survives jury review.</P>
        <P>The cost of a bounty includes funds set aside for: <strong>jurors</strong> (review compensation), <strong>submitters</strong> (correction reward), <strong>administration</strong> (platform operations), and a <strong>standing challenge</strong> — essentially a bet that no one can overturn the ruling. This standing challenge becomes the minimum cost someone must meet to dispute the bounty's outcome, and it continues to grow as disputes are filed. If you enter a dispute against a bounty ruling and lose, your matching stake is forfeited — a portion goes to the review team, and the rest increases the standing challenge, making it progressively more expensive to challenge an established ruling. Trust Assembly generates revenue in part by holding bounty funds in escrow during the review and dispute process.</P>
        <P>The cost of disputing escalates with each successive round, weighted by the Trust Score ratio between the disputer and their target. Challenging someone with much higher credibility is expensive — you'd better be sure. Citizens vindicated through the Cassandra process receive a full refund of all dispute fees plus a premium.</P>

        <Sub>Where Money Applies</Sub>
        <Note icon="⚖" color="var(--text)"><strong>Important:</strong> Disputes and cross-group reputation are the only places where money applies. Inside an Assembly, all activity is free. Any money used to accelerate in-group review is <strong>voluntarily donated by subscribers</strong> who follow the Assembly and support its work.</Note>

        <Sub>Appeal Adjudication</Sub>
        <P>When a user is banned or moderated on a social media platform, they currently have no credible independent appeal. Trust Assembly can provide one. The <strong>person requesting the appeal pays Trust Assembly</strong>, which distributes the fee: jurors are compensated for their review, a portion is returned to the originating platform as a processing credit, and Trust Assembly retains a small administration fee. The jury evaluates the content against the platform's own stated policies — not Trust Assembly's rules. The verdict is non-binding but carries real credibility weight as an independent, auditable assessment.</P>

        <Sub>Review Verification</Sub>
        <P>Product and service reviews are plagued by fakes. Trust Assembly can audit reviews for authenticity — not approving or rejecting the opinion, but verifying the reviewer is real and the review is genuine. A "Trust Assembly Verified" badge means an independent jury has audited the review. This is a <strong>revenue source for participating Assemblies</strong> — specialized review Assemblies earn fees for the verification work their members perform. Brands pay a per-review fee or monthly subscription; consumers get a reliable signal in an ocean of noise. Ad revenue from a consumer-facing review portal provides an additional revenue stream.</P>

        <Sub>Reputation Insurance</Sub>
        <Note icon="⏳" color="#D97706">Reputation insurance will activate when the system has sufficient scale to deliver on these promises.</Note>
        <P>Individuals and organizations will be able to subscribe to a rapid-response plan. When targeted by misinformation, subscribers trigger an expedited review at reduced cost. Not a guarantee of vindication — priority access to the verification process. Like insurance, many subscribers will never file a claim, and their premiums fund the jury pool that serves those who do.</P>

        <Sub>The AI Credibility Vault</Sub>
        <P>As AI systems become more powerful, the question of what they treat as true becomes critical. Trust Assembly intends to become a <strong>fact vault for AI companies</strong> — a structured, verified, jury-reviewed dataset of corrections and credibility signals that can meaningfully influence and steer large language models. When an AI is asked about a claim that Trust Assembly has reviewed, it should know what the jury found. This positions Trust Assembly to shape the accuracy of AI-generated information at scale, and provides a licensing revenue stream from AI companies that want access to high-quality verified data.</P>

        <S>Features on the Horizon</S>

        <Sub>AI Story Tracking Agent</Sub>
        <Note icon="⏳" color="#D97706">Currently blocked by funding for inference tokens.</Note>
        <P>When a correction is approved on one article, the same misinformation often appears in dozens of subsequent stories. We intend to build an AI agent that continuously scans the web for related stories and appends approved corrections on a <strong>provisional basis</strong>. This is how Trust Assembly scales from correcting individual articles to making it structurally impossible to tell a lie and get away with it. A false claim corrected once is corrected everywhere.</P>

        <Sub>Assembly AI Agents</Sub>
        <Note icon="⏳" color="#D97706">Currently blocked by funding for inference tokens.</Note>
        <P>Every Assembly above a certain size will have access to its own AI agent — one that monitors news in the Assembly's areas of interest, identifies articles that may contain errors, and recommends potential submissions for member review. The agent doesn't submit corrections — humans always make the final call — but it ensures even a small group of dedicated citizens can compete at scale.</P>

        <Sub>Additional Interfaces & Partnerships</Sub>
        <P>Trust Assembly's corrections and credibility data should appear everywhere information appears: browser extensions, social media integrations, RSS feeds, news aggregator widgets, CMS plugins, search engine signals, and AI training data partnerships. Every interface where a person encounters a claim is an interface where a Trust Assembly correction should be available. Our goal is to build partnerships that give benefit to any platform willing to surface credibility signals.</P>

        <div style={{ padding: 16, background: "var(--card-bg)", borderRadius: 0, marginTop: 20, marginBottom: 20, border: "1.5px solid #BFDBFE" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6, fontWeight: 600 }}>Our Goal</div>
          <div style={{ fontSize: 18, color: "var(--text)", lineHeight: 1.6 }}>Trust Assembly aims to become the <strong style={{ color: "var(--gold)" }}>credibility bank of the future</strong> — a trusted, independent, transparent institution whose Trust Scores are recognized as the standard measure of informational reliability. The way a credit score tells a lender how much to trust a borrower, a Trust Score tells a reader how much to trust a claim.</div>
        </div>

        <S>The Larger Vision</S>
        <P>Everything described above is <strong>one leg</strong> of a larger system.</P>
        <P>Trust Assembly begins with media corrections because that's where the need is most acute and the mechanism most straightforward. But the same architecture — structured deliberation, jury review, asymmetric scoring, the Cassandra mechanism — applies to collective decision-making itself.</P>

        <Sub>An AI-Compatible Government — The Forum</Sub>
        <P><strong>Anyone can propose an idea.</strong> A policy proposal, a community initiative, a position statement. The proposal enters structured deliberation where other citizens contribute their best thinking: amendments, supporting evidence, counterarguments, alternative framings. Each contribution is reviewed and rated on its merits, just as corrections are reviewed today.</P>
        <P><strong>The community evaluates desirability.</strong> Unlike the correction system — which measures accuracy — the Forum measures <strong>desirability, fairness, and justice</strong>. The rules are bent to answer not "is this true?" but "is this good?" Is this policy fair? Does it serve the people it claims to serve? Are the tradeoffs acceptable? Citizens evaluate proposals on these dimensions, and the scoring reflects how well a proposal survives scrutiny on its merits as policy, not as fact.</P>
        <P><strong>The result represents genuine collective will.</strong> A proposal that survives deliberation and earns majority support carries real credibility — not because many people clicked "like," but because it was stress-tested by a process that rewards thoughtful engagement. An endorsed proposal from a high-Trust-Score Assembly is a signal that credible people, after rigorous deliberation, collectively believe this is the right course of action.</P>

        <Sub>Political Accountability Tracking</Sub>
        <P>Campaign commitments become verifiable claims. Citizens can see which politicians deliver on their promises and which don't — measured by the same transparent system that evaluates media claims.</P>

        <Sub>Delegated Voting & Representative Authority</Sub>
        <P>Citizens will be able to <strong>defer their votes by topic</strong> to people they trust. If you know someone who deeply understands healthcare policy, delegate your healthcare votes to them. This creates natural concentrations of authority — not through institutional power, but through earned trust.</P>
        <P>The result: a <strong>personalized voting guide on your phone</strong>. Choices curated by trusted members of your community, tailored to your values and the expertise of the people you've chosen to represent you. Not a party telling you how to vote. Not an algorithm. A network of real people whose credibility you can verify, whose reasoning you can read, and whose track record is transparent.</P>

        <Sub>The Connective Tissue</Sub>
        <P>The Trust Score links everything. The reputation you build filing accurate corrections carries into deliberation. The jury process that evaluates media claims evaluates policy proposals. The Cassandra mechanism rewards the policy advocate who was right when everyone disagreed, just as it rewards the whistleblower.</P>
        <P>The credibility bank doesn't just tell you who to trust about what happened yesterday. It tells you who to trust about what should happen tomorrow.</P>

        <div style={{ marginTop: 24, padding: 14, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          This document represents our intentions and direction, not commitments or guarantees. We build in public because transparency is not just a feature of the system — it is the system.
        </div>
        <div style={{ textAlign: "center", marginTop: 12, fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "0.12em", color: "var(--text-sec)", fontStyle: "italic" }}>Truth Will Out.</div>
      </div>
    </div>
  );
}
