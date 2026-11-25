import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { matchBatch } from "../../src/core/matching/engine";
import type { LeaseCandidate, MatchRule } from "../../src/core/matching/types";
import { parseStatementCsv } from "../../src/core/sources/mpesa-statement";
import { DEMO, ORG_ID, BUILDING_ID } from "../../src/demo/data";
import { demoStatementCsv } from "../../src/demo/statement";
import { as, createDb } from "./db";

let db: PGlite;
let user: string;

beforeAll(async () => {
  db = await createDb();
  user = (await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [DEMO.email])).rows[0].id;
  const seed = readFileSync(join(__dirname, "..", "seed.sql"), "utf8");
  await db.exec(seed.slice(seed.indexOf("-- @demo-data")));
});

describe("demo seed", () => {
  it("creates the demo org, 40 units and 36 tenancies with history", async () => {
    const r = await as(db, user, async (tx) => ({
      units: (await tx.query<{ n: number }>(`select count(*)::int as n from public.units where org_id = $1`, [ORG_ID])).rows[0].n,
      leases: (await tx.query<{ n: number }>(`select count(*)::int as n from public.lease_overview where org_id = $1`, [ORG_ID])).rows[0].n,
      paid: (await tx.query<{ n: number }>(`select count(*)::int as n from public.payments where org_id = $1`, [ORG_ID])).rows[0].n,
      inbox: (await tx.query<{ n: number }>(`select count(*)::int as n from public.payment_events where org_id = $1 and status in ('suggested','unmatched')`, [ORG_ID])).rows[0].n,
      owing: (await tx.query<{ n: number }>(`select count(*)::int as n from public.lease_overview where org_id = $1 and balance_cents > 0`, [ORG_ID])).rows[0].n,
    }));
    expect(r.units).toBe(40);
    expect(r.leases).toBe(36);
    expect(r.paid).toBeGreaterThan(60);
    expect(r.inbox).toBe(2);
    expect(r.owing).toBeGreaterThan(3);
  });

  it("George (B7) owes three months plus arrears; Eunice (B15) is in credit", async () => {
    const rows = await as(db, user, (tx) =>
      tx.query<{ unit_code: string; balance_cents: number }>(`select unit_code, balance_cents from public.lease_overview where org_id = $1 and unit_code in ('B7','B15')`, [ORG_ID]),
    );
    const by = Object.fromEntries(rows.rows.map((r) => [r.unit_code, Number(r.balance_cents)]));
    expect(by.B7).toBe(3 * 15_000_00 + 4_000_00);
    expect(by.B15).toBeLessThanOrEqual(0);
  });

  it("the sample statement: seen payments are skipped, new ones matched or sent to the inbox", async () => {
    const parsed = parseStatementCsv(demoStatementCsv().body);
    expect(parsed.skipped.length).toBeGreaterThanOrEqual(1);

    await as(db, user, async (tx) => {
      const ing = (
        await tx.query<{ r: { upload_id: string; inserted: { id: string; trans_code: string }[]; duplicates: number } }>(
          `select public.ingest_statement($1, $2, '{}'::jsonb, $3::jsonb) as r`,
          [
            ORG_ID,
            BUILDING_ID,
            JSON.stringify(
              parsed.payments.map((p) => ({
                trans_code: p.transCode, amount_cents: p.amountCents, occurred_at: p.occurredAt, payer_phone: p.payerPhone,
                payer_phone_masked: p.payerPhoneMasked, payer_name: p.payerName, account_ref: p.accountRef, raw: p.raw,
              })),
            ),
          ],
        )
      ).rows[0].r;
      // Everything already seeded this month is recognised.
      expect(ing.duplicates).toBeGreaterThan(0);
      expect(ing.inserted.length).toBeGreaterThanOrEqual(4);

      const leases = (
        await tx.query<{ lease_id: string; tenant_id: string; tenant_name: string; unit_code: string; building_id: string; rent_cents: number; balance_cents: number; oldest_unpaid_due: string | null; phones: string[] }>(
          `select lease_id, tenant_id, tenant_name, unit_code, building_id, rent_cents, balance_cents, oldest_unpaid_due::text, phones from public.lease_overview where org_id = $1`,
          [ORG_ID],
        )
      ).rows.map(
        (l): LeaseCandidate => ({ leaseId: l.lease_id, tenantId: l.tenant_id, tenantName: l.tenant_name, unitCode: l.unit_code, buildingId: l.building_id, rentCents: Number(l.rent_cents), balanceCents: Number(l.balance_cents), oldestUnpaidDue: l.oldest_unpaid_due, phones: l.phones }),
      );
      const rules = (await tx.query<{ kind: string; pattern: string; tenant_id: string }>(`select kind, pattern, tenant_id from public.match_rules where org_id = $1`, [ORG_ID])).rows.map(
        (r) => ({ kind: r.kind, pattern: r.pattern, tenantId: r.tenant_id }) as MatchRule,
      );
      const byCode = new Map(parsed.payments.map((p) => [p.transCode, p]));
      const incoming = ing.inserted.map((i) => {
        const p = byCode.get(i.trans_code)!;
        return { id: i.id, transCode: p.transCode, amountCents: p.amountCents, occurredAt: p.occurredAt, payerPhone: p.payerPhone, payerPhoneMasked: p.payerPhoneMasked, payerName: p.payerName, accountRef: p.accountRef };
      });
      const outcomes = matchBatch(incoming, { leases, rules });
      const decisions = Object.fromEntries(ing.inserted.map((i) => [i.trans_code, outcomes.get(i.id)!.decision]));
      expect(decisions.TKZ9LOOK04).toBe("auto"); // "BI9" + ISAAC TOO KIPLAGAT
      expect(decisions.TKZ9WRONG1).toBe("suggest"); // Rose typed B17
      expect(decisions.TKZ9UNKN02).not.toBe("auto"); // stranger, exact rent
      expect(decisions.TKZ9NAME03).toBe("suggest"); // name only

      const results = ing.inserted.map((i) => {
        const o = outcomes.get(i.id)!;
        return {
          event_id: i.id, decision: o.decision, confidence: o.confidence, suggestion: { summary: o.summary },
          allocations: o.allocations.map((a) => ({ lease_id: a.leaseId, amount_cents: a.amountCents })), suggested_lease_ids: o.best?.leaseIds ?? null,
        };
      });
      const applied = (await tx.query<{ r: { auto: number } }>(`select public.apply_match_results($1, $2::jsonb) as r`, [ing.upload_id, JSON.stringify(results)])).rows[0].r;
      expect(applied.auto).toBeGreaterThanOrEqual(1);
    });
  });
});
