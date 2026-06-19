/**
 * Receipt formatting — separated from business logic so the same snapshot can
 * later drive other outputs (e.g. ESC/POS thermal printers). This module is
 * pure and has no Nest/DB dependencies.
 *
 * The SMS body is also rendered server-side in record_payment (SQL) at payment
 * time and stored as the frozen snapshot; this TS formatter mirrors that format
 * for resends/previews and keeps the wording in one reviewable place.
 */

export interface ReceiptSnapshot {
  receipt_no: string;
  tenant_name: string;
  unit: string | null;
  amount_cents: number;
  method: string;
  paid_at: string; // ISO
  balance_cents: number;
  arrears_cents: number;
  credit_cents: number;
  covered_until: string | null; // already-formatted "August 2026" or null
}

/** Whole-shilling KES formatting with thousands separators (no decimals). */
export function formatKes(cents: number): string {
  const whole = Math.round(cents / 100);
  return `KES ${whole.toLocaleString("en-KE")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Render the SMS receipt body. Intentionally ASCII-only and compact to stay in
 * GSM-7 and minimise segments.
 */
export function formatReceiptSms(s: ReceiptSnapshot, orgName?: string): string {
  const lines: string[] = [];
  lines.push("RENTFLOW RECEIPT");
  if (orgName) lines.push(orgName);
  lines.push("");
  lines.push(`Payment received: ${formatKes(s.amount_cents)}`);
  if (s.unit) lines.push(`Room: ${s.unit}`);
  lines.push(`Tenant: ${s.tenant_name}`);
  lines.push(`Receipt No: ${s.receipt_no}`);
  lines.push(`Date: ${formatDate(s.paid_at)}`);
  lines.push(`Balance: ${formatKes(s.arrears_cents)}`);
  if (s.covered_until) lines.push(`Covered Until: ${s.covered_until}`);
  lines.push("");
  lines.push("Thank you.");
  return lines.join("\n");
}

// --- GSM-7 segmentation -----------------------------------------------------

// GSM 03.38 basic character set.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Extended set — each of these costs 2 GSM-7 characters (escape + char).
const GSM_EXTENDED = "^{}\\[~]|€";

const basicSet = new Set(GSM_BASIC.split(""));
const extendedSet = new Set(GSM_EXTENDED.split(""));

export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!basicSet.has(ch) && !extendedSet.has(ch)) return false;
  }
  return true;
}

/** Effective GSM-7 length, counting extended chars as 2. */
export function gsm7Length(text: string): number {
  let len = 0;
  for (const ch of text) len += extendedSet.has(ch) ? 2 : 1;
  return len;
}

/** Number of SMS segments this text will occupy. */
export function smsSegments(text: string): number {
  if (isGsm7(text)) {
    const len = gsm7Length(text);
    if (len <= 160) return 1;
    return Math.ceil(len / 153);
  }
  // UCS-2 (any non-GSM char present): counted in UTF-16 code units.
  const len = text.length;
  if (len <= 70) return 1;
  return Math.ceil(len / 67);
}
