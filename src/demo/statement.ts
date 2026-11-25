/**
 * Sample M-Pesa business statement (CSV, org-portal format) for the demo
 * building, for the current month up to today. Uploading it shows the
 * pipeline end to end: payments already seeded are recognised as "already
 * seen", the new ones are matched or land in "Who paid this?".
 */
import { addMonths, periodOf, todayNairobi } from "../core/period";
import { DEMO, paymentsFor, trickyPayments, type DemoPayment } from "./data";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ddmmyyyy(period: string, day: number): string {
  return `${String(day).padStart(2, "0")}-${period.slice(5, 7)}-${period.slice(0, 4)}`;
}

const csv = (cells: string[]) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");

export function demoStatementCsv(today = todayNairobi()): { filename: string; body: string } {
  const period = periodOf(today);
  const maxDay = Number(today.slice(8, 10));
  const lines: (DemoPayment & { kind: "in" })[] = [...paymentsFor(0, maxDay), ...trickyPayments(maxDay)]
    .filter((p) => p.day <= maxDay)
    .map((p) => ({ ...p, kind: "in" as const }));
  lines.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

  const rows: string[] = [
    csv(["Organization Name:", DEMO.orgName.replace(" (demo)", "").toUpperCase()]),
    csv(["Short Code:", DEMO.paybill]),
    csv(["Time Period:", `${ddmmyyyy(period, 1)} to ${ddmmyyyy(period, maxDay)}`]),
    csv(["Receipt No.", "Completion Time", "Initiation Time", "Details", "Transaction Status", "Paid In", "Withdrawn", "Balance", "Balance Confirmed", "Reason Type", "Other Party Info", "Linked Transaction ID", "A/C No."]),
  ];
  let balance = 0;
  for (const p of lines) {
    balance += p.amountCents;
    const when = `${ddmmyyyy(period, p.day)} ${p.time}`;
    const party = p.phone ? `${p.phone} - ${p.name}` : p.name;
    rows.push(csv([p.code, when, when, `Pay Bill from ${party} Acc. ${p.ref}`, "Completed", money(p.amountCents), "", money(balance), "true", "Pay Bill Online", party, "", p.ref]));
  }
  // Lines that must be skipped: a charge and a withdrawal to the landlord's bank.
  const last = ddmmyyyy(period, maxDay);
  balance -= 66_00;
  rows.push(csv(["TKZ9CHRG01", `${last} 23:10:00`, `${last} 23:10:00`, "Business Charge", "Completed", "", "66.00", money(balance), "true", "Pay Bill Charge", "", "", ""]));
  const out = Math.floor(balance / 2 / 100_000_00) * 100_000_00;
  if (out > 0) {
    balance -= out;
    rows.push(csv(["TKZ9WDRL02", `${last} 23:30:00`, `${last} 23:30:00`, "Withdrawal to bank account", "Completed", "", money(out), money(balance), "true", "Organization Withdrawal", "KCB BANK", "", ""]));
  }
  return { filename: `mpesa-statement-${addMonths(period, 0).slice(0, 7)}.csv`, body: rows.join("\r\n") + "\r\n" };
}
