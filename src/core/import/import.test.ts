import { describe, expect, it } from "vitest";
import { kes } from "../money";
import { blocksPattern, expandUnitPattern } from "./unit-pattern";
import { parseTenantRows, splitPasted, titleCase } from "./tenants";

describe("expandUnitPattern", () => {
  it("A1-A20, B1-B20 gives 40 units", () => {
    const u = expandUnitPattern("A1-A20, B1-B20");
    expect(u).toHaveLength(40);
    expect(u.slice(0, 3)).toEqual(["A1", "A2", "A3"]);
    expect(u.at(-1)).toBe("B20");
  });
  it("keeps zero padding and accepts en-dashes", () => {
    expect(expandUnitPattern("A01–A03")).toEqual(["A01", "A02", "A03"]);
  });
  it("supports plain numbers, short ranges and letter ranges", () => {
    expect(expandUnitPattern("1-3")).toEqual(["1", "2", "3"]);
    expect(expandUnitPattern("C1-5")).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(expandUnitPattern("1A-1D")).toEqual(["1A", "1B", "1C", "1D"]);
  });
  it("mixes literals", () => {
    expect(expandUnitPattern("Shop 1, Shop 2\nG1 to G2")).toEqual(["SHOP 1", "SHOP 2", "G1", "G2"]);
  });
  it("rejects duplicates and backwards ranges", () => {
    expect(() => expandUnitPattern("A1-A3, A03")).toThrow(/Duplicate/);
    expect(() => expandUnitPattern("A5-A1")).toThrow(/backwards/);
  });
  it("builds a pattern from blocks", () => {
    expect(blocksPattern(["a", "B"], 20)).toBe("A1-A20, B1-B20");
  });
});

const units = expandUnitPattern("A1-A20, B1-B20");

describe("parseTenantRows: Excel with headers", () => {
  it("maps headers and validates against the building", () => {
    const { rows, fields } = parseTenantRows(
      [
        ["House No", "Tenant Name", "Phone", "Phone 2", "Rent", "Deposit", "Bal B/F"],
        ["b12", "JOHN KAMAU MWANGI", "0712 345 678", "", 15000, 15000, 3000],
        ["A2", "mary atieno", "0700999888 / 0790123456", "", "12,000", "", ""],
        ["C1", "Nobody", "", "", "9000", "", ""],
      ],
      { knownUnits: units },
    );
    expect(fields).toEqual(["unit", "name", "phone", "phone", "rent", "deposit", "balance"]);
    expect(rows[0]).toMatchObject({
      unitCode: "B12",
      name: "John Kamau Mwangi",
      phones: ["254712345678"],
      rentCents: kes(15_000),
      depositCents: kes(15_000),
      openingBalanceCents: kes(3_000),
      errors: [],
    });
    expect(rows[1].phones).toEqual(["254700999888", "254790123456"]);
    expect(rows[2].errors).toContain("Unit C1 isn't in this building");
    expect(rows[2].warnings[0]).toMatch(/No phone/);
  });
});

describe("parseTenantRows: pasted notebook list", () => {
  it("guesses columns with no header", () => {
    const pasted = splitPasted(`A1 Peter Otieno 0733 444 555 12000
A2 Mary Atieno 0700999888 12000 2500
B12 John Kamau 0712345678 15000`);
    const { rows, hasHeader } = parseTenantRows(pasted, { knownUnits: units });
    expect(hasHeader).toBe(false);
    expect(rows.map((r) => [r.unitCode, r.name, r.phones[0], r.rentCents])).toEqual([
      ["A1", "Peter Otieno", "254733444555", kes(12_000)],
      ["A2", "Mary Atieno", "254700999888", kes(12_000)],
      ["B12", "John Kamau", "254712345678", kes(15_000)],
    ]);
    expect(rows[1].openingBalanceCents).toBe(kes(2_500));
  });

  it("handles tab-separated paste from a spreadsheet", () => {
    const { rows } = parseTenantRows(splitPasted("Unit\tName\tPhone\tRent\nA3\tSamuel Kiptoo\t0711000111\t12000"), { knownUnits: units });
    expect(rows[0]).toMatchObject({ unitCode: "A3", name: "Samuel Kiptoo", rentCents: kes(12_000) });
  });

  it("flags the same unit twice", () => {
    const { rows } = parseTenantRows(splitPasted("A1, Ann, 0711111111, 9000\nA1, Ben, 0722222222, 9000"), { knownUnits: units });
    expect(rows[0].errors[0]).toMatch(/appears 2 times/);
  });

  it("falls back to the unit's rent when the list has none", () => {
    const { rows } = parseTenantRows(splitPasted("Unit,Name,Phone\nB1,Lucy Wambui,0722333444"), {
      knownUnits: units,
      defaultRentCents: new Map([["B1", kes(14_000)]]),
    });
    expect(rows[0].rentCents).toBe(kes(14_000));
    expect(rows[0].errors).toEqual([]);
  });
});

describe("titleCase", () => {
  it("handles apostrophes and hyphens", () => {
    expect(titleCase("JOHN O'NEIL KAMAU-MWANGI")).toBe("John O'Neil Kamau-Mwangi");
  });
});
