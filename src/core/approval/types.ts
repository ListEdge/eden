/**
 * Eden — Approval types.
 *
 * Level 3 work requires an explicit, per-package approval (Core Contract §3,
 * Rule 1). An approval is bound to the package's scope fingerprint: if the
 * package changes, the fingerprint changes and the approval is void
 * (Contract Rule 11, Build Spec R3). Authority is explicit — who may approve
 * what is governed by policy, not assumed (Build Spec R8).
 */

/**
 * A minted approval. The opaque `token` is transport-only and MUST NOT be
 * persisted to Memory (Memory System §4.5); Memory records that approval was
 * granted, by whom, and the fingerprint it was bound to.
 */
export interface ApprovalToken {
  token: string;
  work_package_id: string;
  /** Fingerprint the approval is bound to (Build Spec R3). */
  scope_fingerprint: string;
  granted_by: string;
  granted_at: string;
  expires_at: string;
}

/** A request for human approval surfaced at Gate B for a Level 3 package. */
export interface ApprovalRequest {
  work_package_id: string;
  scope_fingerprint: string;
  /** Human-facing summary of exactly what is being authorised. */
  summary: string;
  /** Actions that cannot be undone, called out for explicit acknowledgement. */
  irreversible_actions: string[];
}

/** The recorded decision on an approval request. */
export interface ApprovalDecision {
  work_package_id: string;
  decision: 'approved' | 'rejected';
  principal_id: string;
  decided_at: string;
}
