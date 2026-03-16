// Shared input validation constants and helpers for API routes.

// Max lengths for user-supplied text fields (in characters)
export const MAX_LENGTHS = {
  headline: 500,
  replacement: 500,
  reasoning: 5000,
  author: 200,
  evidence_url: 2048,
  evidence_explanation: 2000,
  inline_edit_text: 5000,
  vote_note: 2000,
  org_name: 100,
  org_description: 2000,
  org_charter: 10000,
  vault_assertion: 5000,
  vault_evidence: 5000,
  vault_content: 5000,       // arguments, beliefs
  translation_text: 10000,
  application_reason: 2000,
  application_link: 2048,
  badge_detail: 500,
  feedback_message: 1000,
} as const;

/**
 * Validate that a string field does not exceed the max length.
 * Returns an error message if invalid, or null if valid.
 */
export function validateLength(
  fieldName: string,
  value: unknown,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return `${fieldName} must be a string`;
  if (value.length > maxLength) {
    return `${fieldName} must be ${maxLength} characters or fewer`;
  }
  return null;
}

/**
 * Validate multiple fields at once. Returns the first error found, or null.
 */
export function validateFields(
  checks: Array<[string, unknown, number]>,
): string | null {
  for (const [name, value, max] of checks) {
    const error = validateLength(name, value, max);
    if (error) return error;
  }
  return null;
}
