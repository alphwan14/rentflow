export type SmsStatus =
  | "pending"
  | "sending"
  | "sent" // accepted by AT API
  | "retrying"
  | "delivered" // confirmed on handset via delivery report
  | "failed";

/** Mirrors the sms_messages table (operational columns included). */
export interface SmsRow {
  id: string;
  org_id: string;
  tenant_id: string;
  payment_id: string | null;
  to_phone: string;
  body: string;
  status: SmsStatus;
  provider: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  locked_at: string | null;
  provider_message_id: string | null;
  provider_response: unknown;
  sent_at: string | null;
  delivered_at: string | null;
  delivery_report: unknown;
  created_at: string;
}
