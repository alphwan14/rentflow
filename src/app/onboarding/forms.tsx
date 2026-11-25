"use client";

import { useActionState, useMemo, useState } from "react";
import { UnitPatternError, expandUnitPattern } from "@/core/import/unit-pattern";
import { monthName } from "@/core/messages";
import { addMonths, periodOf, todayNairobi } from "@/core/period";
import { UNIT_LIMIT, type Plan } from "@/core/plans";
import { addUnits, nameBuilding, type StepState } from "@/server/actions/onboarding";
import { Card, Field, Notice, cx, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";

export function NameBuildingForm() {
  const [state, action] = useActionState<StepState, FormData>(nameBuilding, undefined);
  return (
    <form action={action}>
      <Card className="space-y-4 p-6">
        <Field label="Building name" htmlFor="name" error={state?.field === "name" ? state.error : null}>
          <input id="name" name="name" required placeholder="Sunrise Apartments" className={inputClass} autoFocus />
        </Field>
        <Field label="Area (optional)" htmlFor="location">
          <input id="location" name="location" placeholder="Kasarani, Nairobi" className={inputClass} />
        </Field>
      </Card>
      {state?.error && state.field !== "name" && (
        <div className="mt-4">
          <Notice>{state.error}</Notice>
        </div>
      )}
      <SubmitButton className="mt-6 w-full" pendingText="Saving…">
        Continue
      </SubmitButton>
    </form>
  );
}

const EXAMPLES = ["A1-A20, B1-B20", "1-24", "G1-G4, 1A-1D, 2A-2D"];

export function AddUnitsForm({ buildingId, plan }: { buildingId: string; plan: Plan }) {
  const [state, action] = useActionState<StepState, FormData>(addUnits, undefined);
  const [pattern, setPattern] = useState("A1-A20, B1-B20");
  const [kind, setKind] = useState<"paybill" | "till" | "bank">("paybill");
  const months = useMemo(() => {
    const now = periodOf(todayNairobi());
    return [0, 1, 2, 3, 4, 5].map((i) => addMonths(now, -i));
  }, []);
  const preview = useMemo(() => {
    try {
      return { codes: expandUnitPattern(pattern), error: null as string | null };
    } catch (e) {
      return { codes: [] as string[], error: e instanceof UnitPatternError ? e.message : "We couldn't read those unit numbers." };
    }
  }, [pattern]);
  const limit = UNIT_LIMIT[plan];
  const err = (f: string) => (state?.field === f ? state.error : null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="building_id" value={buildingId} />
      <Card className="space-y-4 p-6">
        <Field label="Unit numbers" htmlFor="pattern" hint="Use a dash for a run of units and commas between groups." error={err("pattern") ?? preview.error}>
          <input id="pattern" name="pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((p) => (
            <button key={p} type="button" onClick={() => setPattern(p)} className="min-h-11 rounded-full border border-line px-4 text-[13px] hover:bg-page">
              {p}
            </button>
          ))}
        </div>
        {preview.codes.length > 0 && (
          <p className="rounded-xl bg-page px-4 py-3 text-[15px]">
            <span className="font-semibold">{preview.codes.length} units:</span> <span className="text-muted">{preview.codes.slice(0, 12).join(", ")}{preview.codes.length > 12 ? " …" : ""}</span>
          </p>
        )}
        {limit !== null && preview.codes.length > limit && (
          <Notice tone="info">The Free plan covers up to {limit} units. Ask RentFlow to move you to Growth to add {preview.codes.length}.</Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usual rent (KES)" htmlFor="rent" hint="You can change it for each tenant later." error={err("rent")}>
            <input id="rent" name="rent" inputMode="numeric" required placeholder="15,000" className={inputClass} />
          </Field>
          <Field label="Usual deposit (KES, optional)" htmlFor="deposit">
            <input id="deposit" name="deposit" inputMode="numeric" placeholder="15,000" className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-[15px] font-semibold">How do tenants pay you?</h2>
        <div className="flex gap-1 rounded-xl bg-page p-1" role="radiogroup" aria-label="How tenants pay">
          {(["paybill", "till", "bank"] as const).map((k) => (
            <label key={k} className={cx("flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg text-[13px] font-medium sm:text-[15px]", kind === k ? "bg-card shadow-[0_1px_2px_rgba(15,17,21,0.06)]" : "text-muted")}>
              <input type="radio" name="pay_kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "paybill" ? "Paybill" : k === "till" ? "Till" : "Bank"}
            </label>
          ))}
        </div>
        <Field label={kind === "paybill" ? "Paybill number" : kind === "till" ? "Till number" : "Account number"} htmlFor="pay_number" hint="Optional. It goes on reminders so tenants know where to pay." error={err("pay_number")}>
          <input id="pay_number" name="pay_number" inputMode="numeric" placeholder={kind === "bank" ? "1234567890" : "123456"} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rent is due on day" htmlFor="due_day">
            <select id="due_day" name="due_day" defaultValue="5" className={inputClass}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start tracking from" htmlFor="tracking_from" hint="Choose the month of the oldest statement you have.">
            <select id="tracking_from" name="tracking_from" defaultValue={months[2]} className={inputClass}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)} {m.slice(0, 4)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {state?.error && !state.field && <Notice>{state.error}</Notice>}
      <SubmitButton className="w-full" pendingText="Adding units…">
        Add {preview.codes.length || ""} units
      </SubmitButton>
    </form>
  );
}
