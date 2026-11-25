/**
 * Payment matching engine.
 *
 * Every source (statement line, Daraja C2B callback, KCB Buni IPN) is reduced
 * to an IncomingPayment and run through `matchPayment`. Evidence is gathered
 * per candidate in this order of trust:
 *
 *   1. account reference (unit code typed by the payer)
 *   2. known phone numbers (on file, or learned from earlier confirmations)
 *   3. payer name (fuzzy)
 *   4. amount compared with rent / balance due
 *
 * Evidence strengths are combined with a noisy-OR into a 0..1 confidence.
 * A payment is posted automatically only when the best candidate is strong,
 * backed by an identity signal (not amount or a loose name alone), and clearly
 * ahead of the runner-up. Everything else goes to the "Who paid this?" inbox
 * with the best guess pre-selected.
 *
 * Pure function: no I/O, deterministic, fully unit-tested.
 */
import type { Cents } from "../money";
import { formatKES } from "../money";
import { formatPhone, normalizePhone, parsePhoneMask, phoneMatchesMask } from "../phone";
import { canonCode, parseAccountRef } from "./account-ref";
import { compareNames, normalizeName } from "./similarity";
import type {
  Allocation,
  Candidate,
  IncomingPayment,
  LeaseCandidate,
  MatchContext,
  MatchOutcome,
  MatchRule,
  Reason,
} from "./types";

/** Strength of each kind of evidence. Tuned with the scenarios in engine.test.ts. */
export const STRENGTH = {
  refExact: 0.9,
  refConfusable: 0.78,
  refPartialUnique: 0.6,
  refPartialAmbiguous: 0.3,
  refRule: 0.9,
  refPhone: 0.88,
  phone: 0.93,
  phoneRule: 0.93,
  phoneMaskUnique: 0.7,
  phoneMaskAmbiguous: 0.3,
  nameRule: 0.9,
  nameStrong: 0.65,
  nameGood: 0.5,
  nameWeak: 0.15,
  amountExactBalance: 0.3,
  amountRent: 0.25,
} as const;

/** Combined score needed to post without asking. */
export const AUTO_THRESHOLD = 0.9;
/** The best identity signal must be at least this strong to auto-post. */
export const AUTO_MIN_IDENTITY = 0.75;
/** Required lead over the runner-up to auto-post. */
export const AUTO_MIN_MARGIN = 0.15;
/** Below this the inbox shows no pre-selected guess. */
export const SUGGEST_THRESHOLD = 0.25;

const IDENTITY_SIGNALS = new Set(["account_ref", "ref_rule", "ref_phone", "phone", "phone_rule", "phone_mask", "name_rule", "name"]);

function noisyOr(strengths: number[]): number {
  let miss = 1;
  for (const s of strengths) miss *= 1 - s;
  return 1 - miss;
}

interface Draft {
  leaseIds: Set<string>;
  reasons: Reason[];
}

function keyOf(ids: Iterable<string>): string {
  return [...ids].sort().join("+");
}

/**
 * Split a payment across several leases, oldest unpaid debt first. Anything
 * left over stays as credit on the first lease (the one named first / the
 * tenant's main unit).
 */
export function splitAcrossLeases(amountCents: Cents, leases: LeaseCandidate[]): Allocation[] {
  if (leases.length === 0) return [];
  if (leases.length === 1) return [{ leaseId: leases[0].leaseId, amountCents }];
  const order = [...leases].sort((a, b) => {
    const ad = a.oldestUnpaidDue ?? "9999-12-31";
    const bd = b.oldestUnpaidDue ?? "9999-12-31";
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
  const out = new Map<string, Cents>();
  let left = amountCents;
  for (const l of order) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, l.balanceCents));
    if (take > 0) {
      out.set(l.leaseId, take);
      left -= take;
    }
  }
  if (left > 0) out.set(leases[0].leaseId, (out.get(leases[0].leaseId) ?? 0) + left);
  return leases.filter((l) => out.has(l.leaseId)).map((l) => ({ leaseId: l.leaseId, amountCents: out.get(l.leaseId)! }));
}

