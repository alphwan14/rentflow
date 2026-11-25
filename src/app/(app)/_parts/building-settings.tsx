"use client";

import { useActionState, useState } from "react";
import { hasFeature, type Plan } from "@/core/plans";
import { updateBuildingSettings, type BuildingFormState } from "@/server/actions/buildings";
import type { BuildingRow } from "@/server/types";
import { Card, Field, Notice, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";

export function BuildingSettings({ building: b, plan }: { building: BuildingRow; plan: Plan }) {
  const [state, action] = useActionState<BuildingFormState, FormData>(updateBuildingSettings, undefined);
  const [kind, setKind] = useState(b.late_fee_kind);
  const lateFees = hasFeature(plan, "late_fees");
  return (
    <form action={action} className="space-y-4 sm:space-y-6">
      <input type="hidden" name="building_id" value={b.id} />
      <Card className="space-y-4 p-6">
        <h2 className="text-[15px] font-semibold">Building</h2>
        <Field label="Name" htmlFor="s-name">
          <input id="s-name" name="name" defaultValue={b.name} required className={inputClass} />
        </Field>
        <Field label="Area" htmlFor="s-location">
          <input id="s-location" name="location" defaultValue={b.location ?? ""} placeholder="Kasarani, Nairobi" className={inputClass} />
        </Field>
        <Field label="Rent is due on day" htmlFor="s-due" hint="Day of the month, 1 to 28.">
          <input id="s-due" name="default_due_day" type="number" min={1} max={28} defaultValue={b.default_due_day} className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Late fees</h2>
          <p className="text-[15px] text-muted">{lateFees ? "Add a fee automatically when a tenant hasn't paid this month's rent in time." : "Late fees come with the Growth plan."}</p>
        </div>
        <fieldset disabled={!lateFees} className="space-y-4 disabled:opacity-50">
          <legend className="sr-only">Late fee settings</legend>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" name="late_fee_enabled" defaultChecked={b.late_fee_enabled} className="size-5 accent-[var(--accent)]" />
            Add late fees automatically
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fee type" htmlFor="s-kind">
              <select id="s-kind" name="late_fee_kind" value={kind} onChange={(e) => setKind(e.target.value as "flat" | "percent")} className={inputClass}>
                <option value="flat">Fixed amount</option>
                <option value="percent">Percent of rent</option>
              </select>
            </Field>
            <Field label={kind === "flat" ? "Amount (KES)" : "Percent"} htmlFor="s-value">
              <input id="s-value" name="late_fee_value" inputMode="decimal" defaultValue={String(Number(b.late_fee_value) / 100)} className={inputClass} />
            </Field>
            <Field label="Days after due date" htmlFor="s-grace">
              <input id="s-grace" name="late_fee_grace_days" type="number" min={0} max={28} defaultValue={b.late_fee_grace_days} className={inputClass} />
            </Field>
          </div>
        </fieldset>
        {!lateFees && (
          <>
            <input type="hidden" name="late_fee_kind" value={b.late_fee_kind} />
            <input type="hidden" name="late_fee_grace_days" value={b.late_fee_grace_days} />
          </>
        )}
      </Card>

      {state?.error && <Notice>{state.error}</Notice>}
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
