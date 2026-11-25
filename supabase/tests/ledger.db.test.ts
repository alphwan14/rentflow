import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addMonths, periodOf, todayNairobi } from "../../src/core/period";
import { as, createDb, createUser, rejects } from "./db";

const today = todayNairobi();
const thisMonth = periodOf(today);
const trackFrom = addMonths(thisMonth, -2); // three months of history incl. this one

let db: PGlite;
let owner: string;
let viewer: string;
let stranger: string;
let org: string;
let building: string;

const one = async <T>(tx: Transaction | PGlite, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0];

const units40 = () => {
  const out = [];
  for (const b of ["A", "B"]) for (let i = 1; i <= 20; i++) out.push({ code: `${b}${i}`, rent_cents: 1_500_000, deposit_cents: 1_500_000 });
  return out;
};

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.com", "Jane Landlord");
  viewer = await createUser(db, "viewer@example.com");
  stranger = await createUser(db, "stranger@example.com");
  org = (await as(db, owner, (tx) => one<{ id: string }>(tx, `select public.create_org('Kasarani Properties') as id`))).id;
  // Viewer joins through an invite.
  const token = (await as(db, owner, (tx) => one<{ t: string }>(tx, `select public.create_invite($1, 'viewer') as t`, [org]))).t;
  await as(db, viewer, (tx) => tx.query(`select public.accept_invite($1)`, [token]));
});

describe("orgs, plans and buildings", () => {
  it("creates a profile for new users and makes the creator owner", async () => {
    const p = await one<{ full_name: string }>(db, `select full_name from public.profiles where user_id = $1`, [owner]);
    expect(p.full_name).toBe("Jane Landlord");
    const roles = await as(db, owner, (tx) => tx.query<{ role: string }>(`select role from public.members where org_id = $1 order by role`, [org]));
    expect(roles.rows.map((r) => r.role)).toEqual(["owner", "viewer"]);
  });

  it("the Free plan stops at 10 units", async () => {
    await rejects(
      as(db, owner, (tx) =>
        tx.query(`select public.create_building($1, 'Kasarani Heights', 'Kasarani', 5, $2, $3::jsonb, null)`, [org, trackFrom, JSON.stringify(units40())]),
      ),
      /Free plan covers up to 10 units/,
    );
  });

  it("owners cannot change their own plan", async () => {
    await rejects(as(db, owner, (tx) => tx.query(`select public.set_org_plan($1, 'pro')`, [org])), /permission/);
    await rejects(as(db, owner, (tx) => tx.query(`update public.orgs set plan = 'pro' where id = $1`, [org])), /permission denied/);
  });

  it("creates a 40-unit building with a paybill on Growth", async () => {
    await db.query(`update public.orgs set plan = 'growth' where id = $1`, [org]);
    building = (
      await as(db, owner, (tx) =>
        one<{ id: string }>(tx, `select public.create_building($1, 'Kasarani Heights', 'Kasarani', 5, $2, $3::jsonb, $4::jsonb) as id`, [
          org,
          trackFrom,
          JSON.stringify(units40()),
          JSON.stringify({ kind: "paybill", number: "4012345" }),
        ]),
      )
    ).id;
    const c = await as(db, owner, (tx) => one<{ n: number }>(tx, `select count(*)::int as n from public.units where building_id = $1`, [building]));
    expect(c.n).toBe(40);
    const key = await one<{ code_key: string }>(db, `select code_key from public.units where building_id = $1 and code = 'B12'`, [building]);
    expect(key.code_key).toBe("B12");
  });

  it("a second building needs Pro", async () => {
    await rejects(
      as(db, owner, (tx) => tx.query(`select public.create_building($1, 'Umoja Court', null, 5, null, '[]'::jsonb, null)`, [org])),
      /needs the Pro plan/,
    );
  });
});

let leaseB12: string;
let leaseA3: string;
let leaseA4: string;
let tenantJohn: string;

