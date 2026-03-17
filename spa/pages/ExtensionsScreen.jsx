export default function ExtensionsScreen() {
  const stepStyle = { display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-start" };
  const numStyle = { background: "#2563EB", color: "#fff", width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2 };
  const codeStyle = { background: "#E8E4DC", padding: "3px 8px", borderRadius: 8, fontFamily: "var(--mono)", fontSize: 12, color: "var(--charcoal)" };

  return (
    <div>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Browser Extension</h2>
      <p style={{ fontSize: 14, color: "#475569", marginBottom: 20, lineHeight: 1.7 }}>
        The Trust Assembly browser extension overlays verified corrections, affirmations, and translations directly on news articles as you read them. No extra tabs. No searching. Truth finds you.
      </p>

      {/* Download buttons */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
        <a href="/trust-assembly-chrome.zip" download style={{ textDecoration: "none" }}>
          <button className="ta-btn-primary" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", fontSize: 12 }}>
            <span style={{ fontSize: 18 }}>&#9672;</span> Download for Chrome
          </button>
        </a>
        <a href="/trust-assembly-firefox.zip" download style={{ textDecoration: "none" }}>
          <button className="ta-btn-primary" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", fontSize: 12, background: "var(--evergreen)" }}>
            <span style={{ fontSize: 18 }}>&#9672;</span> Download for Firefox
          </button>
        </a>
        <a href="/trust-assembly-safari.zip" download style={{ textDecoration: "none" }}>
          <button className="ta-btn-primary" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", fontSize: 12, background: "#0071E3" }}>
            <span style={{ fontSize: 18 }}>&#9672;</span> Download for Safari
          </button>
        </a>
      </div>

      {/* Chrome instructions */}
      <div className="ta-card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--navy)" }}>Chrome / Edge / Brave — Developer Mode Install</h3>
        <div style={stepStyle}><div style={numStyle}>1</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Download and <strong>unzip</strong> the Chrome extension file above into a new folder.</div></div>
        <div style={stepStyle}><div style={numStyle}>2</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Open your browser and navigate to <span style={codeStyle}>chrome://extensions</span> (or <span style={codeStyle}>edge://extensions</span> / <span style={codeStyle}>brave://extensions</span>).</div></div>
        <div style={stepStyle}><div style={numStyle}>3</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Toggle <strong>"Developer mode"</strong> on — it's in the top-right corner of the page.</div></div>
        <div style={stepStyle}><div style={numStyle}>4</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Click <strong>"Load unpacked"</strong> and select the folder containing the unzipped extension files (where <span style={codeStyle}>manifest.json</span> is located).</div></div>
        <div style={stepStyle}><div style={numStyle}>5</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>The Trust Assembly icon will appear in your toolbar. Pin it for easy access. Visit any news article to see corrections and translations overlaid automatically.</div></div>
        <div style={{ padding: 10, background: "#FFFBEB", border: "1px solid #B45309", borderRadius: 8, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
          <strong>Note:</strong> Chrome may show a "Disable developer mode extensions" popup on restart. Click the three dots and select "Keep" to keep the extension active.
        </div>
      </div>

      {/* Firefox instructions */}
      <div className="ta-card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--evergreen)" }}>Firefox — Temporary Add-on Install</h3>
        <div style={stepStyle}><div style={numStyle}>1</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Download and <strong>unzip</strong> the Firefox extension file above into a new folder.</div></div>
        <div style={stepStyle}><div style={numStyle}>2</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Open Firefox and navigate to <span style={codeStyle}>about:debugging#/runtime/this-firefox</span></div></div>
        <div style={stepStyle}><div style={numStyle}>3</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Click <strong>"Load Temporary Add-on..."</strong></div></div>
        <div style={stepStyle}><div style={numStyle}>4</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>Select the <span style={codeStyle}>manifest.json</span> file from the unzipped folder.</div></div>
        <div style={stepStyle}><div style={numStyle}>5</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>The extension is now active. Visit any news article to see Trust Assembly corrections overlaid.</div></div>
        <div style={{ padding: 10, background: "#FFFBEB", border: "1px solid #B45309", borderRadius: 8, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
          <strong>Note:</strong> Firefox temporary add-ons are removed when you close the browser. You'll need to reload it each session until the extension is published to the Firefox Add-ons store.
        </div>
      </div>

      {/* Safari instructions */}
      <div className="ta-card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "#0071E3" }}>Safari — macOS, iPhone &amp; iPad</h3>
        <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>Safari Web Extensions work across <strong>macOS, iOS, and iPadOS</strong> (Safari 15+). One extension, all Apple devices.</p>
        <div style={stepStyle}><div style={{ ...numStyle, background: "#0071E3" }}>1</div><div style={{ fontSize: 13, lineHeight: 1.7 }}><strong>macOS:</strong> Install the Trust Assembly extension from the Mac App Store (coming soon). Once installed, open <span style={codeStyle}>Safari → Settings → Extensions</span> and enable "Trust Assembly".</div></div>
        <div style={stepStyle}><div style={{ ...numStyle, background: "#0071E3" }}>2</div><div style={{ fontSize: 13, lineHeight: 1.7 }}><strong>iPhone / iPad:</strong> Install from the App Store. Then go to <span style={codeStyle}>Settings → Safari → Extensions</span>, tap Trust Assembly, and toggle it on. Grant permission to run on news sites.</div></div>
        <div style={stepStyle}><div style={{ ...numStyle, background: "#0071E3" }}>3</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>The extension syncs your Trust Assembly account across all your Apple devices. Corrections and translations appear automatically as you browse.</div></div>
        <div style={{ padding: 10, background: "#E8F0FE", border: "1px solid #0071E3", borderRadius: 8, fontSize: 12, color: "#004EA2", lineHeight: 1.6 }}>
          <strong>Status:</strong> The Safari extension is being prepared for App Store submission. In the meantime, developers can build it locally using <span style={codeStyle}>xcrun safari-web-extension-converter</span> with the Chrome extension source.
        </div>
      </div>

      {/* Privacy — browsing blind */}
      <div className="ta-card" style={{ borderLeft: "4px solid #059669", marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--evergreen)" }}>Your Browsing Is Private — By Design</h3>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 10 }}>The Trust Assembly extension sends the URL of the page you're reading to our server so we can check whether any corrections, affirmations, or translations exist for it. <strong>That's it.</strong> Here's what we don't do:</div>
          <div style={{ marginBottom: 6, paddingLeft: 16 }}>
            <div style={{ marginBottom: 4 }}>⛔ <strong>No browsing history is stored.</strong> We don't log which URLs are queried. The server reads the URL, checks for matching corrections in memory, and returns the result. Nothing is written.</div>
            <div style={{ marginBottom: 4 }}>⛔ <strong>No IP logging.</strong> We don't record your IP address, browser fingerprint, or any request metadata.</div>
            <div style={{ marginBottom: 4 }}>⛔ <strong>No analytics or tracking.</strong> There are no pixels, beacons, or third-party scripts. No Google Analytics. No telemetry.</div>
            <div style={{ marginBottom: 4 }}>⛔ <strong>No user association.</strong> The extension doesn't send your Trust Assembly username or session with URL lookups. The query is anonymous.</div>
            <div style={{ marginBottom: 4 }}>⛔ <strong>No server-side cache of queries.</strong> We don't maintain a record of what pages were checked or how often.</div>
          </div>
          <div style={{ marginBottom: 10 }}>The only URLs we store are the ones <em>submitters voluntarily publish</em> when they submit a correction — that's the article they're correcting, and it's public by design. Your reading activity is completely invisible to us.</div>
          <div style={{ padding: 10, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}>
            <strong>Technical detail:</strong> Results are cached in your browser's <code style={{ background: "#E8E4DC", padding: "1px 4px", borderRadius: 8 }}>sessionStorage</code> for 5 minutes to reduce network requests. This cache is local to your machine, per-tab, and cleared automatically when you close the tab. We never see it.
          </div>
        </div>
      </div>

      {/* What it does */}
      <div className="ta-card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--navy)" }}>What the Extension Does</h3>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 8 }}><strong style={{ color: "var(--fired-clay)" }}>Corrections</strong> — When a news article's headline has been corrected through Trust Assembly review, the extension shows a badge count and displays the verified correction alongside the original.</div>
          <div style={{ marginBottom: 8 }}><strong style={{ color: "var(--evergreen)" }}>Affirmations</strong> — Headlines that survived adversarial review and were confirmed accurate are marked as verified.</div>
          <div style={{ marginBottom: 8 }}><strong style={{ color: "var(--indigo)" }}>Translations</strong> — Jargon, spin, propaganda, and euphemisms are replaced with plain-language alternatives approved through jury review. Toggle categories (Clarity, Anti-Propaganda, Euphemism, Satirical) in the popup.</div>
          <div><strong style={{ color: "var(--stone)" }}>Settings</strong> — Click the extension icon to toggle badge visibility and translation overlays on or off.</div>
        </div>
      </div>

      {/* How to use the extension */}
      <div className="ta-card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--navy)" }}>How It Works — Step by Step</h3>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>1. Browse normally.</strong> The extension runs silently in the background. Every page you visit is checked against the Trust Assembly record — if corrections, affirmations, or translations exist, a small <strong>floating badge</strong> appears in the corner of the page with a count.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>2. Click the badge or the extension icon.</strong> A side panel opens showing every correction, affirmation, and translation for the current article. Corrections are color-coded: <span style={{ color: "var(--fired-clay)", fontWeight: 700 }}>red</span> for corrections, <span style={{ color: "var(--evergreen)", fontWeight: 700 }}>green</span> for affirmations, and <span style={{ color: "#D4850A", fontWeight: 700 }}>amber</span> for translations. If your assemblies reviewed the article, you'll see <em>Joined</em> or <em>Followed</em> badges next to the assembly name.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>3. Translations appear inline.</strong> When a translation is active, the original text on the page is annotated with a dotted underline and a small <sup style={{ color: "#2A6B6B", fontWeight: 700 }}>TA</sup> superscript. Hover to see the plain-language alternative. Toggle inline translations on or off in the popup settings.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>4. Submit corrections from any page.</strong> Click the extension icon, go to the <strong>Submit</strong> tab, and the article's URL and headline are automatically filled in. Choose your assembly, write your corrected headline and reasoning, and submit. Your correction enters the Trust Assembly review process — jury deliberation, cross-group review, and consensus.
          </div>
          <div>
            <strong>5. When multiple assemblies disagree,</strong> the extension uses <em>conflict resolution</em>: corrections are grouped by headline, and the assembly with the highest trust score wins top display. Other perspectives are collapsed beneath — always visible, never hidden.
          </div>
        </div>
      </div>

      {/* Trust scores and what they mean */}
      <div className="ta-card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--navy)" }}>Understanding What You See</h3>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>Trust Scores</strong> — Each correction and affirmation displays the submitter's profile and trust score. Scores are earned through consistent, accurate contributions that survive community review. A higher score means more of that person's work has been validated by juries.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Statuses</strong> — Corrections move through a lifecycle:
            <div style={{ paddingLeft: 16, marginTop: 6 }}>
              <div style={{ marginBottom: 3 }}>&#8226; <strong>Under Review</strong> — Submitted and awaiting jury deliberation.</div>
              <div style={{ marginBottom: 3 }}>&#8226; <strong>Approved</strong> — Passed jury review within the originating assembly.</div>
              <div style={{ marginBottom: 3 }}>&#8226; <strong>Cross-Group Review</strong> — Being reviewed by a second, independent assembly for additional validation.</div>
              <div style={{ marginBottom: 3 }}>&#8226; <strong>Consensus</strong> — Approved by multiple assemblies. The strongest level of verification.</div>
              <div style={{ marginBottom: 3 }}>&#8226; <strong>Dispute Upheld</strong> — A challenge was raised and the jury ruled in favor of the correction.</div>
            </div>
          </div>
          <div>
            <strong>Assembly Badges</strong> — If you're a member of or following an assembly that reviewed the article, you'll see a <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "1px 6px", borderRadius: 2, background: "#1B5E3F", color: "#fff" }}>Joined</span> or <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "1px 6px", borderRadius: 2, background: "#2A6B6B", color: "#fff" }}>Followed</span> badge. This helps you quickly identify corrections from communities you trust.
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="ta-card">
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 19, marginBottom: 14, color: "var(--navy)" }}>Frequently Asked Questions</h3>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>Do I need a Trust Assembly account?</strong><br />
            No — you can view corrections and translations without logging in. You only need an account to submit corrections or manage assembly memberships.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Why don't I see anything on most pages?</strong><br />
            The extension only shows results for pages that have been reviewed. If no one has submitted a correction, affirmation, or translation for a given article, the extension stays silent. That doesn't mean the article is accurate — it means it hasn't been reviewed yet.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Can I submit corrections from the extension?</strong><br />
            Yes. Click the extension icon, go to the Submit tab, and the page URL and headline are pre-filled automatically. Select your assembly, write your correction and reasoning, and submit.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Does it work on any website?</strong><br />
            The extension runs on all HTTP/HTTPS pages. It works best on news sites, but you can submit corrections for any public webpage with a headline.
          </div>
          <div>
            <strong>Will it slow down my browsing?</strong><br />
            No. The extension makes one lightweight API call per page and caches results for 5 minutes. There's no impact on page load or rendering speed.
          </div>
        </div>
      </div>
    </div>
  );
}
