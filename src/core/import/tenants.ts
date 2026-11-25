/**
 * Tenant import from Excel, a pasted list or (later) a notebook photo.
 *
 * Caretaker lists are messy. Columns are guessed from headers when present,
 * otherwise from the content of each cell (phones look like phones, unit codes
 * look like unit codes, names are words). Every row comes back with errors and
 * warnings so the agent can fix it on the preview screen before saving.
 */
import { canonCode } from "../matching/account-ref";
import { parseCents } from "../money";
import { extractPhones, normalizePhone } from "../phone";
import { isISODate } from "../period";
import { parseStatementDate } from "../sources/mpesa-statement";

export type Field = "unit" | "name" | "phone" | "idNumber" | "rent" | "deposit" | "balance" | "startDate" | "ignore";

export interface TenantRow {
  /** 1-based source line for messages. */
  line: number;
  unitCode: string;
  name: string;
  phones: string[];
  idNumber: string | null;
  rentCents: number | null;
  depositCents: number | null;
  /** Arrears before tracking starts ("balance brought forward"). Negative = credit. */
  openingBalanceCents: number | null;
  startDate: string | null;
  errors: string[];
  warnings: string[];
}

const HEADER_HINTS: [Field, RegExp][] = [
  ["unit", /^(unit|house|hse|door|room|rm|apt|flat|unit\s*(no|code|number)|house\s*(no|number)|hse\s*no)\.?$/i],
  ["name", /^(name|tenant|tenant\s*name|full\s*name|occupant|names)$/i],
  ["phone", /^(phone|tel|telephone|mobile|contact|phone\s*(no|number)|mpesa|mobile\s*no|contacts?|phone\s*\d)\.?$/i],
  ["idNumber", /^(id|id\s*(no|number)|national\s*id|nid)\.?$/i],
  ["rent", /^(rent|monthly\s*rent|rent\s*amount|amount)$/i],
  ["deposit", /^(deposit|dep)$/i],
  ["balance", /^(balance|bal|arrears|b\/?f|bal\s*b\/?f|balance\s*b\/?f|owed|outstanding|debt)$/i],
  ["startDate", /^(start|start\s*date|move\s*in|moved\s*in|date\s*in|entry\s*date|since)$/i],
];