describe("tenant import and rent charges", () => {
  it("imports tenants, bills every month since tracking started, and brings arrears forward", async () => {
    const rows = [
      { unit_code: "b-12", full_name: "John Kamau Mwangi", phones: ["254712345678"], rent_cents: 1_500_000, opening_balance_cents: 500_000 },
      { unit_code: "A3", full_name: "Samuel Kiptoo", phones: ["254711000111"], rent_cents: 1_200_000 },
      { unit_code: "A4", full_name: "Samuel Kiptoo (shop)", phones: [], rent_cents: 800_000, opening_balance_cents: -200_000 },
    ];
    const n = await as(db, owner, (tx) => one<{ n: number }>(tx, `select public.import_tenants($1, $2::jsonb) as n`, [building, JSON.stringify(rows)]));
    expect(n.n).toBe(3);
    const l = await as(db, owner, (tx) =>
      tx.query<{ lease_id: string; unit_code: string; tenant_id: string; balance_cents: string }>(
        `select lease_id, unit_code, tenant_id, balance_cents from public.lease_overview where building_id = $1 order by unit_code`,
        [building],
      ),
    );
    const byUnit = Object.fromEntries(l.rows.map((r) => [r.unit_code, r]));
    leaseB12 = byUnit.B12.lease_id;
    leaseA3 = byUnit.A3.lease_id;
    leaseA4 = byUnit.A4.lease_id;
    tenantJohn = byUnit.B12.tenant_id;
    // 3 months × 15,000 + 5,000 brought forward.
    expect(Number(byUnit.B12.balance_cents)).toBe(3 * 1_500_000 + 500_000);
    expect(Number(byUnit.A4.balance_cents)).toBe(3 * 800_000 - 200_000);
    const st = await one<{ status: string }>(db, `select status from public.units where building_id = $1 and code = 'B12'`, [building]);
    expect(st.status).toBe("occupied");
  });

  it("charge runs are idempotent", async () => {
    const n = await one<{ n: number }>(db, `select public.run_monthly_charges($1::date) as n`, [today]);
    expect(n.n).toBe(0);
    const c = await one<{ n: number }>(db, `select count(*)::int as n from public.charges where lease_id = $1 and kind = 'rent'`, [leaseB12]);
    expect(c.n).toBe(3);
  });

  it("refuses a second tenant in an occupied unit", async () => {
    await rejects(
      as(db, owner, (tx) => tx.query(`select public.import_tenants($1, $2::jsonb)`, [building, JSON.stringify([{ unit_code: "B12", full_name: "X", phones: [], rent_cents: 1 }])])),
      /already has a tenant/,
    );
  });
});

describe("row-level security", () => {
  it("strangers see nothing", async () => {
    const r = await as(db, stranger, (tx) => one<{ n: number }>(tx, `select count(*)::int as n from public.lease_overview`));
    expect(r.n).toBe(0);
    const b = await as(db, stranger, (tx) => one<{ n: number }>(tx, `select count(*)::int as n from public.buildings`));
    expect(b.n).toBe(0);
  });

  it("strangers cannot post payments or import into someone else's building", async () => {
    await rejects(as(db, stranger, (tx) => tx.query(`select public.import_tenants($1, '[]'::jsonb)`, [building])), /permission/);
    await rejects(as(db, stranger, (tx) => tx.query(`select public.create_invite($1, 'manager')`, [org])), /permission/);
  });

  it("viewers can read but not write", async () => {
    const r = await as(db, viewer, (tx) => one<{ n: number }>(tx, `select count(*)::int as n from public.lease_overview`));
    expect(r.n).toBe(3);
    await rejects(as(db, viewer, (tx) => tx.query(`insert into public.tenants (org_id, full_name) values ($1, 'X')`, [org])), /row-level security/);
    await rejects(as(db, viewer, (tx) => tx.query(`select public.add_charge($1, 'water', 50000, $2::date)`, [leaseB12, today])), /permission/);
  });

  it("nobody writes the ledger directly", async () => {
    await rejects(
      as(db, owner, (tx) =>
        tx.query(`insert into public.ledger_entries (org_id, lease_id, kind, amount_cents, effective_date) values ($1, $2, 'adjustment', -100, $3)`, [org, leaseB12, today]),
      ),
      /permission denied/,
    );
    await rejects(as(db, owner, (tx) => tx.query(`select public._post_payment(null, '[]', 'auto', 1, null)`)), /permission denied/);
  });

  it("history is append-only, even for the database owner", async () => {
    await rejects(db.query(`update public.ledger_entries set amount_cents = 1 where lease_id = $1`, [leaseB12]), /append-only/);
    await rejects(db.query(`delete from public.charges where lease_id = $1`, [leaseB12]), /append-only/);
  });
});

