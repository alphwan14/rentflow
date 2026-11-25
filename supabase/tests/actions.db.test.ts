import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { todayNairobi } from "../../src/core/period";
import { as, createDb, createUser, rejects } from "./db";

let db: PGlite;
let owner: string;
let staff: string;
let stranger: string;
let org: string;
let lease: string;

const one = async <T>(q: Promise<{ rows: T[] }>) => (await q).rows[0];

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.com", "Jane Landlord");
  staff = await createUser(db, "staff@rentflow.co.ke", "Field Agent");
  stranger = await createUser(db, "stranger@example.com");
  await db.query(`insert into public.platform_admins (user_id) values ($1)`, [staff]);
  org = (await as(db, owner, (tx) => one<{ id: string }>(tx.query(`select public.create_org('Sunrise') as id`)))).id;
  const b = (
    await as(db, owner, (tx) =>
      one<{ id: string }>(
        tx.query(`select public.create_building($1, 'Sunrise Apartments', null, 5, null, $2::jsonb, null) as id`, [
          org,
          JSON.stringify([{ code: "B12", rent_cents: 1_500_000 }, { code: "B13", rent_cents: 1_500_000 }]),
        ]),
      ),
    )
  ).id;
  await as(db, owner, (tx) =>
    tx.query(`select public.import_tenants($1, $2::jsonb)`, [b, JSON.stringify([{ unit_code: "B12", full_name: "Jane Wanjiru", phones: ["254712345678"], rent_cents: 1_500_000 }])]),
  );
  lease = (await one<{ id: string }>(db.query(`select id from public.leases limit 1`))).id;
});

describe("cash payments", () => {
  it("posts straight to the tenant and clears the bill", async () => {
    await as(db, owner, (tx) => tx.query(`select public.record_cash_payment($1, 1500000, $2::date, 'Paid at the gate')`, [lease, todayNairobi()]));
    const o = await one<{ balance_cents: number }>(db.query(`select balance_cents from public.lease_overview where lease_id = $1`, [lease]));
    expect(Number(o.balance_cents)).toBe(0);
    const p = await one<{ method: string; match_method: string }>(db.query(`select method, match_method from public.payments where lease_id = $1`, [lease]));
    expect(p).toEqual({ method: "cash", match_method: "manual" });
  });
  it("refuses future dates, zero amounts and strangers", async () => {
    await rejects(as(db, owner, (tx) => tx.query(`select public.record_cash_payment($1, 100, '2999-01-01')`, [lease])), /future/);
    await rejects(as(db, owner, (tx) => tx.query(`select public.record_cash_payment($1, 0, $2::date)`, [lease, todayNairobi()])), /how much/);
    await rejects(as(db, stranger, (tx) => tx.query(`select public.record_cash_payment($1, 100, $2::date)`, [lease, todayNairobi()])), /permission/);
  });
});

describe("reminders", () => {
  it("queues one SMS a day to the tenant's phone", async () => {
    await as(db, owner, (tx) => tx.query(`select public.queue_message($1, 'reminder', 'Hi Jane')`, [lease]));
    await rejects(as(db, owner, (tx) => tx.query(`select public.queue_message($1, 'reminder', 'Hi again')`, [lease])), /already reminded/);
    const m = await one<{ to_phone: string; status: string }>(db.query(`select to_phone, status from public.messages where kind = 'reminder'`));
    expect(m).toEqual({ to_phone: "254712345678", status: "queued" });
  });
});

describe("internal admin", () => {
  it("staff see every account; landlords can't", async () => {
    const rows = await as(db, staff, (tx) => tx.query<{ name: string; units: number; tenants: number; owner_email: string }>(`select * from public.admin_landlords()`));
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ name: "Sunrise", units: 2, tenants: 1, owner_email: "owner@example.com" });
    const b = await as(db, staff, (tx) => tx.query<{ filled: number }>(`select * from public.admin_buildings()`));
    expect(b.rows[0].filled).toBe(1);
    const sms = await as(db, staff, (tx) => tx.query<{ queued: number }>(`select * from public.admin_sms_usage()`));
    expect(sms.rows[0].queued).toBe(1);
    const agents = await as(db, staff, (tx) => tx.query(`select * from public.admin_agents()`));
    expect(agents.rows).toHaveLength(1);
    await rejects(as(db, owner, (tx) => tx.query(`select * from public.admin_landlords()`)), /permission/);
  });
});

describe("move out", () => {
  it("ends the tenancy and empties the unit", async () => {
    await rejects(as(db, owner, (tx) => tx.query(`select public.end_tenancy($1, '2000-01-01')`, [lease])), /after they moved in/);
    await as(db, owner, (tx) => tx.query(`select public.end_tenancy($1, $2::date)`, [lease, todayNairobi()]));
    const u = await one<{ status: string }>(db.query(`select u.status from public.units u join public.leases l on l.unit_id = u.id where l.id = $1`, [lease]));
    expect(u.status).toBe("vacant");
    await rejects(as(db, owner, (tx) => tx.query(`select public.end_tenancy($1, $2::date)`, [lease, todayNairobi()])), /already moved out/);
  });
});
