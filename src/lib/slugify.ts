/**
 * Generate a URL-safe slug from a text string.
 *
 * - Strips non-alphanumeric characters (except spaces and hyphens)
 * - Converts to lowercase
 * - Collapses whitespace/hyphens to single hyphens
 * - Trims leading/trailing hyphens
 * - Truncates to maxLen characters (default 80)
 * - Appends a short ID suffix for uniqueness (first 8 chars of UUID)
 */
export function slugify(text: string, id: string, maxLen = 80): string {
  const base = text
    .replace(/[^a-zA-Z0-9\s-]/g, "")   // strip special chars
    .replace(/\s+/g, "-")               // spaces → hyphens
    .replace(/-+/g, "-")                // collapse multiple hyphens
    .replace(/^-|-$/g, "")              // trim leading/trailing hyphens
    .toLowerCase()
    .slice(0, maxLen);

  const idSuffix = id.replace(/-/g, "").slice(0, 8);
  return base ? `${base}-${idSuffix}` : idSuffix;
}

/**
 * Generate a slug for an organization (no ID suffix — org names are unique).
 */
export function slugifyOrg(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120);
}
