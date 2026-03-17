import { ADMIN_USERNAME } from "./constants";

export function gid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }

export function genAnonId(prefix) { return `${prefix}-${(1000 + Math.floor(Math.random() * 9000))}`; }

export function buildAnonMap(submitterUsername, jurorUsernames) {
  const map = {}; map[submitterUsername] = genAnonId("Citizen");
  jurorUsernames.forEach(j => { map[j] = genAnonId("Juror"); });
  return map;
}

export function crownUser(username) { return username === ADMIN_USERNAME ? `👑 @${username}` : `@${username}`; }

export function anonName(username, anonMap, isResolved) { return isResolved || !anonMap ? crownUser(username) : (anonMap[username] || crownUser(username)); }

export function fDate(iso) { if (!iso) return "N/A"; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

export function sDate(iso) { if (!iso) return ""; const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + "m"; if (d < 86400) return Math.floor(d / 3600) + "h"; if (d < 604800) return Math.floor(d / 86400) + "d"; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

export function daysBetween(a, b) { return Math.abs(Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)); }

export function daysSince(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }

export function seededRandom(seed) { let h = 0xdeadbeef ^ seed; return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

export function genSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join(""); }

export function genToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join(""); }

export async function hashPw(pw, salt) { const d = new TextEncoder().encode(salt + ":" + pw); const buf = await crypto.subtle.digest("SHA-256", d); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""); }

export function hotScore(sub) {
  const cg = sub.crossGroupVotes ? Object.values(sub.crossGroupVotes).filter(v => v.approve).length : 0;
  const ig = sub.votes ? Object.values(sub.votes).filter(v => v.approve).length : 0;
  const s = cg * 3 + ig;
  const order = Math.log10(Math.max(Math.abs(s), 1));
  const sign = s > 0 ? 1 : s < 0 ? -1 : 0;
  const epoch = new Date("2025-01-01").getTime() / 1000;
  const sec = new Date(sub.createdAt).getTime() / 1000 - epoch;
  return sign * order + sec / 45000;
}