function headerField(cell: string): Field | null {
  const c = cell.trim().replace(/[:#]/g, "").replace(/\s+/g, " ");
  for (const [f, re] of HEADER_HINTS) if (re.test(c)) return f;
  return null;
}

const UNIT_RE = /^[A-Z]{0,3}\s?-?\d{1,4}[A-Z]?$|^\d{1,3}[A-Z]$/i;

/** Split pasted text into rows of cells: tabs, commas, pipes or runs of 2+ spaces. */
export function splitPasted(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const delim = lines.some((l) => l.includes("\t")) ? /\t/ : lines.some((l) => l.includes("|")) ? /\|/ : lines.every((l) => l.includes(",")) ? /,/ : null;
  return lines.map((l) => {
    if (delim) return l.split(delim).map((c) => c.trim());
    if (/\s{2,}/.test(l.trim())) return l.trim().split(/\s{2,}/);
    return smartSplit(l.trim());
  });
}

/** "B12 John Kamau 0712345678 15000" → ["B12","John Kamau","0712345678","15000"]. */
function smartSplit(line: string): string[] {
  const tokens = line.split(/\s+/);
  const cells: string[] = [];
  let words: string[] = [];
  const flush = () => {
    if (words.length) cells.push(words.join(" "));
    words = [];
  };
  tokens.forEach((t, i) => {
    if (/^[A-Za-z][A-Za-z'.-]*$/.test(t) && !(i === 0 && UNIT_RE.test(t))) words.push(t);
    else {
      flush();
      cells.push(t);
    }
  });
  flush();
  // Rejoin split phone numbers: "0712 345 678".
  const joined: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    const three = cells.slice(i, i + 3).join("");
    if (/^0[17]\d{2}$/.test(cells[i]) && normalizePhone(three)) {
      joined.push(three);
      i += 2;
    } else joined.push(cells[i]);
  }
  return joined;
}

function guessByContent(cell: string): Field | null {
  const c = cell.trim();
  if (!c) return null;
  if (extractPhones(c).length && c.replace(/[^\d]/g, "").length >= 9) return "phone";
  // Bare numbers: small ones are door numbers, big ones are money.
  if (/^[\d,]+(\.\d{1,2})?$/.test(c)) return Number(c.replace(/,/g, "")) >= 500 ? "rent" : "unit";
  if (UNIT_RE.test(c) && /\d/.test(c)) return "unit";
  if (/^\d{7,8}$/.test(c)) return "idNumber";
  if (/^(kes|ksh)?\s*[\d,]+(\.\d{1,2})?$/i.test(c)) return "rent";
  if (/^[A-Za-z][A-Za-z '.-]+$/.test(c) && c.length > 2) return "name";
  return null;
}

/** Decide what each column holds. Returns the mapping and whether row 0 is a header. */
export function guessColumns(rows: string[][]): { fields: Field[]; hasHeader: boolean } {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const head = rows[0] ?? [];
  const headerFields = head.map((c) => headerField(String(c ?? "")));
  if (headerFields.filter(Boolean).length >= 2) {
    return { fields: Array.from({ length: width }, (_, i) => headerFields[i] ?? "ignore"), hasHeader: true };
  }
  const fields: Field[] = [];
  const sample = rows.slice(0, 50);
  const numericCols: number[] = [];
  for (let i = 0; i < width; i++) {
    const votes = new Map<Field, number>();
    for (const r of sample) {
      const f = guessByContent(String(r[i] ?? ""));
      if (f) votes.set(f, (votes.get(f) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "ignore";
    fields.push(best);
    if (best === "rent") numericCols.push(i);
  }
  // First money column is rent, then deposit/balance by position.
  numericCols.slice(1).forEach((col, k) => (fields[col] = k === 0 && numericCols.length > 2 ? "deposit" : "balance"));
  // Only one unit/name column; extra name-ish columns are ignored, extra phone columns kept.
  for (const f of ["unit", "name"] as Field[]) {
    let seen = false;
    fields.forEach((x, i) => {
      if (x === f) {
        if (seen) fields[i] = "ignore";
        seen = true;
      }
    });
  }
  return { fields, hasHeader: false };
}

function cell(r: unknown[], i: number): string {
  const v = r[i];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/**
 * Turn rows into validated tenant rows.
 * `knownUnits` are the building's unit codes (any form) for validation.
 */
export function parseTenantRows(
  rows: unknown[][],
  opts: { knownUnits?: string[]; fields?: Field[]; hasHeader?: boolean; defaultRentCents?: Map<string, number> } = {},
): { rows: TenantRow[]; fields: Field[]; hasHeader: boolean } {
  const strRows = rows.map((r) => r.map((_, i) => cell(r, i)));
  const guessed = guessColumns(strRows);
  const fields = opts.fields ?? guessed.fields;
  const hasHeader = opts.hasHeader ?? guessed.hasHeader;
  const known = new Map((opts.knownUnits ?? []).map((u) => [canonCode(u), u]));
  const out: TenantRow[] = [];

  strRows.slice(hasHeader ? 1 : 0).forEach((r, idx) => {
    const line = idx + 1 + (hasHeader ? 1 : 0);
    const row: TenantRow = {
      line, unitCode: "", name: "", phones: [], idNumber: null, rentCents: null, depositCents: null,
      openingBalanceCents: null, startDate: null, errors: [], warnings: [],
    };
    const money = (v: string, label: string) => {
      try {
        return parseCents(v);
      } catch {
        row.errors.push(`${label} "${v}" isn't an amount`);
        return null;
      }
    };
    fields.forEach((f, i) => {
      const v = r[i] ?? "";
      if (!v) return;
      switch (f) {
        case "unit":
          row.unitCode = v.toUpperCase().replace(/\s+/g, "");
          break;
        case "name":
          row.name = titleCase(v);
          break;
        case "phone": {
          const ps = extractPhones(v);
          if (!ps.length) row.warnings.push(`Phone "${v}" doesn't look like a Kenyan mobile number`);
          row.phones.push(...ps.filter((p) => !row.phones.includes(p)));
          break;
        }
        case "idNumber":
          row.idNumber = v.replace(/\s/g, "");
          break;
        case "rent":
          row.rentCents = money(v, "Rent");
          break;
        case "deposit":
          row.depositCents = money(v, "Deposit");
          break;
        case "balance":
          row.openingBalanceCents = money(v, "Balance");
          break;
        case "startDate": {
          const d = isISODate(v) ? v : parseStatementDate(v)?.slice(0, 10) ?? null;
          if (!d) row.warnings.push(`Couldn't read date "${v}"`);
          row.startDate = d;
          break;
        }
      }
    });
    if (!row.unitCode && !row.name && !row.phones.length) return; // blank / total line
    if (!row.unitCode) row.errors.push("Missing unit");
    else if (known.size) {
      const k = known.get(canonCode(row.unitCode));
      if (k) row.unitCode = k;
      else row.errors.push(`Unit ${row.unitCode} isn't in this building`);
    }
    if (!row.name) row.errors.push("Missing name");
    if (!row.phones.length) row.warnings.push("No phone number: receipts and reminders can't be sent");
    if (row.rentCents === null) {
      const d = opts.defaultRentCents?.get(canonCode(row.unitCode));
      if (d) row.rentCents = d;
      else row.errors.push("Missing rent");
    } else if (row.rentCents <= 0) row.errors.push("Rent must be more than zero");
    out.push(row);
  });

  // Duplicate units.
  const byUnit = new Map<string, TenantRow[]>();
  for (const r of out) if (r.unitCode) byUnit.set(canonCode(r.unitCode), [...(byUnit.get(canonCode(r.unitCode)) ?? []), r]);
  for (const [, rs] of byUnit) if (rs.length > 1) for (const r of rs) r.errors.push(`Unit ${r.unitCode} appears ${rs.length} times`);

  return { rows: out, fields, hasHeader };
}

export function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}
