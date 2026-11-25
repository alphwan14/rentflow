/**
 * Paybill account references are typed by tenants, so they are messy:
 * "B12", "b-12", "HSE B 12", "B12 JAN", "House no. B12", "BI2", "B12/13",
 * "B12 & B13", "12B", "0712345678", "JOHN KAMAU". This module turns them into
 * candidate unit codes, plus any phone number or name hidden inside.
 */
import { extractPhones } from "../phone";

export type RefStrength = "exact" | "confusable" | "partial";

export interface RefUnitHit {
  /** Canonical code as known to the building (canonCode form). */
  code: string;
  strength: RefStrength;
}

export interface ParsedRef {
  units: RefUnitHit[];
  phones: string[];
  /** Leftover alphabetic words, possibly a name ("MAMA BEN", "JOHN KAMAU"). */
  nameText: string;
  /** Normalised reference used for learned rules. */
  normalized: string;
}

const NOISE = new Set([
  "HOUSE", "HSE", "HS", "NO", "NUMBER", "NUM", "UNIT", "APT", "APARTMENT", "APTS", "RM", "ROOM",
  "DOOR", "FLAT", "RENT", "RENTS", "DEPOSIT", "PAYMENT", "PAY", "FOR", "OF", "THE", "ACC", "AC",
  "ACCOUNT", "BAL", "BALANCE", "ARREARS", "WATER", "MONTH", "AND", "BLOCK", "BLK", "PLOT", "TO",
  "JAN", "JANUARY", "FEB", "FEBRUARY", "MAR", "MARCH", "APR", "APRIL", "MAY", "JUN", "JUNE", "JUL",
  "JULY", "AUG", "AUGUST", "SEP", "SEPT", "SEPTEMBER", "OCT", "OCTOBER", "NOV", "NOVEMBER", "DEC",
  "DECEMBER",
]);

/** Canonical unit code: uppercase alphanumerics, no leading zeros in number runs. "b-012" → "B12". */
export function canonCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/\d+/g, (d) => String(Number(d)));
}

export function normalizeRef(ref: string | null | undefined): string {
  return (ref ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

const CONFUSABLE: Record<string, string> = { O: "0", I: "1", L: "1", S: "5", Z: "2", B: "8" };

/** Variants with letter↔digit look-alikes fixed in the numeric part: "BI2" → "B12", "B1O" → "B10". */
function confusableVariants(token: string): string[] {
  const out = new Set<string>();
  // Keep the leading letter block (the "block" letter) and fix look-alikes after it.
  for (let keep = 1; keep <= Math.min(2, token.length - 1); keep++) {
    const head = token.slice(0, keep);
    const tail = token
      .slice(keep)
      .split("")
      .map((c) => CONFUSABLE[c] ?? c)
      .join("");
    if (/^\d+$/.test(tail)) out.add(canonCode(head + tail));
  }
  return [...out];
}

/**
 * Parse a reference against the set of known unit codes (any form; they are
 * canonicalised here).
 */
export function parseAccountRef(ref: string | null | undefined, knownCodes: Iterable<string>): ParsedRef {
  const known = new Set<string>();
  for (const c of knownCodes) known.add(canonCode(c));

  const raw = (ref ?? "").toUpperCase();
  const phones = extractPhones(raw);
  // Strip phone numbers so their digits are not read as unit numbers.
  const withoutPhones = raw.replace(/(?:\+?254|0)?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}/g, " ");

  let tokens = withoutPhones.split(/[^A-Z0-9]+/).filter(Boolean);
  // Drop noise words and years, and month-name suffixes glued on ("B12JAN").
  tokens = tokens
    .map((t) => t.replace(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/, (m, _g, off) => (off > 0 && /\d/.test(t[off - 1]) ? "" : m)))
    .filter((t) => t && !NOISE.has(t) && !/^(19|20)\d{2}$/.test(t));

  // Merge split codes: "B", "12" → "B12".
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (/^[A-Z]{1,2}$/.test(t) && next && /^\d+[A-Z]?$/.test(next) && !known.has(canonCode(t))) {
      merged.push(t + next);
      i++;
    } else {
      merged.push(t);
    }
  }

  const units: RefUnitHit[] = [];
  const add = (code: string, strength: RefStrength) => {
    const existing = units.find((u) => u.code === code);
    if (!existing) units.push({ code, strength });
    else if (rank(strength) > rank(existing.strength)) existing.strength = strength;
  };
  const leftovers: string[] = [];
  let lastPrefix: string | null = null;

  for (const tok of merged) {
    const c = canonCode(tok);
    const prefixMatch = /^([A-Z]+)\d/.exec(c);
    if (known.has(c)) {
      add(c, "exact");
      lastPrefix = prefixMatch?.[1] ?? null;
      continue;
    }
    // "12B" written for "B12".
    const flipped = /^(\d+)([A-Z]{1,2})$/.exec(c);
    if (flipped && known.has(flipped[2] + flipped[1])) {
      add(flipped[2] + flipped[1], "confusable");
      lastPrefix = flipped[2];
      continue;
    }
    // Bare number following a code: "B12/13" → B13.
    if (/^\d+$/.test(c) && lastPrefix && known.has(lastPrefix + c)) {
      add(lastPrefix + c, "exact");
      continue;
    }
    // Look-alike characters: "BI2", "B1O".
    const variant = /\d/.test(c) || /[OIL]/.test(c.slice(1)) ? confusableVariants(c).find((v) => known.has(v)) : undefined;
    if (variant && c.length <= 5) {
      add(variant, "confusable");
      lastPrefix = /^([A-Z]+)/.exec(variant)?.[1] ?? null;
      continue;
    }
    // Bare number: only meaningful if the building uses numeric codes or the
    // number belongs to exactly one block.
    if (/^\d+$/.test(c)) {
      const hits = [...known].filter((k) => k.replace(/^[A-Z]+/, "") === c);
      for (const h of hits) add(h, "partial");
      if (hits.length) continue;
    }
    // Code with a trailing word glued on: "B12RENT".
    const lead = /^([A-Z]{1,2}\d+)[A-Z]{3,}$/.exec(c);
    if (lead && known.has(lead[1])) {
      add(lead[1], "exact");
      continue;
    }
    if (/^[A-Z]+$/.test(tok)) leftovers.push(tok);
  }

  return {
    units,
    phones,
    nameText: leftovers.join(" "),
    normalized: normalizeRef(ref),
  };
}

function rank(s: RefStrength): number {
  return s === "exact" ? 3 : s === "confusable" ? 2 : 1;
}
