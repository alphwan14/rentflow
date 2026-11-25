"use client";

import { useActionState, useMemo, useState } from "react";
import { UnitPatternError, expandUnitPattern } from "@/core/import/unit-pattern";
import { addMonths, formatPeriod, periodOf, todayNairobi } from "@/core/period";
import { UNIT_LIMIT, type Plan } from "@/core/plans";
import { createBuilding, type BuildingFormState } from "@/server/actions/buildings";
import { Alert, Card, Field, cx, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";

const PRESETS = ["A1-A20, B1-B20", "1-24", "G1-G4, 1A-1D, 2A-2D"];

export function BuildingForm({ onboarding = false, plan }: { onboarding?: boolean; plan: Plan }) {
  const [state, action] = useActionState<BuildingFormState, FormData>(createBuilding, undefined);
  const [pattern, setPattern] = useState("A1-A20, B1-B20");
  const [kind, setKind] = useState<"paybill" | "till" | "bank">("paybill");
  const months = useMemo(() => {
    const now = periodOf(todayNairobi());
    return Array.from({ length: 7 }, (_, i) => addMonths(now, -i));
  }, []);

  const preview = useMemo(() => {
    try {
      const codes = expandUnitPattern(pattern);
      return { codes, error: null as string | null };
    } catch (e) {
      return { codes: [] as string[], error: e instanceof UnitPatternError ? e.message : "Couldn't read that" };
    }
  }, [pattern]);
  const limit = UNIT_LIMIT[plan];
  const overLimit = limit !== null && preview.codes.length > limit;
  const err = (f: string) => (state?.field === f ? state.error : null);

  return (
    <form action={action} className="mt-6 space-y-4">
      {onboarding && <input type="hidden" name="onboarding" value="1" />}
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Building name" htmlFor="name" error={err("name")}>
            <input id="name" name="name" required placeholder="Kasarani Heights" className={inputClass} />
          </Field>
          <Field label="Location" htmlFor="location">
            <input id="location" name="location" placeholder="Kasarani, Nairobi" className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Where tenants pay</h2>
          <p className="text-[13px] text-muted">The landlord&apos;s own account. RentFlow never holds the money.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-page p-1" role="radiogroup" aria-label="Payment method">
          {(["paybill", "till", "bank"] as const).map((k) => (
            <label key={k} className={cx("flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium", kind === k ? "bg-card shadow-sm" : "text-ink-2")}>
              <input type="radio" name="channel_kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "paybill" ? "M-Pesa paybill" : k === "till" ? "Till number" : "Bank account"}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === "paybill" ? "Paybill number" : kind === "till" ? "Till number" : "Account number"} htmlFor="channel_number" error={err("channel_number")} hint="Optional for now">
            <input id="channel_number" name="channel_number" inputMode="numeric" placeholder={kind === "bank" ? "1234567890" : "4012345"} className={inputClass} />
          </Field>
          {kind === "bank" && (
            <Field label="Bank" htmlFor="bank_name">
              <input id="bank_name" name="bank_name" placeholder="KCB" className={inputClass} />
            </Field>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Units</h2>
          <p className="text-[13px] text-muted">Describe the door numbers. Ranges and single units, separated by commas.</p>
        </div>
        <Field label="Unit codes" htmlFor="pattern" error={err("pattern") ?? preview.error}>
          <input id="pattern" name="pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setPattern(p)} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 hover:bg-page">
              {p}
            </button>
          ))}
        </div>
        {preview.codes.length > 0 && (
          <div className="rounded-xl bg-page p-3">
            <div className="text-[13px] font-medium">
              <span className="num">{preview.codes.length}</span> units
            </div>
            <div className="mt-1 line-clamp-2 text-[13px] text-muted">{preview.codes.join(", ")}</div>
          </div>
        )}
        {overLimit && (
          <Alert tone="info">
            The Free plan covers up to {limit} units. Ask RentFlow to move this account to Growth before adding {preview.codes.length}.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Usual rent (KES)" htmlFor="rent" hint="Per unit; tenants can differ" error={err("rent")}>
            <input id="rent" name="rent" inputMode="numeric" placeholder="15,000" className={inputClass} />
          </Field>
          <Field label="Usual deposit (KES)" htmlFor="deposit">
            <input id="deposit" name="deposit" inputMode="numeric" placeholder="15,000" className={inputClass} />
          </Field>
          <Field label="Rent due on day" htmlFor="due_day">
            <select id="due_day" name="due_day" defaultValue="5" className={inputClass}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Start the books from" htmlFor="tracking_from" hint="Usually 3 months back, to match the statements you'll upload. Older debt goes in as “balance brought forward”.">
          <select id="tracking_from" name="tracking_from" defaultValue={months[2]} className={inputClass}>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatPeriod(m, true)}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {state?.error && !state.field && <Alert>{state.error}</Alert>}
      <div className="flex justify-end">
        <SubmitButton pendingText="Creating units…">{onboarding ? "Create building and continue" : "Create building"}</SubmitButton>
      </div>
    </form>
  );
}
