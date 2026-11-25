/**
 * Bulk unit creation from a naming pattern, e.g.
 *   "A1-A20, B1-B20"     → 40 units
 *   "A01–A12"            → A01..A12 (zero padding kept)
 *   "1-24"               → 1..24
 *   "G1-G4, 1A-1D"       → G1..G4, 1A..1D (letter ranges after a number)
 *   "Shop 1, Shop 2, B5" → literal codes
 */
import { canonCode } from "../matching/account-ref";

export const MAX_UNITS = 500;

export class UnitPatternError extends Error {}

export function expandUnitPattern(pattern: string): string[] {
  const parts = pattern
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const range = /^(.+?)\s*(?:-|–|—|to|\.\.)\s*(.+)$/i.exec(part);
    if (range) out.push(...expandRange(range[1].trim(), range[2].trim(), part));
    else out.push(part.toUpperCase().replace(/\s+/g, " "));
    if (out.length > MAX_UNITS) throw new UnitPatternError(`That's more than ${MAX_UNITS} units. Split the building up.`);
  }
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const code of out) {
    const c = canonCode(code);
    if (seen.has(c)) dupes.push(code);
    seen.add(c);
  }
  if (dupes.length) throw new UnitPatternError(`Duplicate unit codes: ${[...new Set(dupes)].slice(0, 5).join(", ")}`);
  return out;
}

function expandRange(from: string, to: string, part: string): string[] {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  // Numeric part varies: A1-A20, A01-A20, Shop 1 - Shop 5, 1-24, also "A1-20".
  const na = /^(.*?)(\d+)$/.exec(a);
  const nb = /^(.*?)(\d+)$/.exec(b);
  if (na && nb && (na[1] === nb[1] || nb[1] === "")) {
    const prefix = na[1];
    const start = Number(na[2]);
    const end = Number(nb[2]);
    if (end < start) throw new UnitPatternError(`"${part}" counts backwards.`);
    if (end - start + 1 > MAX_UNITS) throw new UnitPatternError(`"${part}" is too many units.`);
    const pad = na[2].length > 1 && na[2].startsWith("0") ? na[2].length : 0;
    const out: string[] = [];
    for (let i = start; i <= end; i++) out.push(prefix + (pad ? String(i).padStart(pad, "0") : String(i)));
    return out;
  }
  // Letter part varies: 1A-1D, G-K.
  const la = /^(.*?)([A-Z])$/.exec(a);
  const lb = /^(.*?)([A-Z])$/.exec(b);
  if (la && lb && (la[1] === lb[1] || lb[1] === "")) {
    const s = la[2].charCodeAt(0);
    const e = lb[2].charCodeAt(0);
    if (e < s) throw new UnitPatternError(`"${part}" counts backwards.`);
    const out: string[] = [];
    for (let c = s; c <= e; c++) out.push(la[1] + String.fromCharCode(c));
    return out;
  }
  throw new UnitPatternError(`Couldn't read "${part}". Try something like A1-A20.`);
}

/** Pattern from blocks × count: blocks ["A","B"], 20 per block → "A1-A20, B1-B20". */
export function blocksPattern(blocks: string[], perBlock: number): string {
  return blocks
    .map((b) => b.trim().toUpperCase())
    .filter(Boolean)
    .map((b) => `${b}1-${b}${perBlock}`)
    .join(", ");
}
