/** Jaro-Winkler similarity in [0, 1]. Good for short, misspelled names. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aM = new Array<boolean>(a.length).fill(false);
  const bM = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = bM[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "ENG", "PROF", "REV", "PST", "FR", "HON"]);

/** Uppercase letter tokens with titles removed: "Mrs. Jane  W. Njeri" → ["JANE","W","NJERI"]. */
export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));
}

export function normalizeName(name: string | null | undefined): string {
  return nameTokens(name).join(" ");
}

export interface NameMatch {
  /** 0..1 overall similarity. */
  score: number;
  /** Number of payer tokens that matched a tenant token (initials count 0.5). */
  matched: number;
  /** True when every token of the shorter name found a match. */
  complete: boolean;
}

const TOKEN_THRESHOLD = 0.88;

/**
 * Compare an M-Pesa payer name with a tenant's name. Order-insensitive and
 * tolerant to misspelling ("WANJIRU" ~ "WANJIRUH"), missing middle names and
 * initials ("J KAMAU" ~ "John Kamau").
 */
export function compareNames(payer: string | null | undefined, tenant: string | null | undefined): NameMatch {
  const p = nameTokens(payer);
  const t = nameTokens(tenant);
  if (!p.length || !t.length) return { score: 0, matched: 0, complete: false };
  const used = new Set<number>();
  let matched = 0;
  let simTotal = 0;
  for (const pt of p) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < t.length; i++) {
      if (used.has(i)) continue;
      const tt = t[i];
      let s: number;
      if (pt.length === 1 || tt.length === 1) {
        s = pt[0] === tt[0] ? 0.9 : 0;
      } else {
        s = jaroWinkler(pt, tt);
      }
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    }
    if (best >= TOKEN_THRESHOLD && bestIdx >= 0) {
      used.add(bestIdx);
      const initial = pt.length === 1 || t[bestIdx].length === 1;
      matched += initial ? 0.5 : 1;
      simTotal += best;
    }
  }
  const shorter = Math.min(p.length, t.length);
  const longer = Math.max(p.length, t.length);
  const complete = used.size >= shorter;
  const score = used.size ? (simTotal / used.size) * (used.size / longer) * 0.4 + (used.size / shorter) * 0.6 : 0;
  return { score: Math.min(1, score), matched, complete };
}