export function matchPayment(payment: IncomingPayment, ctx: MatchContext): MatchOutcome {
  const leases = ctx.leases;
  const byId = new Map(leases.map((l) => [l.leaseId, l]));
  const byCode = new Map<string, LeaseCandidate[]>();
  for (const l of leases) {
    const c = canonCode(l.unitCode);
    byCode.set(c, [...(byCode.get(c) ?? []), l]);
  }
  const byTenant = new Map<string, LeaseCandidate[]>();
  for (const l of leases) byTenant.set(l.tenantId, [...(byTenant.get(l.tenantId) ?? []), l]);

  const drafts = new Map<string, Draft>();
  const tenantDraft = new Map<string, Draft>();
  const draftFor = (ids: string[]): Draft => {
    const k = keyOf(ids);
    let d = drafts.get(k);
    if (!d) {
      d = { leaseIds: new Set(ids), reasons: [] };
      drafts.set(k, d);
    }
    return d;
  };
  /** Tenant-level evidence (phone, name) targets all of the tenant's leases unless the ref narrows it. */
  const forTenant = (tenantId: string): Draft | null => {
    const ls = byTenant.get(tenantId);
    if (!ls?.length) return null;
    let d = tenantDraft.get(tenantId);
    if (!d) {
      d = draftFor(ls.map((l) => l.leaseId));
      tenantDraft.set(tenantId, d);
    }
    return d;
  };
  const push = (d: Draft | null, r: Reason) => {
    if (!d) return;
    const same = d.reasons.find((x) => x.signal === r.signal);
    if (same) {
      if (r.strength > same.strength) Object.assign(same, r);
    } else d.reasons.push(r);
  };

  const rulesBy = (kind: MatchRule["kind"], pattern: string) =>
    ctx.rules.filter((r) => r.kind === kind && r.pattern === pattern && byTenant.has(r.tenantId));

  // ── 1. Account reference ────────────────────────────────────────────────
  const ref = parseAccountRef(payment.accountRef, byCode.keys());
  const refTenants = new Map<string, LeaseCandidate[]>();
  const refLeases: { lease: LeaseCandidate; strength: number; detail: string }[] = [];
  for (const hit of ref.units) {
    const ls = byCode.get(hit.code) ?? [];
    for (const l of ls) {
      const partialHits = ref.units.filter((u) => u.strength === "partial").length;
      const strength =
        hit.strength === "exact"
          ? STRENGTH.refExact
          : hit.strength === "confusable"
            ? STRENGTH.refConfusable
            : partialHits === 1 && ls.length === 1
              ? STRENGTH.refPartialUnique
              : STRENGTH.refPartialAmbiguous;
      const detail =
        hit.strength === "exact"
          ? `Account "${payment.accountRef}" is unit ${l.unitCode}`
          : `Account "${payment.accountRef}" looks like unit ${l.unitCode}`;
      refLeases.push({ lease: l, strength, detail });
      refTenants.set(l.tenantId, [...(refTenants.get(l.tenantId) ?? []), l]);
    }
  }
  const strongRefLeases = refLeases.filter((r) => r.strength >= STRENGTH.refConfusable);
  const strongCodes = new Set(strongRefLeases.map((r) => canonCode(r.lease.unitCode)));
  // One payment naming several units (B12 + B13) → a single group candidate.
  // (One code that exists in two buildings is ambiguity, not a group.)
  if (strongCodes.size >= 2) {
    const ids = strongRefLeases.map((r) => r.lease.leaseId);
    const d = draftFor(ids);
    const codes = strongRefLeases.map((r) => r.lease.unitCode).join(" + ");
    push(d, {
      signal: "account_ref",
      strength: Math.min(...strongRefLeases.map((r) => r.strength)),
      detail: `Account "${payment.accountRef}" names units ${codes}`,
    });
    for (const r of strongRefLeases) {
      const td = forTenant(r.lease.tenantId);
      if (td && td !== d && byTenant.get(r.lease.tenantId)!.every((l) => d.leaseIds.has(l.leaseId))) {
        // The tenant's evidence belongs to the group when the group covers all their units.
        tenantDraft.set(r.lease.tenantId, d);
      }
    }
  } else {
    for (const r of refLeases) {
      // Narrow the tenant's target to the named unit.
      const d = draftFor([r.lease.leaseId]);
      push(d, { signal: "account_ref", strength: r.strength, detail: r.detail });
      tenantDraft.set(r.lease.tenantId, d);
    }
  }

  // Learned account-reference rules ("MAMA BEN" → tenant).
  if (ref.normalized) {
    for (const rule of rulesBy("account_ref", ref.normalized)) {
      push(forTenant(rule.tenantId), {
        signal: "ref_rule",
        strength: STRENGTH.refRule,
        detail: `Account "${payment.accountRef}" was confirmed for this tenant before`,
      });
    }
  }
  // Phone typed as the account ("0712345678").
  for (const p of ref.phones) {
    for (const l of leases.filter((x) => x.phones.includes(p))) {
      push(forTenant(l.tenantId), {
        signal: "ref_phone",
        strength: STRENGTH.refPhone,
        detail: `Account is ${formatPhone(p)}, ${l.tenantName}'s number`,
      });
    }
  }

  // ── 2. Phone numbers ────────────────────────────────────────────────────
  const phone = normalizePhone(payment.payerPhone ?? null);
  if (phone) {
    const onFile = new Set(leases.filter((l) => l.phones.includes(phone)).map((l) => l.tenantId));
    for (const t of onFile) {
      push(forTenant(t), { signal: "phone", strength: STRENGTH.phone, detail: `Paid from ${formatPhone(phone)}, on file for this tenant` });
    }
    for (const rule of rulesBy("phone", phone)) {
      if (onFile.has(rule.tenantId)) continue;
      push(forTenant(rule.tenantId), {
        signal: "phone_rule",
        strength: STRENGTH.phoneRule,
        detail: `${formatPhone(phone)} has paid for this tenant before`,
      });
    }
  } else {
    const mask = parsePhoneMask(payment.payerPhoneMasked ?? payment.payerPhone ?? null);
    if (mask) {
      const hits = new Set<string>();
      for (const l of leases) if (l.phones.some((p) => phoneMatchesMask(p, mask))) hits.add(l.tenantId);
      for (const r of ctx.rules) if (r.kind === "phone" && phoneMatchesMask(r.pattern, mask) && byTenant.has(r.tenantId)) hits.add(r.tenantId);
      for (const t of hits) {
        push(forTenant(t), {
          signal: "phone_mask",
          strength: hits.size === 1 ? STRENGTH.phoneMaskUnique : STRENGTH.phoneMaskAmbiguous,
          detail: `Masked number ${payment.payerPhoneMasked ?? payment.payerPhone} fits this tenant's phone`,
        });
      }
    }
  }

  // ── 3. Names ────────────────────────────────────────────────────────────
  const payerName = normalizeName(payment.payerName);
  if (payerName) {
    for (const rule of rulesBy("name", payerName)) {
      push(forTenant(rule.tenantId), {
        signal: "name_rule",
        strength: STRENGTH.nameRule,
        detail: `"${payment.payerName}" was confirmed for this tenant before`,
      });
    }
  }
  const nameSources = [payment.payerName, ref.nameText].filter((s): s is string => !!s && s.trim().length > 1);
  if (nameSources.length) {
    for (const [tenantId, ls] of byTenant) {
      let best = { strength: 0, detail: "" };
      for (const src of nameSources) {
        const m = compareNames(src, ls[0].tenantName);
        let s = 0;
        if (m.matched >= 2 && m.complete && m.score >= 0.85) s = STRENGTH.nameStrong;
        else if (m.matched >= 1.5) s = STRENGTH.nameGood;
        else if (m.matched >= 1) s = STRENGTH.nameWeak;
        if (s > best.strength) best = { strength: s, detail: `Name "${src.trim()}" ≈ ${ls[0].tenantName}` };
      }
      if (best.strength > 0) push(forTenant(tenantId), { signal: "name", strength: best.strength, detail: best.detail });
    }
  }

  // ── 4. Amount ───────────────────────────────────────────────────────────
  // Add amount evidence to every existing draft, and create amount-only
  // drafts for single leases whose due amount equals the payment exactly.
  const amount = payment.amountCents;
  const amountReason = (ids: Iterable<string>): Reason | null => {
    const ls = [...ids].map((id) => byId.get(id)!).filter(Boolean);
    const due = ls.reduce((s, l) => s + Math.max(0, l.balanceCents), 0);
    const rent = ls.reduce((s, l) => s + l.rentCents, 0);
    if (due > 0 && amount === due) return { signal: "amount", strength: STRENGTH.amountExactBalance, detail: `${formatKES(amount)} is exactly the balance due` };
    if (rent > 0 && amount === rent) return { signal: "amount", strength: STRENGTH.amountRent, detail: `${formatKES(amount)} equals the monthly rent` };
    return null;
  };
  for (const d of drafts.values()) {
    const r = amountReason(d.leaseIds);
    if (r) push(d, r);
  }
  for (const l of leases) {
    const k = keyOf([l.leaseId]);
    if (drafts.has(k)) continue;
    const r = amountReason([l.leaseId]);
    if (r && tenantDraft.get(l.tenantId) === undefined) push(draftFor([l.leaseId]), r);
  }

  // ── Score and decide ───────────────────────────────────────────────────
  const candidates: Candidate[] = [...drafts.values()]
    .filter((d) => d.reasons.length > 0)
    .map((d) => toCandidate(d, byId))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return decide(payment, candidates, byId);
}

