/**
 * The demo dataset: "Kasarani Heights", 40 units (A1–A20, B1–B20), 36 tenants.
 * Deterministic (fixed ids, phones and behaviour) so the seed SQL and the
 * sample statement always agree.
 */
import { createHash } from "node:crypto";

export const DEMO = {
  email: "demo@rentflow.co.ke",
  password: "rentflow-demo-2026",
  ownerName: "Demo Landlord",
  orgName: "Kasarani Properties (demo)",
  buildingName: "Kasarani Heights",
  location: "Kasarani, Nairobi",
  paybill: "4012345",
};

/** Stable UUID from a label (name-based, v4-shaped). */
export function uid(label: string): string {
  const h = createHash("sha256").update(`rentflow-demo:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const ORG_ID = uid("org");
export const BUILDING_ID = uid("building");

export const VACANT = new Set(["A7", "A15", "B9", "B18"]);
export const READY = new Set(["B18"]);

const NAMES: Record<string, string> = {
  A1: "Peter Otieno Ochieng", A2: "Mary Atieno Odhiambo", A3: "Samuel Kiptoo Langat", A4: "Grace Wanjiku Njeri",
  A5: "James Mwangi Kariuki", A6: "Faith Muthoni Wambui", A8: "Brian Omondi Owino", A9: "Esther Nyambura Kamau",
  A10: "Kevin Kiprono Rotich", A11: "Lucy Achieng Okoth", A12: "Dennis Mutua Musyoka", A13: "Mercy Chebet Koech",
  A14: "Joseph Njoroge Gitau", A16: "Ann Wairimu Mwangi", A17: "Collins Wafula Barasa", A18: "Diana Moraa Nyaboke",
  A19: "Stephen Kimani Ndungu", A20: "Purity Jepchirchir", B1: "John Kamau Mwangi", B2: "Caroline Akinyi Ouma",
  B3: "Daniel Kipchumba Sang", B4: "Joyce Wangari Maina", B5: "Patrick Mutiso Kioko", B6: "Irene Nafula Simiyu",
  B7: "George Ochieng Onyango", B8: "Beatrice Kerubo Ondieki", B10: "Victor Kibet Cheruiyot", B11: "Rose Wanjiru Kinyua",
  B12: "Martin Njuguna Waweru", B13: "Sharon Adhiambo Otieno", B14: "Felix Kiprotich Bett", B15: "Eunice Wanjala Nekesa",
  B16: "Charles Muriuki Gichuki", B17: "Nancy Kemunto Mogaka", B19: "Isaac Too Kiplagat", B20: "Winnie Atieno Oduor",
};

/** Opening arrears (balance brought forward), KES. */
const ARREARS: Record<string, number> = { A3: 6_000, B12: 15_000, B7: 4_000 };

export interface DemoUnit {
  code: string;
  unitId: string;
  rentCents: number;
  depositCents: number;
}

export interface DemoTenant {
  unit: string;
  tenantId: string;
  leaseId: string;
  name: string;
  phones: string[];
  rentCents: number;
  arrearsCents: number;
}

export const UNITS: DemoUnit[] = (["A", "B"] as const).flatMap((block) =>
  Array.from({ length: 20 }, (_, i) => {
    const code = `${block}${i + 1}`;
    const rent = block === "A" ? 12_000_00 : 15_000_00;
    return { code, unitId: uid(`unit:${code}`), rentCents: rent, depositCents: rent };
  }),
);

/** Safaricom-style numbers: mostly 07xx, some 011x. Canonical 2547XXXXXXXX / 2541XXXXXXXX. */
function phoneFor(i: number, salt = 0): string {
  const n = 10_000_000 + (((i + 1) * 7_654_321 + salt * 1_111_111) % 89_999_999);
  return (i + salt) % 6 === 5 ? `25411${String(n).slice(1)}` : `2547${n}`;
}

export const TENANTS: DemoTenant[] = UNITS.filter((u) => !VACANT.has(u.code)).map((u, i) => ({
  unit: u.code,
  tenantId: uid(`tenant:${u.code}`),
  leaseId: uid(`lease:${u.code}`),
  name: NAMES[u.code],
  phones: i % 7 === 3 ? [phoneFor(i), phoneFor(i, 5)] : [phoneFor(i)],
  rentCents: u.rentCents,
  arrearsCents: (ARREARS[u.code] ?? 0) * 100,
}));

export const T = Object.fromEntries(TENANTS.map((t) => [t.unit, t])) as Record<string, DemoTenant>;

/** Phones of people who pay for a tenant (learned from earlier confirmations). */
export const RELATIVES = {
  B3: { phone: "254790123456", name: "PAUL KIPCHUMBA SANG" },
};

export interface DemoPayment {
  code: string;
  /** Month offset from the current month (−2, −1, 0). */
  month: number;
  day: number;
  time: string;
  amountCents: number;
  phone: string | null;
  name: string;
  ref: string;
  /** Unit(s) it's for; null when it should land in the inbox. */
  for: string[] | null;
}

const REF_STYLES = [(c: string) => c, (c: string) => c.toLowerCase(), (c: string) => `HSE ${c}`, (c: string) => `${c} rent`, (c: string) => c.replace(/(\D)(\d)/, "$1-$2")];

/** Deterministic M-Pesa-style receipt code (10 chars) for a payment. */
function code(key: string): string {
  const h = createHash("sha256").update(`receipt:${key}`).digest();
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let out = "T";
  for (let i = 0; i < 9; i++) out += alpha[h[i] % alpha.length];
  return out;
}

/** Payments for a month. Behaviour per tenant gives a realistic mix. */
export function paymentsFor(month: number, maxDay: number): DemoPayment[] {
  const out: DemoPayment[] = [];
  const day = (d: number) => Math.max(1, Math.min(d, maxDay));
  TENANTS.forEach((t, i) => {
    const upper = t.name.toUpperCase();
    const own = t.phones[0];
    const ref = REF_STYLES[i % REF_STYLES.length](t.unit);
    const d = day(1 + (i % 7));
    const time = `${String(7 + (i % 12)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`;
    const p = (amountCents: number, extra: Partial<DemoPayment> = {}) =>
      out.push({ code: code(`${month}:${t.unit}:1`), month, day: d, time, amountCents, phone: own, name: upper, ref, for: [t.unit], ...extra });

    switch (t.unit) {
      case "B7": // George has stopped paying
        return;
      case "A10":
      case "B20": // missed last month
        if (month === -1) return;
        return p(t.rentCents);
      case "A18": // always short
        return p(10_000_00);
      case "A5": // pays in two parts
        p(7_000_00);
        return p(t.rentCents - 7_000_00, { code: code(`${month}:${t.unit}:2`), day: day(d + 9) });
      case "B15": // paid three months up front
        return month === -2 ? p(t.rentCents * 3) : undefined;
      case "B3": // brother pays, no account
        return p(t.rentCents, { phone: RELATIVES.B3.phone, name: RELATIVES.B3.name, ref: "" });
      case "A12": // employer pays with the right code
        return p(t.rentCents, { phone: null, name: "NAIROBI WATER STAFF SACCO", ref: "A12" });
      case "A3": // pays rent plus some arrears
        return p(t.rentCents + 2_000_00);
      default:
        if (month === 0 && i % 5 === 4) return; // some haven't paid yet this month
        return p(t.rentCents);
    }
  });
  return out;
}

/** This month's extra puzzles for the inbox (sample statement only). */
export function trickyPayments(maxDay: number): DemoPayment[] {
  const d = (x: number) => Math.max(1, Math.min(x, maxDay));
  return [
    // Rose typed her neighbour's unit.
    { code: "TKZ9WRONG1", month: 0, day: d(3), time: "19:02:11", amountCents: 15_000_00, phone: T.B11.phones[0], name: "ROSE WANJIRU KINYUA", ref: "B17", for: null },
    // A stranger pays an exact rent amount with no account.
    { code: "TKZ9UNKN02", month: 0, day: d(4), time: "08:41:09", amountCents: 15_000_00, phone: "254768001122", name: "JANE NJERI", ref: "", for: null },
    // Esther's partner, new number, only a name to go on.
    { code: "TKZ9NAME03", month: 0, day: d(5), time: "12:15:44", amountCents: 12_000_00, phone: "254757333444", name: "ESTHER NYAMBURA", ref: "", for: null },
    // Misspelled code from a new phone, but the name fits: matched automatically.
    { code: "TKZ9LOOK04", month: 0, day: d(2), time: "21:30:00", amountCents: 15_000_00, phone: "254799000555", name: "ISAAC TOO KIPLAGAT", ref: "BI9", for: ["B19"] },
  ];
}
