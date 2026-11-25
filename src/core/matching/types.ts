import type { Cents } from "../money";
import type { ISODate } from "../period";

/** A raw incoming payment, normalised from any source (statement line, C2B callback, IPN). */
export interface IncomingPayment {
  /** payment_events.id once stored; any unique key before that. */
  id: string;
  transCode: string;
  amountCents: Cents;
  /** ISO timestamp. */
  occurredAt: string;
  /** Canonical 2547XXXXXXXX when fully visible. */
  payerPhone?: string | null;
  /** Masked phone as printed, e.g. "2547******678". */
  payerPhoneMasked?: string | null;
  payerName?: string | null;
  accountRef?: string | null;
}

/** One active lease the payment could belong to, with what is owed right now. */
export interface LeaseCandidate {
  leaseId: string;
  tenantId: string;
  tenantName: string;
  unitCode: string;
  buildingId: string;
  rentCents: Cents;
  /** Current outstanding (> 0 owed, ≤ 0 nothing owed / credit). */
  balanceCents: Cents;
  oldestUnpaidDue: ISODate | null;
  /** Tenant's phones on file (canonical). */
  phones: string[];
  /**
   * A past tenant who moved out still owing. Matched by phone or name only:
   * the unit number now belongs to someone else.
   */
  movedOut?: boolean;
}

export type RuleKind = "phone" | "name" | "account_ref";

/** Learned from a landlord's confirmation: this payer → this tenant. */
export interface MatchRule {
  kind: RuleKind;
  /** Canonical phone, normalised name, or normalised account ref. */
  pattern: string;
  tenantId: string;
}

export interface MatchContext {
  leases: LeaseCandidate[];
  rules: MatchRule[];
}

export type Signal =
  | "account_ref"
  | "ref_rule"
  | "ref_phone"
  | "phone"
  | "phone_rule"
  | "phone_mask"
  | "name"
  | "name_rule"
  | "amount";

export interface Reason {
  signal: Signal;
  /** 0..1 evidence strength. */
  strength: number;
  detail: string;
}

export interface Allocation {
  leaseId: string;
  amountCents: Cents;
}

export interface Candidate {
  leaseIds: string[];
  tenantIds: string[];
  /** "B12 · John Kamau" or "B12 + B13 · John Kamau". */
  label: string;
  score: number;
  reasons: Reason[];
}

export type Decision = "auto" | "suggest" | "unmatched";

export interface MatchOutcome {
  decision: Decision;
  /** 0..1, rounded to 2 dp. */
  confidence: number;
  best: Candidate | null;
  /** Top candidates (best first), at most 3. */
  candidates: Candidate[];
  /** How the payment would be split if posted to `best`. Empty when unmatched. */
  allocations: Allocation[];
  /** Plain-English one-liner for the inbox. */
  summary: string;
}
