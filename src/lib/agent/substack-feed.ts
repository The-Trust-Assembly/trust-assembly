// Trust Assembly Agent — Substack feed parser
// -----------------------------------------------
// Fetches and parses a Substack RSS feed (standard RSS 2.0) to discover
// new posts for the Phantom agent type. Substack feeds live at
// {author}.substack.com/feed (redirects to /feed.xml).
//
// Returns an array of FeedPost objects, newest first. The caller
// (PhantomDashboard or the process route) decides which posts to
// analyze — this module just discovers them.

import { XMLParser } from "fast-xml-parser";

const FEED_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TrustAssemblyAgent/1.0; +https://trustassembly.org)";

export interface FeedPost {
  url: string;
  title: string;
  author: string;
  published: string; // ISO date string
  summary: string; // First ~500 chars of content or description
  guid: string; // Unique post identifier (usually the URL)
}

export interface FeedResult {
  feedTitle: string;
  feedDescription: string;
  posts: FeedPost[];
  fetchedAt: string; // ISO timestamp
}

// Normalize a Substack URL to its feed URL.
// Accepts: "greenwald.substack.com", "https://greenwald.substack.com",
// "https://greenwald.substack.com/feed", etc.
export function toFeedUrl(substackUrl: string): string {
  let url = substackUrl.trim();

  // Add protocol if missing
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    const parsed = new URL(url);
    // Strip any path and append /feed
    return `${parsed.protocol}//${parsed.host}/feed`;
  } catch {
    // If URL parsing fails, try basic string manipulation
    return url.replace(/\/+$/, "") + "/feed";
  }
}

// Strip HTML tags from a string (for cleaning RSS content/description)
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch and parse a Substack RSS feed.
export async function fetchSubstackFeed(substackUrl: string): Promise<FeedResult> {
  const feedUrl = toFeedUrl(substackUrl);

  const response = await fetch(feedUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status} ${response.statusText} for ${feedUrl}`);
  }

  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name: string) => name === "item",
  });

  const parsed = parser.parse(xml);

  // RSS 2.0 structure: rss > channel > item[]
  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error(`Invalid RSS feed structure from ${feedUrl} — no rss.channel found`);
  }

  const items: unknown[] = channel.item || [];

  const posts: FeedPost[] = items.map((item: any) => {
    const rawContent = item["content:encoded"] || item.description || "";
    const plainText = stripHtml(typeof rawContent === "string" ? rawContent : "");

    return {
      url: typeof item.link === "string" ? item.link.trim() : "",
      title: typeof item.title === "string" ? item.title.trim() : "Untitled",
      author:
        typeof item["dc:creator"] === "string"
          ? item["dc:creator"].trim()
          : typeof item.author === "string"
          ? item.author.trim()
          : "",
      published: typeof item.pubDate === "string" ? new Date(item.pubDate).toISOString() : "",
      summary: plainText.length > 500 ? plainText.substring(0, 500) + "..." : plainText,
      guid:
        typeof item.guid === "string"
          ? item.guid
          : typeof item.guid === "object" && item.guid?.["#text"]
          ? item.guid["#text"]
          : typeof item.link === "string"
          ? item.link
          : "",
    };
  });

  // Filter out posts with no URL
  const validPosts = posts.filter((p) => p.url);

  // Sort newest first (RSS usually is, but ensure it)
  validPosts.sort((a, b) => {
    if (!a.published || !b.published) return 0;
    return new Date(b.published).getTime() - new Date(a.published).getTime();
  });

  return {
    feedTitle: typeof channel.title === "string" ? channel.title : "",
    feedDescription: typeof channel.description === "string" ? stripHtml(channel.description) : "",
    posts: validPosts,
    fetchedAt: new Date().toISOString(),
  };
}
