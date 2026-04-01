// Cloudflare Turnstile verification utility.
// Verifies CAPTCHA tokens against Cloudflare's siteverify endpoint.
// Skips verification if TURNSTILE_SECRET_KEY is not set (local dev).

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set, skipping verification");
    return true;
  }

  if (!token) return false;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });

    if (!response.ok) {
      console.error("[turnstile] Verification request failed:", response.status);
      return true; // Fail open if Cloudflare is down — don't block registration
    }

    const data = await response.json();
    return data.success === true;
  } catch (e) {
    console.error("[turnstile] Verification error:", e);
    return true; // Fail open on network errors
  }
}
