import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, sans-serif", background: "#FAF8F0", color: "#1a1a1a",
    }}>
      <div style={{ textAlign: "center", maxWidth: 440, padding: "40px 24px" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 64, fontWeight: 700, color: "#B8963E", marginBottom: 8 }}>404</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 400, marginBottom: 12 }}>Page not found</h1>
        <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, marginBottom: 28 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <Link href="/" style={{
            padding: "10px 24px", background: "#B8963E", color: "#FAF8F0", textDecoration: "none",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "1px",
          }}>GO HOME</Link>
          <Link href="/submit" style={{
            padding: "10px 24px", background: "transparent", color: "#B8963E", textDecoration: "none",
            border: "1px solid #B8963E",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "1px",
          }}>SUBMIT A CORRECTION</Link>
        </div>
        <p style={{ fontSize: 11, color: "#aaa", marginTop: 32 }}>The Trust Assembly</p>
      </div>
    </main>
  );
}