let upload: string;
let events: Record<string, string>;

describe("statement ingest, matching results, inbox", () => {
  const stmt = [
    { trans_code: "TKB3XY12ZQ", amount_cents: 1_500_000, occurred_at: `${thisMonth.slice(0, 8)}02T07:58:41+03:00`, payer_phone: "254712345678", payer_name: "JOHN KAMAU MWANGI", account_ref: "B12" },
    { trans_code: "TKB7MN90OP", amount_cents: 2_000_000, occurred_at: `${thisMonth.slice(0, 8)}03T21:45:00+03:00`, payer_phone: "254711000111", payer_name: "SAMUEL KIPTOO", account_ref: "A3 A4" },
    { trans_code: "TKB5EF56GH", amount_cents: 1_500_000, occurred_at: `${thisMonth.slice(0, 8)}04T18:22:47+03:00`, payer_phone: "254790123456", payer_name: "ESTHER NJOKI", account_ref: "" },
  ];

  it("stores each transaction once", async () => {
    const r = await as(db, owner, (tx) =>
      one<{ r: { upload_id: string; inserted: { id: string; trans_code: string }[]; duplicates: number } }>(
        tx,
        `select public.ingest_statement($1, $2, $3::jsonb, $4::jsonb) as r`,
        [org, building, JSON.stringify({ filename: "nov.csv", format: "M-Pesa business statement" }), JSON.stringify(stmt)],
      ),
    );
    expect(r.r.inserted).toHaveLength(3);
    upload = r.r.upload_id;
    events = Object.fromEntries(r.r.inserted.map((e) => [e.trans_code, e.id]));
    const again = await as(db, owner, (tx) =>
      one<{ r: { inserted: unknown[]; duplicates: number } }>(tx, `select public.ingest_statement($1, $2, '{}'::jsonb, $3::jsonb) as r`, [org, building, JSON.stringify(stmt)]),
    );
    expect(again.r.inserted).toHaveLength(0);
    expect(again.r.duplicates).toBe(3);
  });

  it("posts sure matches and parks the rest in the inbox", async () => {
    const results = [
      { event_id: events.TKB3XY12ZQ, decision: "auto", confidence: 0.99, suggestion: { summary: "B12" }, allocations: [{ lease_id: leaseB12, amount_cents: 1_500_000 }] },
      {
        event_id: events.TKB7MN90OP, decision: "auto", confidence: 0.99, suggestion: {},
        allocations: [{ lease_id: leaseA3, amount_cents: 1_200_000 }, { lease_id: leaseA4, amount_cents: 800_000 }],
      },
      { event_id: events.TKB5EF56GH, decision: "suggest", confidence: 0.3, suggestion: { summary: "?" }, allocations: [], suggested_lease_ids: [leaseB12] },
    ];
    const r = await as(db, owner, (tx) => one<{ r: unknown }>(tx, `select public.apply_match_results($1, $2::jsonb) as r`, [upload, JSON.stringify(results)]));
    expect(r.r).toEqual({ auto: 2, suggested: 1, unmatched: 0 });
    const u = await one<{ auto_matched: number; suggested: number }>(db, `select auto_matched, suggested from public.statement_uploads where id = $1`, [upload]);
    expect(u).toMatchObject({ auto_matched: 2, suggested: 1 });

    const o = await as(db, owner, (tx) =>
      one<{ balance_cents: string; paid_this_month_cents: string; oldest_unpaid_due: string }>(
        tx,
        `select balance_cents, paid_this_month_cents, oldest_unpaid_due::text from public.lease_overview where lease_id = $1`,
        [leaseB12],
      ),
    );
    expect(Number(o.balance_cents)).toBe(2 * 1_500_000 + 500_000);
    expect(Number(o.paid_this_month_cents)).toBe(1_500_000);
    // The payment cleared the balance brought forward and the first month.
    expect(o.oldest_unpaid_due.slice(0, 7)).toBe(trackFrom.slice(0, 7));
  });

  it("validates splits", async () => {
    await rejects(
      as(db, owner, (tx) => tx.query(`select public.post_payment($1, $2::jsonb)`, [events.TKB5EF56GH, JSON.stringify([{ lease_id: leaseB12, amount_cents: 1 }])])),
      /must add up/,
    );
    await rejects(
      as(db, owner, (tx) => tx.query(`select public.post_payment($1, $2::jsonb)`, [events.TKB3XY12ZQ, JSON.stringify([{ lease_id: leaseB12, amount_cents: 1_500_000 }])])),
      /already been posted/,
    );
  });

  it("confirming in the inbox posts the payment and learns the phone", async () => {
    await as(db, owner, (tx) =>
      tx.query(`select public.post_payment($1, $2::jsonb, $3::jsonb)`, [
        events.TKB5EF56GH,
        JSON.stringify([{ lease_id: leaseB12, amount_cents: 1_500_000 }]),
        JSON.stringify([{ kind: "phone", pattern: "254790123456", tenant_id: tenantJohn }]),
      ]),
    );
    const rule = await as(db, owner, (tx) => one<{ tenant_id: string; hits: number }>(tx, `select tenant_id, hits from public.match_rules where pattern = '254790123456'`));
    expect(rule).toEqual({ tenant_id: tenantJohn, hits: 1 });
    const p = await as(db, owner, (tx) => one<{ match_method: string }>(tx, `select match_method from public.payments where event_id = $1`, [events.TKB5EF56GH]));
    expect(p.match_method).toBe("confirmed");
  });

  it("reversing a payment restores the balance and returns it to the inbox", async () => {
    const before = await one<{ b: string }>(db, `select balance_cents as b from public.lease_overview where lease_id = $1`, [leaseB12]);
    const pay = await one<{ id: string }>(db, `select id from public.payments where event_id = $1 and status = 'posted'`, [events.TKB5EF56GH]);
    await as(db, owner, (tx) => tx.query(`select public.reverse_payment($1, 'Wrong tenant')`, [pay.id]));
    const after = await one<{ b: string }>(db, `select balance_cents as b from public.lease_overview where lease_id = $1`, [leaseB12]);
    expect(Number(after.b) - Number(before.b)).toBe(1_500_000);
    const ev = await one<{ status: string }>(db, `select status from public.payment_events where id = $1`, [events.TKB5EF56GH]);
    expect(ev.status).toBe("unmatched");
    // …and it can be posted again to the right tenant.
    await as(db, owner, (tx) => tx.query(`select public.post_payment($1, $2::jsonb)`, [events.TKB5EF56GH, JSON.stringify([{ lease_id: leaseA3, amount_cents: 1_500_000 }])]));
    const audit = await as(db, owner, (tx) => one<{ n: number }>(tx, `select count(*)::int as n from public.audit_log where entity = 'payments' and org_id = $1`, [org]));
    expect(audit.n).toBeGreaterThanOrEqual(4);
  });

  it("monthly collections exclude reversed payments", async () => {
    const r = await as(db, owner, (tx) =>
      one<{ collected_cents: string; billed_cents: string }>(tx, `select collected_cents, billed_cents from public.monthly_collections where org_id = $1 and period = $2`, [org, thisMonth]),
    );
    expect(Number(r.collected_cents)).toBe(1_500_000 + 2_000_000 + 1_500_000);
    expect(Number(r.billed_cents)).toBe(1_500_000 + 1_200_000 + 800_000);
  });
});

