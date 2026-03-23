// Centralized submission state machine.
// All valid status transitions are defined here — API routes call
// assertTransition() before any UPDATE to prevent invalid transitions.

// Standard jury-driven transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  di_pending:     ["pending_jury", "pending_review"],    // DI partner approves
  pending_jury:   ["pending_review"],                     // org reaches member threshold
  pending_review: ["approved", "rejected"],               // jury vote resolves
  approved:       ["cross_review"],                       // auto-promotion to cross-group
  cross_review:   ["consensus", "consensus_rejected"],    // cross-group vote resolves
  // Terminal: rejected, consensus, consensus_rejected — no outbound transitions
};

// Admin can force-approve from any pending state
const ADMIN_TRANSITIONS: Record<string, string[]> = {
  pending_jury:   ["approved"],
  pending_review: ["approved"],
  di_pending:     ["approved"],
  cross_review:   ["consensus", "approved"],
};

// Trusted auto-approve (10+ streak, non-DI) skips jury
const TRUSTED_TRANSITIONS: Record<string, string[]> = {
  pending_jury:   ["approved"],
  pending_review: ["approved"],
};

export function canTransition(
  from: string,
  to: string,
  opts?: { admin?: boolean; trusted?: boolean },
): boolean {
  if (opts?.admin && ADMIN_TRANSITIONS[from]?.includes(to)) return true;
  if (opts?.trusted && TRUSTED_TRANSITIONS[from]?.includes(to)) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: string,
  to: string,
  opts?: { admin?: boolean; trusted?: boolean },
): void {
  if (!canTransition(from, to, opts)) {
    throw new Error(`Invalid submission transition: ${from} → ${to}`);
  }
}
