import type { Tone } from "@/lib/ledger/present";
import type { SmsStatus } from "@/lib/supabase/types";

/**
 * Presentation for an SMS row's lifecycle. Maps the operational
 * sms_messages.status (driven by record_payment enqueue + the worker + the AT
 * delivery report) onto a badge and a position on the happy-path timeline:
 *
 *   Queued → Sending → Sent → Delivered          (failed = off-track, terminal)
 *
 * 'retrying' shows as "Sending" (the worker will try again); 'sent' means AT
 * accepted it; 'delivered' is the handset-confirmed delivery report.
 */
export interface SmsStatusView {
  label: string;
  detail: string;
  tone: Tone;
  /** Index into SMS_STEPS for the furthest-reached step; -1 when failed. */
  stepIndex: number;
  failed: boolean;
}

/** The ordered happy-path stages shown in the timeline. */
export const SMS_STEPS = [
  { key: "queued", label: "Queued" },
  { key: "sending", label: "Sending" },
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
] as const;

export function presentSmsStatus(status: SmsStatus): SmsStatusView {
  switch (status) {
    case "pending":
      return { label: "Queued", detail: "Waiting for the sender", tone: "neutral", stepIndex: 0, failed: false };
    case "sending":
      return { label: "Sending", detail: "Handing off to Africa's Talking", tone: "info", stepIndex: 1, failed: false };
    case "retrying":
      return { label: "Retrying", detail: "Temporary issue — will retry", tone: "warn", stepIndex: 1, failed: false };
    case "sent":
      return { label: "Sent", detail: "Accepted by Africa's Talking", tone: "info", stepIndex: 2, failed: false };
    case "delivered":
      return { label: "Delivered", detail: "Confirmed on the handset", tone: "good", stepIndex: 3, failed: false };
    case "failed":
      return { label: "Failed", detail: "Not delivered", tone: "bad", stepIndex: -1, failed: true };
    default:
      return { label: status, detail: "", tone: "neutral", stepIndex: 0, failed: false };
  }
}
