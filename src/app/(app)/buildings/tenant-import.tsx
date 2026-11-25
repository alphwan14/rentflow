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
import { Alert, Button, Card, cx, inputClass } from "@/ui";

const FIELD_LABEL: Record<ColField, string> = {
  unit: "Unit",
  name: "Name",
  phone: "Phone",
  idNumber: "ID number",
  rent: "Rent",
  deposit: "Deposit",
  balance: "Owed before (b/f)",
  startDate: "Moved in",
  ignore: "Skip column",
};

type Source = "paste" | "file" | "photo";

export function TenantImport({
  buildingId,
  units,
  occupied,
  nextHref,
}: {
  buildingId: string;
  units: { code: string; rent_cents: number }[];
  occupied: string[];
  nextHref: string;
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
    for (const row of r.rows) if (row.unitCode && occupiedSet.has(canonCode(row.unitCode))) row.errors.push(`${row.unitCode} already has a tenant`);
    return r;
  }, [raw, fields, hasHeader, known, rents, occupiedSet]);

  const load = (rows: string[][]) => {
    setError(null);
    if (!rows.length) return setError("Nothing found to import.");
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
      } else {
        load(parseCsv(await file.text()));
      }
    } catch {
      setError("Couldn't read that file. Save it as .xlsx or .csv and try again.");
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

  const edit = (rawIdx: number, col: number, value: string) =>
    setRaw((prev) => prev && prev.map((r, i) => (i === rawIdx ? Object.assign([...r], { [col]: value }) : r)));
  const removeRow = (rawIdx: number) => setRaw((prev) => prev && prev.filter((_, i) => i !== rawIdx));

  const rows = parsed?.rows ?? [];
  const bad = rows.filter((r) => r.errors.length).length;
  const cols = (fields ?? []).map((f, i) => ({ f, i })).filter((c) => c.f !== "ignore");

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

  return (
    <div className="space-y-4">
      {!raw && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex gap-1 rounded-full bg-page p-1" role="tablist">
            {(
              [
                ["paste", "Paste a list"],
                ["file", "Excel or CSV"],
                ["photo", "Notebook photo"],
              ] as [Source, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={source === k}
                onClick={() => setSource(k)}
                className={cx("h-8 flex-1 rounded-full text-[13px] font-medium", source === k ? "bg-card shadow-sm" : "text-ink-2")}
              >
                {label}
              </button>
            ))}
          </div>

          {source === "paste" && (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={"A1  Peter Otieno  0733 444 555  12000\nA2  Mary Atieno  0700 999 888  12000  2500\n…"}
                className={cx(inputClass, "h-auto py-3 font-mono text-[13px]")}
              />
              <p className="text-[12px] text-muted">One tenant per line: unit, name, phone, rent, and anything they owed before. Any order works; copy straight from Excel or WhatsApp.</p>
              <Button type="button" onClick={() => load(splitPasted(text))} disabled={!text.trim()}>
                Read list
              </Button>
            </div>
          )}
          {source === "file" && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center hover:bg-page">
              <span className="text-[14px] font-medium">Choose an Excel or CSV file</span>
              <span className="text-[12px] text-muted">Columns like Unit, Name, Phone, Rent, Balance are recognised automatically</span>
              <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          )}
          {source === "photo" && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center hover:bg-page">
              <span className="text-[14px] font-medium">Take a photo of the caretaker&apos;s notebook</span>
              <span className="text-[12px] text-muted">RentFlow reads it and you correct anything it got wrong</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            </label>
          )}
          {error && (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          )}
        </Card>
      )}

      {raw && parsed && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 className="text-[15px] font-semibold">
                <span className="num">{rows.length}</span> tenants found
              </h2>
              <p className="text-[13px] text-muted">
                {bad ? `${bad} need fixing. Edit the red cells below.` : "Everything looks right. Check the names and amounts, then import."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={!!parsed.hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                First row is headings
              </label>
              <Button variant="ghost" size="sm" type="button" onClick={() => setRaw(null)}>
                Start over
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-y border-line bg-page/60">
                  {(fields ?? []).map((f, i) => (
                    <th key={i} className="px-2 py-2 text-left font-medium">
                      <select
                        aria-label={`Column ${i + 1}`}
                        value={f}
                        onChange={(e) => setFields((prev) => prev && prev.map((x, j) => (j === i ? (e.target.value as ColField) : x)))}
                        className="h-8 rounded-lg border border-line bg-card px-2 text-[12px]"
                      >
                        {Object.entries(FIELD_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left font-medium text-muted">Reads as</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const rawIdx = r.line - 1;
                  return (
                    <tr key={rawIdx} className={r.errors.length ? "bg-unpaid-soft/40" : undefined}>
                      {(fields ?? []).map((f, col) => (
                        <td key={col} className="px-2 py-1.5">
                          {f === "ignore" ? (
                            <span className="text-muted">{raw[rawIdx]?.[col]}</span>
                          ) : (
                            <input
                              value={raw[rawIdx]?.[col] ?? ""}
                              onChange={(e) => edit(rawIdx, col, e.target.value)}
                              className="h-8 w-full min-w-20 rounded-lg border border-transparent bg-transparent px-2 hover:border-line focus:border-accent focus:bg-card focus:outline-none"
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-[12px]">
                        {r.errors.length ? (
                          <span className="text-unpaid">{r.errors.join(" · ")}</span>
                        ) : (
                          <span className="text-ink-2">
                            {r.unitCode} · {r.name}
                            {r.phones.length > 0 && <> · {r.phones.map(formatPhone).join(", ")}</>}
                            {r.rentCents !== null && <> · {formatKES(r.rentCents)}</>}
                            {!!r.openingBalanceCents && <> · owes {formatKES(r.openingBalanceCents)} b/f</>}
                            {r.warnings.length > 0 && <span className="block text-partial">{r.warnings.join(" · ")}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-2">
                        <button type="button" onClick={() => removeRow(rawIdx)} className="text-[12px] text-muted hover:text-unpaid" aria-label={`Remove row ${r.line}`}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cols.length === 0 && <p className="px-5 py-3 text-[13px] text-unpaid">Tell RentFlow which column is which using the menus above.</p>}

          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {error ? <Alert>{error}</Alert> : <span className="text-[13px] text-muted">Rent is billed from the month you chose for this building.</span>}
            <Button type="button" onClick={submit} disabled={pending || bad > 0 || rows.length === 0}>
              {pending ? "Importing…" : `Import ${rows.length} tenants`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