describe("charges and late fees", () => {
  it("adds water and refuses duplicates of recurring charges", async () => {
    await as(db, owner, (tx) => tx.query(`select public.add_charge($1, 'water', 65000, $2::date, 'Water 12 units')`, [leaseB12, today]));
    await as(db, owner, (tx) => tx.query(`select public.add_charge($1, 'garbage', 20000, $2::date)`, [leaseB12, today]));
    await rejects(as(db, owner, (tx) => tx.query(`select public.add_charge($1, 'garbage', 20000, $2::date)`, [leaseB12, today])), /already been added/);
    await rejects(as(db, owner, (tx) => tx.query(`select public.add_charge($1, 'rent', 1, $2::date)`, [leaseB12, today])), /billed automatically/);
  });

  it("applies a late fee once to unpaid rent after the grace period", async () => {
    // A4 pays everything it owes, so it must not be fined.
    const owed = await one<{ b: string }>(db, `select balance_cents as b from public.lease_overview where lease_id = $1`, [leaseA4]);
    const ev = await as(db, owner, (tx) =>
      one<{ r: { inserted: { id: string }[] } }>(tx, `select public.ingest_statement($1, $2, '{}'::jsonb, $3::jsonb) as r`, [
        org,
        building,
        JSON.stringify([{ trans_code: "TKC9PAIDUP", amount_cents: Number(owed.b), occurred_at: `${thisMonth.slice(0, 8)}05T10:00:00+03:00`, account_ref: "A4" }]),
      ]),
    );
    await as(db, owner, (tx) =>
      tx.query(`select public.post_payment($1, $2::jsonb)`, [ev.r.inserted[0].id, JSON.stringify([{ lease_id: leaseA4, amount_cents: Number(owed.b) }])]),
    );
    await db.query(`update public.buildings set late_fee_enabled = true, late_fee_kind = 'percent', late_fee_value = 1000, late_fee_grace_days = 3 where id = $1`, [building]);
    const lateDay = `${thisMonth.slice(0, 8)}20`;
    const n1 = await one<{ n: number }>(db, `select public.apply_late_fees($1::date) as n`, [lateDay]);
    const n2 = await one<{ n: number }>(db, `select public.apply_late_fees($1::date) as n`, [lateDay]);
    expect(n2.n).toBe(0);
    const fees = await db.query<{ lease_id: string; amount_cents: string }>(`select lease_id, amount_cents from public.charges where kind = 'late_fee'`);
    expect(fees.rows.length).toBe(n1.n);
    // B12 and A3 still owe this month's rent → 10% of their rent. A4 is paid up → no fee.
    expect(Number(fees.rows.find((f) => f.lease_id === leaseB12)?.amount_cents)).toBe(150_000);
    expect(Number(fees.rows.find((f) => f.lease_id === leaseA3)?.amount_cents)).toBe(120_000);
    expect(fees.rows.find((f) => f.lease_id === leaseA4)).toBeUndefined();
  });

  it("charge_outstanding follows oldest-debt-first", async () => {
    const c = await one<{ id: string }>(db, `select id from public.charges where lease_id = $1 and kind = 'arrears_bf'`, [leaseB12]);
    const o = await one<{ v: string }>(db, `select public.charge_outstanding($1) as v`, [c.id]);
    expect(Number(o.v)).toBe(0);
  });
});
