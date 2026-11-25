import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { todayNairobi } from "../../src/core/period";
import { as, createDb, createUser, rejects } from "./db";

let db: PGlite;
let owner: string;
let staff: string;
let org: string;
let lease: string;

const one = async <T>(q: Promise<{ rows: T[] }>) => (await q).rows[0];
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.com", "Jane Landlord");
  staff = await createUser(db, "agent@rentflow.co.ke", "Field Agent");
  await db.query(`insert into public.platform_admins (user_id) values ($1)`, [staff]);
  org = (await as(db, owner, (tx) => one<{ id: string }>(tx.query(`select public.create_org('Sunrise') as id`)))).id;
  const b = (
    await as(db, owner, (tx) =>
      one<{ id: string }>(
        tx.query(`select public.create_building($1, 'Sunrise Apartments', null, 5, null, $2::jsonb, null) as id`, [
          org,
          JSON.stringify([{ code: "A1", rent_cents: 1_000_000 }, { code: "A2", rent_cents: 1_000_000 }]),
        ]),
      ),
    )
  ).id;
  await as(db, owner, (tx) => tx.query(`select public.import_tenants($1, $2::jsonb)`, [b, JSON.stringify([{ unit_code: "A1", full_name: "Tom Mboya", phones: [], rent_cents: 1_000_000 }])]));
  lease = (await one<{ id: string }>(db.query(`select id from public.leases limit 1`))).id;
});

describe("past tenants", () => {
  it("a tenant who moved out owing can still pay it off in cash", async () => {
    await as(db, owner, (tx) => tx.query(`select public.end_tenancy($1, $2::date)`, [lease, todayNairobi()]));
    const before = await one<{ b: number }>(db.query(`select balance_cents as b from public.lease_overview where lease_id = $1`, [lease]));
    expect(Number(before.b)).toBe(1_000_000);
    await as(db, owner, (tx) => tx.query(`select public.record_cash_payment($1, 400000, $2::date)`, [lease, todayNairobi()]));
    const after = await one<{ b: number; status: string }>(db.query(`select balance_cents as b, status from public.lease_overview where lease_id = $1`, [lease]));
    expect(after).toEqual({ b: 600_000, status: "ended" });
  });
});

describe("subscriptions", () => {
  it("new accounts start on a 30-day trial", async () => {
    const s = await one<{ status: string; trial_ends: string }>(db.query(`select status, trial_ends::text from public.subscriptions where org_id = $1`, [org]));
    expect(s.status).toBe("trial");
    expect(s.trial_ends).toBe(addDays(todayNairobi(), 30));
  });

  it("shows Free for free accounts and prices paid plans per unit", async () => {
    let row = await as(db, staff, (tx) => one<{ billing: string; monthly_cents: number }>(tx.query(`select billing, monthly_cents from public.admin_billing() where org_id = $1`, [org])));
    expect(row).toMatchObject({ billing: "free", monthly_cents: 0 });
    await as(db, staff, (tx) => tx.query(`select public.set_org_plan($1, 'growth')`, [org]));
    await as(db, staff, (tx) => tx.query(`select public.admin_set_plan_price('growth', 15000)`));
    row = await as(db, staff, (tx) => one<{ billing: string; monthly_cents: number }>(tx.query(`select billing, monthly_cents from public.admin_billing() where org_id = $1`, [org])));
    expect(row).toMatchObject({ billing: "trial", monthly_cents: 2 * 15000 });
  });

  it("recording a payment moves 'paid up to' forward and marks it paid", async () => {
    const today = todayNairobi();
    const until = await as(db, staff, (tx) =>
      one<{ d: string }>(tx.query(`select public.admin_record_subscription_payment($1, 30000, $2::date, 1, 'mpesa', 'TKX1', null)::text as d`, [org, today])),
    );
    const again = await as(db, staff, (tx) =>
      one<{ d: string }>(tx.query(`select public.admin_record_subscription_payment($1, 60000, $2::date, 2, 'mpesa', 'TKX2', null)::text as d`, [org, today])),
    );
    expect(again.d > until.d).toBe(true);
    const row = await as(db, staff, (tx) => one<{ billing: string; total_paid_cents: number }>(tx.query(`select billing, total_paid_cents from public.admin_billing() where org_id = $1`, [org])));
    expect(row).toMatchObject({ billing: "paid", total_paid_cents: 90000 });
  });

  it("shows overdue once the paid-up date has passed, and cancelled when cancelled", async () => {
    await db.query(`update public.subscriptions set paid_until = $2::date where org_id = $1`, [org, addDays(todayNairobi(), -1)]);
    let row = await as(db, staff, (tx) => one<{ billing: string }>(tx.query(`select billing from public.admin_billing() where org_id = $1`, [org])));
    expect(row.billing).toBe("overdue");
    await as(db, staff, (tx) => tx.query(`select public.admin_update_subscription($1, 'cancelled', null, null, 'Moved to another app')`, [org]));
    row = await as(db, staff, (tx) => one<{ billing: string }>(tx.query(`select billing from public.admin_billing() where org_id = $1`, [org])));
    expect(row.billing).toBe("cancelled");
    const b = await as(db, staff, (tx) => one<{ plan: string; billing: string }>(tx.query(`select plan, billing from public.admin_buildings()`)));
    expect(b).toEqual({ plan: "growth", billing: "cancelled" });
  });

  it("only staff can see or change billing; owners can read their own subscription", async () => {
    await rejects(as(db, owner, (tx) => tx.query(`select * from public.admin_billing()`)), /permission/);
    await rejects(as(db, owner, (tx) => tx.query(`select public.admin_record_subscription_payment($1, 1, $2::date, 1, 'cash')`, [org, todayNairobi()])), /permission/);
    await rejects(as(db, owner, (tx) => tx.query(`update public.subscriptions set paid_until = '2099-01-01'`)), /permission denied/);
    const own = await as(db, owner, (tx) => tx.query(`select org_id from public.subscriptions`));
    expect(own.rows).toHaveLength(1);
  });
});
