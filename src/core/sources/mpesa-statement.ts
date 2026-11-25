/**
 * M-Pesa statement parsing.
 *
 * Supported:
 *  - Org portal (paybill / till) statements exported as CSV or Excel. Columns:
 *    Receipt No. | Completion Time | Initiation Time | Details | Transaction Status |
 *    Paid In | Withdrawn | Balance | Balance Confirmed | Reason Type |
 *    Other Party Info | Linked Transaction ID | A/C No.
 *  - Personal M-Pesa statements (PDF from the app / *334#), text-extracted.
 *    Columns: Receipt No. | Completion Time | Details | Transaction Status |
 *    Paid In | Withdrawn | Balance
 *
 * Only completed incoming payments are returned. Withdrawals, charges and
 * failed transactions are reported as skipped so the user can see why.
 */
import { parseCents } from "../money";
import { normalizePhone, parsePhoneMask } from "../phone";
import { parseCsv } from "./csv";
import {
  StatementFormatError,
  type NormalizedPayment,
  type ParseResult,
  type PaymentSourceAdapter,
  type SkippedLine,
} from "./types";

type Cell = string | number | Date | boolean | null | undefined;

const COLS = {
  receipt: [/^receipt(\s*no\.?)?$/, /^transaction\s*id$/, /^trans(action)?\s*code$/, /^mpesa\s*(ref|code|receipt)/],
  completed: [/^completion\s*time$/, /^date$/, /^transaction\s*date$/, /^date\s*&?\s*time$/, /^trans(action)?\s*time$/],
  initiated: [/^initiation\s*time$/],
  details: [/^details$/, /^description$/, /^narration$/, /^transaction\s*details$/],
  status: [/^transaction\s*status$/, /^status$/],
  paidIn: [/^paid\s*in$/, /^credit$/, /^amount\s*in$/, /^money\s*in$/],
  withdrawn: [/^withdrawn$/, /^debit$/, /^paid\s*out$/, /^money\s*out$/],
  amount: [/^amount$/],
  other: [/^other\s*party\s*info$/, /^other\s*party$/, /^sender$/, /^msisdn$/, /^customer$/],
  reason: [/^reason\s*type$/, /^transaction\s*type$/, /^type$/],
  account: [/^a\/?c\s*no\.?$/, /^account(\s*(no\.?|number|ref(erence)?))?$/, /^bill\s*ref(erence)?(\s*number)?$/, /^acc\.?\s*no\.?$/],
} as const;

type ColKey = keyof typeof COLS;

function headerKey(cell: string): ColKey | null {
  const h = cell.trim().toLowerCase().replace(/\s+/g, " ");
  for (const k of Object.keys(COLS) as ColKey[]) if (COLS[k].some((re) => re.test(h))) return k;
  return null;
}

function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return toNairobiIso(c);
  return String(c).trim();
}

/** Date → "2026-11-05T08:15:22+03:00" interpreting the wall-clock as Nairobi time. */
function toNairobiIso(d: Date): string {
  // Spreadsheet libraries hand us wall-clock values as UTC dates.
  const iso = d.toISOString();
  return `${iso.slice(0, 19)}+03:00`;
}

/**
 * Parse statement date strings: "2026-11-05 08:15:22", "05-11-2026 08:15:22",
 * "05/11/2026 8:15 AM", "2026/11/05 08:15", "5 Nov 2026 08:15".
 */
