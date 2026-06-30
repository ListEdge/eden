/**
 * Eden — Approval Service.
 *
 * Mediates Level 3 authorisation (Build Spec §6.2). `grant` checks the
 * principal's policy (Build Spec R8) and binds the minted token to the current
 * scope fingerprint; `verify` confirms a token is valid, unexpired, unrevoked,
 * and still fingerprint-matched at the moment of execution (Build Spec R3).
 *
 * Milestone 1 ships the interface and a loud stub. The real service is Phase 3.
 */

import { NotImplementedError } from '@/lib/errors';
import type { ApprovalToken } from '@/core/approval/types';

export * from '@/core/approval/types';

export interface ApprovalService {
  /** Surface a Level 3 package for human approval (Gate B halt). */
  requestApproval(wpId: string): Promise<void>;
  /** Grant approval; checks policy + fingerprint, mints a scoped token. */
  grant(wpId: string, principalId: string): Promise<ApprovalToken>;
  /** Verify the package's approval is currently valid and scope-matched. */
  verify(wpId: string): Promise<boolean>;
}

/** Placeholder Approval Service for Milestone 1. */
export const approvalService: ApprovalService = {
  requestApproval() {
    throw new NotImplementedError('ApprovalService.requestApproval', 'Approval milestone (Phase 3)');
  },
  grant() {
    throw new NotImplementedError('ApprovalService.grant', 'Approval milestone (Phase 3)');
  },
  verify() {
    throw new NotImplementedError('ApprovalService.verify', 'Approval milestone (Phase 3)');
  },
};
