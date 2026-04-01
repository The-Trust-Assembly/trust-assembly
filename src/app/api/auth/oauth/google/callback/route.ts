import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { decodeJwt } from "jose";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// GET /api/auth/oauth/google/callback — handle Google OAuth redirect
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(`${appUrl}/login?error=oauth_denied`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${appUrl}/login?error=oauth_missing_params`);
    }

    // Validate CSRF state
    const storedState = request.cookies.get("ta-oauth-state")?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(`${appUrl}/login?error=oauth_csrf`);
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${appUrl}/api/auth/oauth/google/callback`;

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[oauth] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${appUrl}/login?error=oauth_token_failed`);
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;
    if (!idToken) {
      return NextResponse.redirect(`${appUrl}/login?error=oauth_no_id_token`);
    }

    // Decode ID token (no verification needed — came directly from Google over HTTPS)
    const claims = decodeJwt(idToken);
    const googleSub = claims.sub as string;
    const googleEmail = (claims.email as string)?.toLowerCase();
    const googleName = claims.name as string || "";
    const googleEmailVerified = claims.email_verified === true || claims.email_verified === "true";

    if (!googleSub || !googleEmail) {
      return NextResponse.redirect(`${appUrl}/login?error=oauth_invalid_claims`);
    }

    // Case A: Existing OAuth link — log in
    const existingLink = await sql`
      SELECT oa.user_id, u.username, u.profile_complete
      FROM oauth_accounts oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = 'google' AND oa.provider_id = ${googleSub}
    `;

    if (existingLink.rows.length > 0) {
      const user = existingLink.rows[0];
      const token = await createToken({ sub: user.user_id as string, username: user.username as string });
      await setSessionCookie(token);
      const dest = user.profile_complete === false ? "/complete-profile" : "/feed";
      const res = NextResponse.redirect(`${appUrl}${dest}`);
      // Clear state cookie
      res.cookies.set("ta-oauth-state", "", { maxAge: 0, path: "/" });
      return res;
    }

    // Case B: No OAuth link, but email matches existing verified user — auto-link
    const existingUser = await sql`
      SELECT id, username, email_verified FROM users
      WHERE email = ${googleEmail} AND is_di = FALSE
      LIMIT 1
    `;

    if (existingUser.rows.length > 0 && existingUser.rows[0].email_verified && googleEmailVerified) {
      const user = existingUser.rows[0];
      await sql`
        INSERT INTO oauth_accounts (user_id, provider, provider_id, provider_email)
        VALUES (${user.id as string}, 'google', ${googleSub}, ${googleEmail})
        ON CONFLICT DO NOTHING
      `;
      // Also verify email if not already
      await sql`UPDATE users SET email_verified = TRUE WHERE id = ${user.id as string} AND email_verified = FALSE`;

      const token = await createToken({ sub: user.id as string, username: user.username as string });
      await setSessionCookie(token);
      const res = NextResponse.redirect(`${appUrl}/feed`);
      res.cookies.set("ta-oauth-state", "", { maxAge: 0, path: "/" });
      return res;
    }

    // Case C: New user — create account with profile_complete=FALSE
    const tempUsername = `g_${googleSub.slice(0, 8)}_${randomBytes(3).toString("hex")}`;

    const newUser = await sql`
      INSERT INTO users (username, display_name, real_name, email, password_hash, salt, email_verified, email_verified_at, profile_complete)
      VALUES (${tempUsername}, ${googleName || tempUsername}, ${googleName || null}, ${googleEmail}, NULL, NULL, TRUE, now(), FALSE)
      RETURNING id, username
    `;

    const userId = newUser.rows[0].id as string;
    const username = newUser.rows[0].username as string;

    // Create OAuth link
    await sql`
      INSERT INTO oauth_accounts (user_id, provider, provider_id, provider_email)
      VALUES (${userId}, 'google', ${googleSub}, ${googleEmail})
    `;

    // Auto-join General Public
    const gp = await sql`SELECT id FROM organizations WHERE is_general_public = TRUE LIMIT 1`;
    if (gp.rows.length > 0) {
      const gpId = gp.rows[0].id as string;
      await sql`
        INSERT INTO organization_members (org_id, user_id, is_active, is_founder)
        VALUES (${gpId}, ${userId}, TRUE, FALSE)
        ON CONFLICT DO NOTHING
      `;
      await sql`UPDATE users SET primary_org_id = ${gpId} WHERE id = ${userId}`;
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, entity_id)
      VALUES ('User registered via Google OAuth', ${userId}, 'user', ${userId})
    `;

    const token = await createToken({ sub: userId, username });
    await setSessionCookie(token);
    const res = NextResponse.redirect(`${appUrl}/complete-profile`);
    res.cookies.set("ta-oauth-state", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    console.error("[oauth] Callback error:", e);
    return NextResponse.redirect(`${appUrl}/login?error=oauth_error`);
  }
}
