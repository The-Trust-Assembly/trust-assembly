/**
 * HTML entity encoding for user-generated content.
 * Prevents stored XSS when content is served to the browser extension
 * and rendered in content script overlays.
 *
 * This is an OUTPUT sanitizer — call it when serving data to clients,
 * not when storing. The database stores the original text; the API
 * encodes on output.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const ENTITY_RE = /[&<>"']/g;

/**
 * Encode HTML entities in a string to prevent XSS.
 * Returns the original value if not a string.
 */
export function escapeHtml(str: string): string {
  return str.replace(ENTITY_RE, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize user-generated text fields in an object.
 * Encodes HTML entities in all specified string fields.
 */
export function sanitizeRecord<T extends Record<string, unknown>>(
  record: T,
  fields: (keyof T)[],
): T {
  const result = { ...record };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string") {
      (result as Record<string, unknown>)[field as string] = escapeHtml(value);
    }
  }
  return result;
}

/**
 * Validate that a string does not contain HTML tags.
 * Returns true if the string is safe (no tags found).
 */
export function hasNoHtmlTags(str: string): boolean {
  return !/<[^>]*>/.test(str);
}

/**
 * Validate that a URL is well-formed (http or https only).
 */
export function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
