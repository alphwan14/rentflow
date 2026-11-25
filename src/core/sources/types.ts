/**
 * Every payment source — statement upload, Daraja C2B callback, KCB Buni IPN —
 * implements PaymentSourceAdapter and yields NormalizedPayment records. They
 * all go through the same pipeline: store once in payment_events (unique by
 * transaction code) → match → post / inbox.
 */
import type { Cents } from "../money";

export type PaymentSource = "mpesa_statement" | "daraja_c2b" | "kcb_buni" | "cash" | "manual";

export interface NormalizedPayment {
  source: PaymentSource;
  /** M-Pesa receipt / bank reference. Uppercased, unique per org. */
  transCode: string;
  amountCents: Cents;
  /** ISO 8601 with Nairobi offset, e.g. 2026-11-05T08:15:22+03:00. */
  occurredAt: string;
  payerPhone: string | null;
  payerPhoneMasked: string | null;
  payerName: string | null;
  accountRef: string | null;
  /** The original line / payload, kept verbatim for audit. */
  raw: Record<string, unknown>;
}

export interface SkippedLine {
  line: number;
  reason: "outgoing" | "not_completed" | "unreadable" | "zero";
  text: string;
}

export interface ParseResult {
  payments: NormalizedPayment[];
  skipped: SkippedLine[];
  /** Detected statement format, for display ("M-Pesa paybill statement"). */
  format: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface PaymentSourceAdapter<Input> {
  readonly source: PaymentSource;
  parse(input: Input): ParseResult;
}

export class StatementFormatError extends Error {}
