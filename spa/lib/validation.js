import { RESERVED_USERNAMES, DISPOSABLE_EMAIL_DOMAINS } from "./constants";

export function valPw(pw) { if (pw.length < 8) return "Min 8 characters."; if (!/[A-Z]/.test(pw)) return "Need uppercase."; if (!/[a-z]/.test(pw)) return "Need lowercase."; if (!/[0-9]/.test(pw)) return "Need number."; return null; }

export function sanitizeUsername(raw) {
  // Strip ALL whitespace including zero-width chars, leading @, then lowercase
  return raw.replace(/[\s\u200B\u200C\u200D\uFEFF\u00A0]/g, "").replace(/^@+/, "").toLowerCase();
}

export function valUsername(uname) {
  if (uname.length < 3) return "Username: 3 character minimum.";
  if (uname.length > 30) return "Username: 30 character maximum.";
  if (!/^[a-z0-9_]+$/.test(uname)) return "Username: letters, numbers, and underscores only.";
  if (/^_|_$/.test(uname)) return "Username can't start or end with underscore.";
  if (/__/.test(uname)) return "Username can't have consecutive underscores.";
  if (RESERVED_USERNAMES.has(uname)) return "That username is reserved.";
  return null;
}

export function valEmail(raw) {
  const email = raw.trim().toLowerCase();
  if (!email) return "Email required.";
  // RFC-lite: something@something.something
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Enter a valid email address.";
  const domain = email.split("@")[1];
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return "Disposable email addresses are not allowed.";
  return null;
}

export function normalizeEmail(raw) {
  let email = raw.trim().toLowerCase();
  const [local, domain] = email.split("@");
  // Gmail dot normalization: a.b.c@gmail.com → abc@gmail.com
  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Also strip +aliases: user+tag@gmail.com → user@gmail.com
    const base = local.split("+")[0].replace(/\./g, "");
    email = base + "@gmail.com";
  }
  return email;
}

export function valDisplayName(name) {
  if (!name.trim()) return "Display name required.";
  if (name.trim().length > 50) return "Display name: 50 character maximum.";
  return null;
}

export function valRealName(name) {
  if (!name.trim()) return "Legal name required.";
  if (name.trim().length > 80) return "Legal name: 80 character maximum.";
  return null;
}
