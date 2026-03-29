// ─── Platform Detection & Template Configuration ──────────────────
// Shared between the submit form (client-side) and import service.
// 5 templates, 12+ platform types with platform-specific labels.

export const PLATFORMS = {
  article: {
    key: "article",
    label: "News Article",
    template: "article",
    contentUnit: "Article",
    section1Title: "THE ARTICLE",
    headlineLabel: "ORIGINAL HEADLINE *",
    headlineMultiline: false,
    subtitleLabel: "SUBTITLE (OPTIONAL)",
    authorLabel: "AUTHOR(S) (OPTIONAL)",
    authorPlaceholder: "Type author name and press Enter",
    section2Title: "REWRITE THE HEADLINE",
    replacementLabel: "PROPOSED REPLACEMENT *",
    section3Title: "EDIT THE ARTICLE",
    section3Subtitle: "UP TO 20",
    section3Desc: 'Copy the exact text from the article you want corrected into "Original Text." The system uses exact text matching to locate each passage. Up to 20 edits per article.',
    editOrigLabel: "ORIGINAL TEXT (COPY FROM ARTICLE)",
    editOrigPlaceholder: "Paste the exact text from the article you want to correct",
    editReplLabel: "REPLACEMENT TEXT",
    showInlineEdits: true,
    showSubtitle: true,
    extraFields: null,
    juryGracePeriod: null,
  },
  youtube: {
    key: "youtube",
    label: "YouTube Video",
    template: "video",
    contentUnit: "Video",
    section1Title: "THE VIDEO",
    headlineLabel: "VIDEO TITLE *",
    headlineMultiline: false,
    subtitleLabel: null,
    authorLabel: "CHANNEL",
    authorPlaceholder: "Channel name",
    section2Title: "CORRECT THE TITLE",
    replacementLabel: "PROPOSED REPLACEMENT *",
    section3Title: "CORRECT SPOKEN CLAIMS",
    section3Subtitle: null,
    section3Desc: "Transcribe or describe the claim being made in the video. Include a timestamp so jurors can verify.",
    editOrigLabel: "TRANSCRIPT EXCERPT OR SPOKEN CLAIM",
    editOrigPlaceholder: "What was said or shown in the video",
    editReplLabel: "THE TRUTH",
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "timestamp",
    juryGracePeriod: null,
  },
  twitter: {
    key: "twitter",
    label: "X / Twitter Post",
    template: "shortform",
    contentUnit: "Post",
    section1Title: "THE POST",
    headlineLabel: "ORIGINAL POST TEXT *",
    headlineMultiline: true,
    subtitleLabel: null,
    authorLabel: "ACCOUNT (@HANDLE)",
    authorPlaceholder: "@handle",
    section2Title: "CORRECT THE POST",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: null,
    section3Subtitle: null,
    section3Desc: null,
    editOrigLabel: null,
    editOrigPlaceholder: null,
    editReplLabel: null,
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "threadPosition",
    juryGracePeriod: null,
  },
  substack_article: {
    key: "substack_article",
    label: "Substack Article",
    template: "article",
    contentUnit: "Article",
    section1Title: "THE ARTICLE",
    headlineLabel: "ORIGINAL HEADLINE *",
    headlineMultiline: false,
    subtitleLabel: "SUBTITLE (OPTIONAL)",
    authorLabel: "AUTHOR",
    authorPlaceholder: "Author name",
    section2Title: "REWRITE THE HEADLINE",
    replacementLabel: "PROPOSED REPLACEMENT *",
    section3Title: "EDIT THE ARTICLE",
    section3Subtitle: "UP TO 20",
    section3Desc: 'Copy the exact text from the article you want corrected into "Original Text."',
    editOrigLabel: "ORIGINAL TEXT (COPY FROM ARTICLE)",
    editOrigPlaceholder: "Paste the exact text from the article you want to correct",
    editReplLabel: "REPLACEMENT TEXT",
    showInlineEdits: true,
    showSubtitle: true,
    extraFields: "publication",
    juryGracePeriod: null,
  },
  substack_note: {
    key: "substack_note",
    label: "Substack Note",
    template: "shortform",
    contentUnit: "Note",
    section1Title: "THE NOTE",
    headlineLabel: "ORIGINAL NOTE TEXT *",
    headlineMultiline: true,
    subtitleLabel: null,
    authorLabel: "AUTHOR",
    authorPlaceholder: "Author name",
    section2Title: "CORRECT THE NOTE",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: null,
    section3Subtitle: null,
    section3Desc: null,
    editOrigLabel: null,
    editOrigPlaceholder: null,
    editReplLabel: null,
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "referencedLink",
    juryGracePeriod: null,
  },
  reddit: {
    key: "reddit",
    label: "Reddit Post",
    template: "shortform",
    contentUnit: "Post",
    section1Title: "THE POST",
    headlineLabel: "POST TITLE *",
    headlineMultiline: false,
    subtitleLabel: null,
    authorLabel: "USER (u/)",
    authorPlaceholder: "u/username",
    section2Title: "CORRECT THE TITLE",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: "EDIT THE POST BODY",
    section3Subtitle: "UP TO 20",
    section3Desc: "For text posts with a body, copy the exact text you want corrected.",
    editOrigLabel: "ORIGINAL TEXT (COPY FROM POST)",
    editOrigPlaceholder: "Paste the exact text from the post body",
    editReplLabel: "REPLACEMENT TEXT",
    showInlineEdits: "conditional",
    showSubtitle: false,
    extraFields: "redditType",
    juryGracePeriod: null,
  },
  facebook: {
    key: "facebook",
    label: "Facebook Post",
    template: "shortform",
    contentUnit: "Post",
    section1Title: "THE POST",
    headlineLabel: "ORIGINAL POST TEXT *",
    headlineMultiline: true,
    subtitleLabel: null,
    authorLabel: "ACCOUNT",
    authorPlaceholder: "Account name",
    section2Title: "CORRECT THE POST",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: null,
    section3Subtitle: null,
    section3Desc: null,
    editOrigLabel: null,
    editOrigPlaceholder: null,
    editReplLabel: null,
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "privateWarning",
    juryGracePeriod: null,
  },
  instagram: {
    key: "instagram",
    label: "Instagram Post",
    template: "shortform",
    contentUnit: "Post",
    section1Title: "THE POST",
    headlineLabel: "ORIGINAL CAPTION *",
    headlineMultiline: true,
    subtitleLabel: null,
    authorLabel: "ACCOUNT (@HANDLE)",
    authorPlaceholder: "@handle",
    section2Title: "CORRECT THE CAPTION",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: null,
    section3Subtitle: null,
    section3Desc: null,
    editOrigLabel: null,
    editOrigPlaceholder: null,
    editReplLabel: null,
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: null,
    juryGracePeriod: null,
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok Video",
    template: "video",
    contentUnit: "Video",
    section1Title: "THE VIDEO",
    headlineLabel: "VIDEO DESCRIPTION *",
    headlineMultiline: true,
    subtitleLabel: null,
    authorLabel: "CREATOR (@HANDLE)",
    authorPlaceholder: "@creator",
    section2Title: "CORRECT THE DESCRIPTION",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: "CORRECT SPOKEN / VISUAL CLAIMS",
    section3Subtitle: null,
    section3Desc: "Transcribe or describe the claim being made. TikTok content is primarily audio/visual.",
    editOrigLabel: "SPOKEN OR VISUAL CLAIM",
    editOrigPlaceholder: "What was said or shown in the video",
    editReplLabel: "THE TRUTH",
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "timestamp",
    juryGracePeriod: null,
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn Post",
    template: "shortform",
    contentUnit: "Post",
    section1Title: "THE POST",
    headlineLabel: "ORIGINAL POST TEXT *",
    headlineMultiline: true,
    subtitleLabel: null,
    authorLabel: "AUTHOR",
    authorPlaceholder: "Author name",
    section2Title: "CORRECT THE POST",
    replacementLabel: "CORRECTED VERSION *",
    section3Title: null,
    section3Subtitle: null,
    section3Desc: null,
    editOrigLabel: null,
    editOrigPlaceholder: null,
    editReplLabel: null,
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "titleCompany",
    juryGracePeriod: null,
  },
  podcast: {
    key: "podcast",
    label: "Podcast / Audio",
    template: "audio",
    contentUnit: "Episode",
    section1Title: "THE EPISODE",
    headlineLabel: "EPISODE TITLE *",
    headlineMultiline: false,
    subtitleLabel: null,
    authorLabel: "HOST / SPEAKER",
    authorPlaceholder: "Who made the claim",
    section2Title: "CORRECT THE EPISODE TITLE",
    replacementLabel: "PROPOSED REPLACEMENT *",
    section3Title: "CORRECT SPOKEN CLAIMS",
    section3Subtitle: "TRANSCRIPT REQUIRED",
    section3Desc: "Audio content has no text to match against \u2014 the transcript excerpt IS the evidence. Timestamps and exact words are critical.",
    editOrigLabel: "TRANSCRIPT EXCERPT \u2014 WHAT WAS SAID *",
    editOrigPlaceholder: "Type or paste the exact words spoken in the episode",
    editReplLabel: "THE TRUTH",
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "podcastFields",
    juryGracePeriod: {
      label: "EXTENDED JURY REVIEW",
      days: "14 days",
      reason: "Audio corrections require jurors to listen to the source material. This submission type receives an extended review window to ensure fair and thorough evaluation.",
    },
  },
  product: {
    key: "product",
    label: "Product Listing",
    template: "product",
    contentUnit: "Listing",
    section1Title: "THE PRODUCT",
    headlineLabel: "PRODUCT NAME / TITLE *",
    headlineMultiline: false,
    subtitleLabel: null,
    authorLabel: "BRAND / SELLER",
    authorPlaceholder: "Who sells or manufactures this",
    section2Title: "CORRECT THE LISTING",
    replacementLabel: "CORRECTED CLAIM *",
    section3Title: "FLAG SPECIFIC CLAIMS",
    section3Subtitle: null,
    section3Desc: "Product listings often contain multiple misleading claims. Flag each one separately so jurors can evaluate them independently.",
    editOrigLabel: "EXACT CLAIM FROM LISTING *",
    editOrigPlaceholder: 'e.g. "100% Organic" or "Made in USA" or "Clinically proven"',
    editReplLabel: "THE TRUTH",
    showInlineEdits: false,
    showSubtitle: false,
    extraFields: "productFields",
    juryGracePeriod: null,
  },
};