export function parseStatementDate(input: string): string | null {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(s)) return s;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(s);
  let y: number, mo: number, d: number;
  let rest: RegExpExecArray | null = null;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    rest = m;
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(s))) {
    // Kenyan statements are day-first.
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    rest = m;
  } else if ((m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(s))) {
    const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
    if (idx < 0) return null;
    [d, mo, y] = [Number(m[1]), idx + 1, Number(m[3])];
    rest = m;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = Number(rest[4] ?? 0);
  const mm = Number(rest[5] ?? 0);
  const ss = Number(rest[6] ?? 0);
  const ampm = rest[7]?.toUpperCase();
  if (ampm === "PM" && hh < 12) hh += 12;
  if (ampm === "AM" && hh === 12) hh = 0;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(hh)}:${p(mm)}:${p(ss)}+03:00`;
}

const PHONE_TOKEN = /(\+?(?:254|0)[17][\d*xX]{5,10}\d)/;

export interface PayerInfo {
  payerPhone: string | null;
  payerPhoneMasked: string | null;
  payerName: string | null;
  accountRef: string | null;
}

/**
 * Pull payer phone, name and account out of the Details / Other Party Info text:
 *   "Pay Bill from 254712345678 - JOHN KAMAU MWANGI Acc. B12"
 *   "Pay Bill Online from 2547******678 - JOHN KAMAU Acc. B12"
 *   "Merchant Payment from 254722111222 - GRACE WANJIKU"
 *   "Funds received from - 0712***678 JOHN KAMAU"
 *   "254712345678 - JOHN KAMAU MWANGI"
 */
export function parsePayer(details: string, otherParty = "", accountCol = ""): PayerInfo {
  let accountRef: string | null = accountCol.trim() || null;
  let text = details.replace(/\s+/g, " ").trim();
  const acc = /\bAcc(?:ount)?\.?\s*(?:No\.?)?\s*[:.]?\s*(.*)$/i.exec(text);
  if (acc) {
    if (!accountRef) accountRef = acc[1].trim() || null;
    text = text.slice(0, acc.index).trim();
  }
  const source = otherParty.trim() || text.replace(/^.*?\b(?:from|by)\b\s*-?\s*/i, "");
  let payerPhone: string | null = null;
  let payerPhoneMasked: string | null = null;
  let payerName: string | null = null;
  const pm = PHONE_TOKEN.exec(source);
  if (pm) {
    const token = pm[1];
    if (/[*xX]/.test(token)) payerPhoneMasked = parsePhoneMask(token) ? token : null;
    else payerPhone = normalizePhone(token);
    payerName = source.slice(pm.index + token.length).replace(/^[\s-]+/, "").trim() || null;
  } else if (/\b(from|by)\b/i.test(text) || otherParty) {
    payerName = source.replace(/^[\s-]+/, "").trim() || null;
  }
  if (payerName) payerName = payerName.replace(/\s+/g, " ").replace(/[^A-Za-z .'-]/g, "").trim() || null;
  return { payerPhone, payerPhoneMasked, payerName, accountRef };
}

const OUTGOING = /\b(pay bill to|paybill to|merchant payment to|customer transfer to|sent to|withdraw|withdrawal|charge|airtime|buy goods to|business payment to|pay merchant|transfer to|reversal)\b/i;
const INCOMING = /\b(from|received|deposit)\b/i;

/** Parse a table (CSV rows or Excel sheet). */
export function parseStatementTable(rows: Cell[][]): ParseResult {
  // Find the header row within the first 30 rows (org exports have a preamble).
  let headerIdx = -1;
  let cols: Partial<Record<ColKey, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const map: Partial<Record<ColKey, number>> = {};
    rows[i].forEach((c, j) => {
      const k = headerKey(cellText(c));
      if (k && map[k] === undefined) map[k] = j;
    });
    if (map.receipt !== undefined && map.completed !== undefined && (map.paidIn !== undefined || map.amount !== undefined)) {
      headerIdx = i;
      cols = map;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new StatementFormatError(
      "This doesn't look like an M-Pesa statement. We need columns for Receipt No., Completion Time and Paid In.",
    );
  }
  const preamble = rows.slice(0, headerIdx).map((r) => r.map(cellText).join(" ")).join(" ");
  const get = (r: Cell[], k: ColKey) => (cols[k] === undefined ? "" : cellText(r[cols[k]!]));

  const payments: NormalizedPayment[] = [];
  const skipped: SkippedLine[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1;
    const receipt = get(r, "receipt").toUpperCase();
    if (!receipt) continue;
    const text = r.map(cellText).filter(Boolean).join(" | ");
    if (!/^[A-Z0-9]{8,12}$/.test(receipt)) {
      skipped.push({ line, reason: "unreadable", text });
      continue;
    }
    const status = get(r, "status");
    if (status && !/complete/i.test(status)) {
      skipped.push({ line, reason: "not_completed", text });
      continue;
    }
    let amount: number | null;
    try {
      if (cols.paidIn !== undefined) {
        amount = parseCents(get(r, "paidIn"));
        const out = parseCents(get(r, "withdrawn"));
        if ((!amount || amount <= 0) && out) {
          skipped.push({ line, reason: "outgoing", text });
          continue;
        }
      } else {
        amount = parseCents(get(r, "amount"));
      }
    } catch {
      skipped.push({ line, reason: "unreadable", text });
      continue;
    }
    const details = get(r, "details");
    const reason = get(r, "reason");
    if (!amount || amount <= 0) {
      skipped.push({ line, reason: amount && amount < 0 ? "outgoing" : "zero", text });
      continue;
    }
    if (cols.paidIn === undefined && OUTGOING.test(`${details} ${reason}`)) {
      skipped.push({ line, reason: "outgoing", text });
      continue;
    }
    const occurredAt = parseStatementDate(get(r, "completed")) ?? parseStatementDate(get(r, "initiated"));
    if (!occurredAt) {
      skipped.push({ line, reason: "unreadable", text });
      continue;
    }
    const payer = parsePayer(details, get(r, "other"), get(r, "account"));
    payments.push({
      source: "mpesa_statement",
      transCode: receipt,
      amountCents: amount,
      occurredAt,
      ...payer,
      raw: { line, receipt, completed: get(r, "completed"), details, status, reason, other: get(r, "other"), account: get(r, "account"), paidIn: get(r, "paidIn") },
    });
  }

  const format = cols.account !== undefined || /pay\s*bill|organization|organisation|short\s*code/i.test(preamble)
    ? "M-Pesa business statement"
    : "M-Pesa statement";
  return withPeriod({ payments: dedupe(payments), skipped, format, periodStart: null, periodEnd: null });
}

export function parseStatementCsv(text: string): ParseResult {
  return parseStatementTable(parseCsv(text));
}

/**
 * Parse text extracted from an M-Pesa PDF statement. Rows are found by their
 * receipt code + completion time; direction comes from the Details wording
 * (and the minus sign personal statements print on withdrawals).
 */
export function parseStatementPdfText(text: string): ParseResult {
  const flat = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const rowStart = /\b([A-Z0-9]{10})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\b/g;
  const starts: { idx: number; code: string; time: string; end: number }[] = [];
  for (const m of flat.matchAll(rowStart)) {
    if (!/\d/.test(m[1]) || !/[A-Z]/.test(m[1])) continue;
    starts.push({ idx: m.index!, code: m[1], time: m[2], end: m.index! + m[0].length });
  }
  if (!starts.length) {
    throw new StatementFormatError("We couldn't find any M-Pesa transactions in this PDF. Try the CSV or Excel export instead.");
  }
  const payments: NormalizedPayment[] = [];
  const skipped: SkippedLine[] = [];
  starts.forEach((s, i) => {
    const seg = flat.slice(s.end, i + 1 < starts.length ? starts[i + 1].idx : undefined).replace(/\n/g, " ").trim();
    const line = i + 1;
    const statusM = /\b(Completed|Failed|Cancelled|Pending)\b/i.exec(seg);
    if (statusM && !/completed/i.test(statusM[1])) {
      skipped.push({ line, reason: "not_completed", text: `${s.code} ${seg}` });
      return;
    }
    const details = (statusM ? seg.slice(0, statusM.index) : seg.replace(/-?[\d,]+\.\d{2}.*$/, "")).trim();
    const after = statusM ? seg.slice(statusM.index + statusM[0].length) : seg.slice(details.length);
    const amounts = [...after.matchAll(/(-?[\d,]+\.\d{2})/g)].map((m) => m[1]);
    if (!amounts.length) {
      skipped.push({ line, reason: "unreadable", text: `${s.code} ${seg}` });
      return;
    }
    const first = parseCents(amounts[0])!;
    if (first < 0 || OUTGOING.test(details) || !INCOMING.test(details)) {
      skipped.push({ line, reason: "outgoing", text: `${s.code} ${seg}` });
      return;
    }
    const payer = parsePayer(details);
    payments.push({
      source: "mpesa_statement",
      transCode: s.code,
      amountCents: first,
      occurredAt: parseStatementDate(s.time)!,
      ...payer,
      raw: { line, receipt: s.code, completed: s.time, details, amounts },
    });
  });
  return withPeriod({ payments: dedupe(payments), skipped, format: "M-Pesa statement (PDF)", periodStart: null, periodEnd: null });
}

function dedupe(payments: NormalizedPayment[]): NormalizedPayment[] {
  const seen = new Set<string>();
  return payments.filter((p) => (seen.has(p.transCode) ? false : (seen.add(p.transCode), true)));
}

function withPeriod(r: ParseResult): ParseResult {
  const dates = r.payments.map((p) => p.occurredAt.slice(0, 10)).sort();
  return { ...r, periodStart: dates[0] ?? null, periodEnd: dates[dates.length - 1] ?? null };
}

/** Adapter for CSV/Excel rows; PDF goes through `parseStatementPdfText`. */
export const mpesaStatementAdapter: PaymentSourceAdapter<Cell[][]> = {
  source: "mpesa_statement",
  parse: parseStatementTable,
};
