/**
 * SMS wording. Plain English as Kenyans use it, short enough for one or two
 * SMS. Sending is done by the worker (phase 4); these build the text.
 */
import { formatKES, type Cents } from "./money";
import { formatDate, type ISODate } from "./period";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function firstName(fullName: string): string {
  const w = fullName.trim().split(/\s+/)[0] ?? "";
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "there";
}

export function monthName(period: ISODate): string {
  return MONTHS[Number(period.slice(5, 7)) - 1];
}

export interface PayTo {
  kind: "paybill" | "till" | "bank";
  number: string;
  bankName?: string | null;
}

/** "Pay to Paybill 4012345, account B12." */
export function payToLine(payTo: PayTo | null, unitCode: string): string {
  if (!payTo) return "Pay your landlord as usual.";
  if (payTo.kind === "paybill") return `Pay to Paybill ${payTo.number}, account ${unitCode}.`;
  if (payTo.kind === "till") return `Pay to Till ${payTo.number}.`;
  return `Pay to ${payTo.bankName || "bank"} account ${payTo.number}, reference ${unitCode}.`;
}

/**
 * Receipt after a payment is matched or recorded:
 * "RentFlow: Received KES 15,000 from Jane for B12, Sunrise Apartments. March rent is fully paid. Thank you."
 */
export function receiptSms(p: {
  tenantName: string;
  amountCents: Cents;
  unitCode: string;
  buildingName: string;
  period: ISODate;
  /** Balance after this payment: > 0 still owed, < 0 paid ahead. */
  balanceAfterCents: Cents;
}): string {
  const head = `RentFlow: Received ${formatKES(p.amountCents)} from ${firstName(p.tenantName)} for ${p.unitCode}, ${p.buildingName}.`;
  let status: string;
  if (p.balanceAfterCents > 0) status = `${formatKES(p.balanceAfterCents)} is still unpaid.`;
  else if (p.balanceAfterCents < 0) status = `${monthName(p.period)} rent is fully paid and you are ${formatKES(-p.balanceAfterCents)} ahead.`;
  else status = `${monthName(p.period)} rent is fully paid.`;
  return `${head} ${status} Thank you.`;
}

/**
 * Reminder:
 *  before / on the due date: "Hi Jane, March rent of KES 15,000 for B12 is due on 5 Mar. Pay to Paybill 123456, account B12."
 *  after the due date:       "Hi Jane, you owe KES 27,000 for B12. March rent was due on 5 Mar. Pay to Paybill 123456, account B12."
 */
export function reminderSms(p: {
  tenantName: string;
  unitCode: string;
  period: ISODate;
  dueDate: ISODate;
  today: ISODate;
  rentCents: Cents;
  owedCents: Cents;
  payTo: PayTo | null;
}): string {
  const name = firstName(p.tenantName);
  const due = shortDate(p.dueDate);
  const pay = payToLine(p.payTo, p.unitCode);
  if (p.today <= p.dueDate && p.owedCents <= p.rentCents) {
    return `Hi ${name}, ${monthName(p.period)} rent of ${formatKES(p.owedCents)} for ${p.unitCode} is due on ${due}. ${pay}`;
  }
  return `Hi ${name}, you owe ${formatKES(p.owedCents)} for ${p.unitCode}. ${monthName(p.period)} rent was due on ${due}. ${pay}`;
}

/** "5 Mar" */
function shortDate(d: ISODate): string {
  return formatDate(d).split(" ").slice(0, 2).join(" ");
}

/** Text to share an invite link on WhatsApp / SMS. */
export function inviteMessage(p: { orgName: string; role: string; link: string }): string {
  return `You've been invited to help manage rent for ${p.orgName} on RentFlow as ${p.role}. Open this link to join: ${p.link}`;
}