function toCandidate(d: Draft, byId: Map<string, LeaseCandidate>): Candidate {
  const ls = [...d.leaseIds].map((id) => byId.get(id)!);
  const tenantIds = [...new Set(ls.map((l) => l.tenantId))];
  const names = [...new Set(ls.map((l) => l.tenantName))].join(", ");
  const reasons = [...d.reasons].sort((a, b) => b.strength - a.strength);
  return {
    leaseIds: ls.map((l) => l.leaseId),
    tenantIds,
    label: `${ls.map((l) => l.unitCode).join(" + ")} · ${names}`,
    score: noisyOr(reasons.map((r) => r.strength)),
    reasons,
  };
}

function decide(payment: IncomingPayment, candidates: Candidate[], byId: Map<string, LeaseCandidate>): MatchOutcome {
  const best = candidates[0] ?? null;
  // Runner-up must point at different people, not a subset of the same tenant.
  const second = best ? candidates.find((c) => c !== best && !c.tenantIds.every((t) => best.tenantIds.includes(t))) : undefined;
  const top3 = candidates.slice(0, 3);

  if (!best || best.score < SUGGEST_THRESHOLD) {
    return {
      decision: "unmatched",
      confidence: round(best?.score ?? 0),
      best: null,
      candidates: top3,
      allocations: [],
      summary: top3.length ? "Couldn't tell who paid this. A few possibilities below." : "No tenant looks like this payer.",
    };
  }

  // Identity = who the payer is. Amount alone never identifies anyone. Either one
  // strong identity signal, or two independent weaker ones that agree
  // (e.g. masked phone + full name).
  const ids = best.reasons.filter((r) => IDENTITY_SIGNALS.has(r.signal)).map((r) => r.strength);
  const identityOk = Math.max(0, ...ids) >= AUTO_MIN_IDENTITY || (ids.length >= 2 && noisyOr(ids) >= 0.85);
  const margin = best.score - (second?.score ?? 0);
  const clear = !second || margin >= AUTO_MIN_MARGIN || second.score < 0.5;
  const auto = best.score >= AUTO_THRESHOLD && identityOk && clear;

  const allocations = splitAcrossLeases(
    payment.amountCents,
    best.leaseIds.map((id) => byId.get(id)!),
  );

  let summary: string;
  if (auto) summary = `Matched to ${best.label}: ${best.reasons[0].detail.toLowerCase()}.`;
  else if (second && !clear) summary = `Could be ${best.label} or ${second.label}.`;
  else summary = `Probably ${best.label}: ${best.reasons[0].detail.toLowerCase()}.`;

  return {
    decision: auto ? "auto" : "suggest",
    confidence: round(best.score),
    best,
    candidates: top3,
    allocations,
    summary,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Match a batch in chronological order (statement upload). Each auto-posted
 * payment reduces the in-memory balance so later amount checks stay accurate.
 */
export function matchBatch(payments: IncomingPayment[], ctx: MatchContext): Map<string, MatchOutcome> {
  const leases = ctx.leases.map((l) => ({ ...l }));
  const live: MatchContext = { leases, rules: ctx.rules };
  const byId = new Map(leases.map((l) => [l.leaseId, l]));
  const out = new Map<string, MatchOutcome>();
  const sorted = [...payments].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));
  for (const p of sorted) {
    const res = matchPayment(p, live);
    out.set(p.id, res);
    if (res.decision === "auto") {
      for (const a of res.allocations) {
        const l = byId.get(a.leaseId);
        if (l) l.balanceCents -= a.amountCents;
      }
    }
  }
  return out;
}

/** The rule to learn when a landlord confirms a payment for a tenant. */
export function rulesToLearn(payment: IncomingPayment, tenantId: string, ctx: MatchContext): MatchRule[] {
  const out: MatchRule[] = [];
  const tenantPhones = new Set(ctx.leases.filter((l) => l.tenantId === tenantId).flatMap((l) => l.phones));
  const phone = normalizePhone(payment.payerPhone ?? null);
  if (phone && !tenantPhones.has(phone)) out.push({ kind: "phone", pattern: phone, tenantId });
  const name = normalizeName(payment.payerName);
  // Names are only learned when the phone is hidden, and only full names (2+ words).
  if (!phone && name.split(" ").length >= 2) out.push({ kind: "name", pattern: name, tenantId });
  const ref = parseAccountRef(payment.accountRef, ctx.leases.map((l) => l.unitCode));
  // Free-text references ("MAMA BEN") are learned; unit codes, phones and noise words ("RENT") are not.
  if (ref.units.length === 0 && ref.phones.length === 0 && ref.nameText.replace(/\s/g, "").length >= 3) {
    out.push({ kind: "account_ref", pattern: ref.normalized, tenantId });
  }
  return out;
}
