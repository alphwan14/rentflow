"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { stubNotebookReader } from "@/core/import/notebook";
import { parseTenantRows, splitPasted, type Field as ColField } from "@/core/import/tenants";
import { canonCode } from "@/core/matching/account-ref";
import { formatKES } from "@/core/money";
import { formatPhone } from "@/core/phone";
import { parseCsv } from "@/core/sources/csv";
import { importTenants } from "@/server/actions/tenants";
import { Button, Card, Notice, cx, inputClass } from "@/ui";

const COLUMN: Record<ColField, string> = {
  unit: "Unit",
  name: "Name",
  phone: "Phone",
  idNumber: "ID number",
  rent: "Rent",
  deposit: "Deposit",
  balance: "Owed before RentFlow",
  startDate: "Moved in",
  ignore: "Don't use",
};

type Source = "paste" | "file" | "photo";

/** Add tenants from a pasted list, an Excel/CSV file or a notebook photo, with a preview to fix mistakes. */
export function TenantImport({
  buildingId,
  units,
  occupied,
  nextHref,
  submitLabel = "Add tenants",
}: {
  buildingId: string;
  units: { code: string; rent_cents: number }[];
  occupied: string[];
  nextHref: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState<Source>("paste");
  const [text, setText] = useState("");
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [fields, setFields] = useState<ColField[] | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const known = useMemo(() => units.map((u) => u.code), [units]);
  const rents = useMemo(() => new Map(units.filter((u) => u.rent_cents > 0).map((u) => [canonCode(u.code), u.rent_cents])), [units]);
  const occupiedSet = useMemo(() => new Set(occupied.map(canonCode)), [occupied]);

  const parsed = useMemo(() => {
    if (!raw) return null;
    const r = parseTenantRows(raw, { knownUnits: known, defaultRentCents: rents, fields: fields ?? undefined, hasHeader });
    for (const row of r.rows) {
      row.errors = row.errors.map(plainError);
      row.warnings = row.warnings.map(plainError);
      if (row.unitCode && occupiedSet.has(canonCode(row.unitCode))) row.errors.push(`${row.unitCode} already has a tenant`);
    }
    return r;
  }, [raw, fields, hasHeader, known, rents, occupiedSet]);

  const load = (rows: string[][]) => {
    setError(null);
    if (!rows.length) return setError("We didn't find any tenants there. Check the list and try again.");
    const first = parseTenantRows(rows, { knownUnits: known, defaultRentCents: rents });
    setRaw(rows);
    setFields(first.fields);
    setHasHeader(first.hasHeader);
  };

  async function onFile(file: File) {
    setError(null);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const rows = await readSheet(file);
        load(rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)))));
      } else load(parseCsv(await file.text()));
    } catch {
      setError("We couldn't open that file. Save it as Excel (.xlsx) or CSV and try again.");
    }
  }

  async function onPhoto(file: File) {
    setError(null);
    try {
      load(await stubNotebookReader.read({ bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const edit = (rawIdx: number, col: number, value: string) => setRaw((prev) => prev && prev.map((r, i) => (i === rawIdx ? Object.assign([...r], { [col]: value }) : r)));
  const removeRow = (rawIdx: number) => setRaw((prev) => prev && prev.filter((_, i) => i !== rawIdx));

  const rows = parsed?.rows ?? [];
  const bad = rows.filter((r) => r.errors.length).length;

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await importTenants(
        buildingId,
        rows.map((r) => ({
          unitCode: r.unitCode,
          name: r.name,
          phones: r.phones,
          idNumber: r.idNumber,
          rentCents: r.rentCents,
          depositCents: r.depositCents,
          openingBalanceCents: r.openingBalanceCents,
          startDate: r.startDate,
        })),
      );
      if (!res.ok) return setError(res.error);
      router.push(nextHref);
    });

  if (!raw || !parsed) {
    return (
      <Card className="p-6">
        <div className="mb-5 flex gap-1 rounded-xl bg-page p-1" role="tablist" aria-label="How to add tenants">
          {(
            [
              ["paste", "Type or paste"],
              ["file", "Excel file"],
              ["photo", "Notebook photo"],
            ] as [Source, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={source === k}
              onClick={() => setSource(k)}
              className={cx("h-10 flex-1 rounded-lg text-[13px] font-medium sm:text-[15px]", source === k ? "bg-card shadow-[0_1px_2px_rgba(15,17,21,0.06)]" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>

        {source === "paste" && (
          <div className="space-y-4">
            <label htmlFor="paste" className="block text-[13px] font-medium">
              One tenant per line
            </label>
            <textarea
              id="paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={"A1  Peter Otieno  0733 444 555  12000\nA2  Mary Atieno  0700 999 888  12000  2500"}
              className={cx(inputClass, "h-auto py-3 font-mono text-[13px] leading-6")}
            />
            <p className="text-[13px] text-muted">Unit, name, phone and rent. Add what they owed before, if anything. Any order works, and you can copy straight from Excel or WhatsApp.</p>
            <Button size="lg" onClick={() => load(splitPasted(text))} disabled={!text.trim()}>
              Check the list
            </Button>
          </div>
        )}
        {source === "file" && (
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center hover:bg-page">
            <span className="text-[15px] font-medium">Choose an Excel or CSV file</span>
            <span className="text-[13px] text-muted">Columns like Unit, Name, Phone and Rent are found automatically</span>
            <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        )}
        {source === "photo" && (
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center hover:bg-page">
            <span className="text-[15px] font-medium">Take a photo of the caretaker&apos;s notebook</span>
            <span className="text-[13px] text-muted">RentFlow reads it, then you fix anything it got wrong</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
          </label>
        )}
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 p-6 pb-4">
          <div>
            <h2 className="text-[15px] font-semibold">
              {rows.length} {rows.length === 1 ? "tenant" : "tenants"} found
            </h2>
            <p className="text-[15px] text-muted">{bad ? `${bad} ${bad === 1 ? "line needs" : "lines need"} fixing. Edit the red lines below.` : "Check the names and amounts, then save."}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setRaw(null)}>
            Start again
          </Button>
        </div>

        {/* Each tenant as a small editable card: works at 360 px. */}
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => {
            const rawIdx = r.line - 1;
            return (
              <li key={rawIdx} className={cx("px-6 py-4", r.errors.length > 0 && "bg-unpaid-soft/50")}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(fields ?? []).map((f, col) =>
                    f === "ignore" ? null : (
                      <label key={col} className="block">
                        <span className="text-[13px] text-muted">{COLUMN[f]}</span>
                        <input value={raw[rawIdx]?.[col] ?? ""} onChange={(e) => edit(rawIdx, col, e.target.value)} className={cx(inputClass, "h-11")} />
                      </label>
                    ),
                  )}
                </div>
                <div className="mt-2 flex items-start justify-between gap-3 text-[13px]">
                  {r.errors.length ? (
                    <span className="text-unpaid">{r.errors.join(". ")}.</span>
                  ) : (
                    <span className="text-muted">
                      {r.unitCode} · {r.name}
                      {r.phones.length > 0 && ` · ${r.phones.map(formatPhone).join(", ")}`}
                      {r.rentCents !== null && ` · rent ${formatKES(r.rentCents)}`}
                      {!!r.openingBalanceCents && r.openingBalanceCents > 0 && ` · owed ${formatKES(r.openingBalanceCents)} before`}
                      {r.warnings.length > 0 && <span className="block text-partial">{r.warnings.join(". ")}.</span>}
                    </span>
                  )}
                  <button type="button" onClick={() => removeRow(rawIdx)} className="min-h-11 shrink-0 px-2 text-muted hover:text-unpaid">
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <details className="rounded-2xl border border-line bg-card px-6 py-4">
        <summary className="min-h-11 cursor-pointer content-center text-[15px]">Columns look wrong?</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" className="size-5" checked={!!parsed.hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            The first line is headings
          </label>
          {(fields ?? []).map((f, i) => (
            <label key={i} className="block">
              <span className="text-[13px] text-muted">
                Column {i + 1} {raw[parsed.hasHeader ? 0 : 0]?.[i] ? `(“${raw[0][i]}”)` : ""}
              </span>
              <select value={f} onChange={(e) => setFields((prev) => prev && prev.map((x, j) => (j === i ? (e.target.value as ColField) : x)))} className={cx(inputClass, "h-11")}>
                {Object.entries(COLUMN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>

      {error && <Notice>{error}</Notice>}
      <Button size="lg" className="w-full sm:w-auto" onClick={submit} disabled={pending || bad > 0 || rows.length === 0}>
        {pending ? "Saving…" : `${submitLabel} (${rows.length})`}
      </Button>
    </div>
  );
}

/** The import parser's messages, in landlord words. */
function plainError(m: string): string {
  return m
    .replace("isn't in this building", "isn't one of this building's units")
    .replace(/^Missing unit$/, "Add the unit")
    .replace(/^Missing name$/, "Add the name")
    .replace(/^Missing rent$/, "Add the rent")
    .replace("No phone number: receipts and reminders can't be sent", "No phone, so no SMS receipts or reminders")
    .replace(/isn't an amount/, "isn't an amount in shillings");
}