export const CLAIM_CATEGORIES = [
  "Labeling / Certification",
  "Specifications",
  "Safety",
  "Efficacy",
  "Origin / Sourcing",
  "Environmental",
  "Reviews / Ratings",
  "Other",
];

export const LISTING_LOCATIONS = [
  "Title", "Description", "Bullet points", "Images", "Specs", "Reviews",
];

export function detectPlatform(url) {
  if (!url) return null;
  const u = url.toLowerCase();

  // Video platforms
  if (u.includes("youtube.com/watch") || u.includes("youtu.be/") || u.includes("youtube.com/shorts")) return PLATFORMS.youtube;
  if (u.includes("tiktok.com")) return PLATFORMS.tiktok;
  if (u.includes("vimeo.com") || u.includes("dailymotion.com") || u.includes("rumble.com") || u.includes("bitchute.com")) return PLATFORMS.youtube;

  // Audio / Podcast
  if (u.includes("open.spotify.com/episode") || u.includes("open.spotify.com/show")) return PLATFORMS.podcast;
  if (u.includes("podcasts.apple.com")) return PLATFORMS.podcast;
  if (u.includes("soundcloud.com")) return PLATFORMS.podcast;
  if (u.includes("podbean.com") || u.includes("anchor.fm") || u.includes("overcast.fm")) return PLATFORMS.podcast;
  if (u.includes("castbox.fm") || u.includes("pocketcasts.com") || u.includes("pod.link")) return PLATFORMS.podcast;
  if (u.includes("iheart.com/podcast") || u.includes("stitcher.com")) return PLATFORMS.podcast;
  if (u.includes("music.youtube.com") && u.includes("podcast")) return PLATFORMS.podcast;

  // Social shortform
  if (u.includes("x.com") || u.includes("twitter.com")) return PLATFORMS.twitter;
  if (u.includes("threads.net")) return PLATFORMS.twitter;
  if (u.includes("bsky.app") || u.includes("bsky.social")) return PLATFORMS.twitter;
  if (u.includes("mastodon.") || u.includes("mstdn.")) return PLATFORMS.twitter;
  if (u.includes("truthsocial.com")) return PLATFORMS.twitter;

  // Substack
  if (u.includes("substack.com") && (u.includes("/note") || u.includes("/notes"))) return PLATFORMS.substack_note;
  if (u.includes("substack.com")) return PLATFORMS.substack_article;

  // Other social
  if (u.includes("reddit.com")) return PLATFORMS.reddit;
  if (u.includes("facebook.com") || u.includes("fb.com") || u.includes("fb.watch")) return PLATFORMS.facebook;
  if (u.includes("instagram.com")) return PLATFORMS.instagram;
  if (u.includes("pinterest.com") || u.includes("pin.it")) return PLATFORMS.instagram;
  if (u.includes("linkedin.com")) return PLATFORMS.linkedin;
  if (u.includes("tumblr.com")) return PLATFORMS.twitter;

  // E-commerce
  if (u.includes("amazon.com") || u.includes("amazon.co.")) return PLATFORMS.product;
  if (u.includes("ebay.com")) return PLATFORMS.product;
  if (u.includes("walmart.com") && (u.includes("/ip/") || u.includes("/product/"))) return PLATFORMS.product;
  if (u.includes("target.com") && u.includes("/p/")) return PLATFORMS.product;
  if (u.includes("bestbuy.com") && u.includes("/site/")) return PLATFORMS.product;
  if (u.includes("etsy.com") && u.includes("/listing/")) return PLATFORMS.product;
  if (u.includes("aliexpress.com") && u.includes("/item/")) return PLATFORMS.product;

  // Q&A → reddit model
  if (u.includes("quora.com") || u.includes("stackoverflow.com") || u.includes("stackexchange.com")) return PLATFORMS.reddit;

  // Blog platforms → article
  if (u.includes("medium.com")) return PLATFORMS.substack_article;
  if (u.includes("wordpress.com") || u.includes("ghost.io") || u.includes("blogger.com") || u.includes("blogspot.com")) return PLATFORMS.article;

  // News aggregators → article
  if (u.includes("news.google.com") || u.includes("msn.com") || u.includes("news.yahoo.com")) return PLATFORMS.article;
  if (u.includes("flipboard.com") || u.includes("apple.news")) return PLATFORMS.article;

  // Wikipedia → article
  if (u.includes("wikipedia.org")) return PLATFORMS.article;

  // Default
  if (u.startsWith("http")) return PLATFORMS.article;
  return null;
}
