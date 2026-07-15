import type { Tone } from "@/lib/ledger/present";
import type { SmsStatus } from "@/lib/supabase/types";

/**
 * BUSINESS-facing presentation of the SMS lifecycle. Landlords never see
 * implementation terms (provider names, callbacks, workers) — only meaningful
 * states:
 *
 *   Preparing SMS → Sending SMS → SMS Sent (awaiting confirmation) → Delivered
 *                                       ↘ Delivery Failed (terminal)
 *
 * The underlying sms_messages.status machine is UNCHANGED — this maps it:
 *   pending   → Preparing SMS
 *   sending   → Sending SMS
 *   retrying  → Sending SMS (retrying automatically)
 *   sent      → SMS Sent — accepted by the SMS gateway, delivery not yet
 *               confirmed by the recipient's mobile network
 *   delivered → Delivered (network-confirmed on the handset)
 *   failed    → Delivery Failed (+ human guidance from classifySmsFailure)
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
  { key: "preparing", label: "Preparing" },
  { key: "sending", label: "Sending" },
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
] as const;

export function presentSmsStatus(status: SmsStatus): SmsStatusView {
  switch (status) {
    case "pending":
      return { label: "Preparing SMS", detail: "Receipt ready — entering the sending queue", tone: "neutral", stepIndex: 0, failed: false };
    case "sending":
      return { label: "Sending SMS", detail: "The system is sending the SMS", tone: "info", stepIndex: 1, failed: false };
    case "retrying":
      return { label: "Sending SMS", detail: "Retrying automatically", tone: "warn", stepIndex: 1, failed: false };
    case "sent":
      return { label: "SMS Sent", detail: "Awaiting delivery confirmation from the mobile network", tone: "info", stepIndex: 2, failed: false };
    case "delivered":
      return { label: "Delivered", detail: "Confirmed by the recipient's mobile network", tone: "good", stepIndex: 3, failed: false };
    case "failed":
      return { label: "Delivery Failed", detail: "The SMS could not be delivered", tone: "bad", stepIndex: -1, failed: true };
    default:
      return { label: status, detail: "", tone: "neutral", stepIndex: 0, failed: false };
  }
}

/**
 * Translate a raw provider/delivery error into a business-facing reason and a
 * suggested resolution. Raw text stays available in Developer Details only.
 */
export function classifySmsFailure(error: string | null | undefined): {
  reason: string;
  suggestion: string;
} {
  const e = (error ?? "").toLowerCase();

  if (e.includes("blacklist")) {
    return {
      reason: "The number has blocked SMS from this sender",
      suggestion:
        "The tenant previously opted out of SMS from the shared sender. Ask them to opt back in, or activate a dedicated sender ID for RentFlow.",
    };
  }
  if (e.includes("invalidphonenumber") || e.includes("invalid phone")) {
    return {
      reason: "The phone number is not valid",
      suggestion: "Verify the tenant's phone number and correct it on the tenant profile.",
    };
  }
  if (e.includes("insufficientbalance") || e.includes("insufficient")) {
    return {
      reason: "The SMS account has run out of credit",
      suggestion: "Top up the SMS account balance, then the message can be resent.",
    };
  }
  if (e.includes("expired")) {
    return {
      reason: "The message expired before the network could deliver it",
      suggestion: "The tenant's phone may have been off for an extended period. Verify the number and try again later.",
    };
  }
  if (e.includes("rejected") || e.includes("absent subscriber") || e.includes("absentsubscriber")) {
    return {
      reason: "The mobile network rejected the message",
      suggestion: "Verify the tenant's phone number is active and can receive SMS.",
    };
  }
  if (e.includes("canceled: tenant deleted")) {
    return {
      reason: "Canceled — the tenant was deleted before sending",
      suggestion: "No action needed.",
    };
  }
  return {
    reason: "A temporary network issue prevented delivery",
    suggestion: "The system retries automatically. If this persists, verify the tenant's phone number.",
  };
}

/**
 * Aging classification for 'sent' rows: acceptance happened, but the network
 * has not confirmed delivery. Most confirmations arrive within minutes; after
 * an hour it is worth surfacing that confirmation is overdue (phone off,
 * network delay, or delivery reporting not reaching the system).
 */
export function confirmationOverdue(sentAt: string | null | undefined, now: Date): boolean {
  if (!sentAt) return false;
  return now.getTime() - new Date(sentAt).getTime() > 60 * 60 * 1000;
}
