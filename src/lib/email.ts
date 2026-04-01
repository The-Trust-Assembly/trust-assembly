// Email sending via Resend.
// Never throws — swallows errors like notifications.ts so callers are never disrupted.

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = process.env.EMAIL_FROM || "The Trust Assembly <noreply@trustassembly.org>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

export async function sendWelcomeEmail(email: string, username: string, verificationToken?: string): Promise<void> {
  if (!resend) { console.warn("[email] RESEND_API_KEY not set, skipping welcome email"); return; }
  const verifyUrl = verificationToken ? `${APP_URL}/verify-email?token=${encodeURIComponent(verificationToken)}` : null;
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: verifyUrl ? "Verify your email — The Trust Assembly" : "Welcome to The Trust Assembly",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="margin: 0 0 16px;">Welcome, @${username}</h2>
          <p style="line-height: 1.6; margin: 0 0 12px;">
            You've joined The Trust Assembly — a civic deliberation platform where
            truth is the only thing that survives adversarial review.
          </p>
          ${verifyUrl ? `
          <p style="line-height: 1.6; margin: 0 0 12px;">
            <strong>Verify your email to start submitting corrections.</strong>
            Click the button below to confirm your email address.
          </p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #B8963E; color: #fff; padding: 12px 28px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Verify Email and Get Started
            </a>
          </p>
          <p style="line-height: 1.6; margin: 0 0 12px; font-size: 13px; color: #666;">
            This link expires in 24 hours. You can browse the platform while you wait, but submitting corrections requires a verified email.
          </p>
          ` : `
          <p style="line-height: 1.6; margin: 0 0 12px;">
            Start by submitting a correction or reviewing submissions from your
            fellow citizens. Every vote counts.
          </p>
          <p style="margin: 24px 0;">
            <a href="${APP_URL}" style="background: #B8963E; color: #fff; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Enter the Assembly
            </a>
          </p>
          `}
          <p style="font-size: 12px; color: #999; margin-top: 32px;">
            You're receiving this because you registered at ${APP_URL}.
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("[email] Failed to send welcome email:", e);
  }
}

export async function sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
  if (!resend) { console.warn("[email] RESEND_API_KEY not set, skipping verification email"); return; }
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Verify your email — The Trust Assembly",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="margin: 0 0 16px;">Verify your email</h2>
          <p style="line-height: 1.6; margin: 0 0 12px;">
            Click below to verify your email for <strong>@${username}</strong> and start submitting corrections.
          </p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #B8963E; color: #fff; padding: 12px 28px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Verify Email
            </a>
          </p>
          <p style="line-height: 1.6; margin: 0 0 12px; font-size: 13px; color: #666;">
            This link expires in 24 hours. If you didn't create this account, ignore this email.
          </p>
          <p style="font-size: 12px; color: #999; margin-top: 32px;">
            The Trust Assembly · ${APP_URL}
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("[email] Failed to send verification email:", e);
  }
}

export async function sendPasswordResetEmail(email: string, username: string, token: string): Promise<void> {
  if (!resend) { console.warn("[email] RESEND_API_KEY not set, skipping reset email"); return; }
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Reset your Trust Assembly password",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="margin: 0 0 16px;">Password Reset</h2>
          <p style="line-height: 1.6; margin: 0 0 12px;">
            We received a request to reset the password for <strong>@${username}</strong>.
          </p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}" style="background: #B8963E; color: #fff; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Reset Password
            </a>
          </p>
          <p style="line-height: 1.6; margin: 0 0 12px; font-size: 13px; color: #666;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
          <p style="font-size: 12px; color: #999; margin-top: 32px;">
            The Trust Assembly · ${APP_URL}
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("[email] Failed to send password reset email:", e);
  }
}
