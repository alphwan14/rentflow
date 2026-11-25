"use client";

import { useActionState, useState } from "react";
import { hasFeature, type Plan } from "@/core/plans";
import { updateBuildingSettings, type BuildingFormState } from "@/server/actions/buildings";
import type { BuildingRow } from "@/server/types";
import { Alert, Card, CardHeader, Field, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";

export function BuildingSettings({ building: b, plan }: { building: BuildingRow; plan: Plan }) {
  const [state, action] = useActionState<BuildingFormState, FormData>(updateBuildingSettings, undefined);
  const [kind, setKind] = useState(b.late_fee_kind);
  const lateFees = hasFeature(plan, "late_fees");
  const feeDefault = b.late_fee_kind === "flat" ? String(Number(b.late_fee_value) / 100) : String(Number(b.late_fee_value) / 100);
  return (
    <Card>
      <CardHeader title="Settings" />
      <form action={action} className="space-y-4 px-5 pb-5">
        <input type="hidden" name="building_id" value={b.id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="s-name">
            <input id="s-name" name="name" defaultValue={b.name} className={inputClass} />
          </Field>
          <Field label="Location" htmlFor="s-location">
            <input id="s-location" name="location" defaultValue={b.location ?? ""} className={inputClass} />
          </Field>
          <Field label="Rent due on day" htmlFor="s-due">
            <input id="s-due" name="default_due_day" type="number" min={1} max={28} defaultValue={b.default_due_day} className={inputClass} />
          </Field>
        </div>
        <fieldset className="rounded-xl border border-line p-4" disabled={!lateFees}>
          <legend className="px-1 text-[13px] font-medium">Late fees {!lateFees && <span className="font-normal text-muted">· Growth plan</span>}</legend>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="late_fee_enabled" defaultChecked={b.late_fee_enabled} /> Add a late fee automatically when this month&apos;s rent is unpaid
          </label>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Type" htmlFor="s-kind">
              <select id="s-kind" name="late_fee_kind" value={kind} onChange={(e) => setKind(e.target.value as "flat" | "percent")} className={inputClass}>
                <option value="flat">Fixed amount (KES)</option>
                <option value="percent">Percent of rent</option>
              </select>
            </Field>
            <Field label={kind === "flat" ? "Amount (KES)" : "Percent"} htmlFor="s-value">
              <input id="s-value" name="late_fee_value" inputMode="decimal" defaultValue={feeDefault} className={inputClass} />
            </Field>
            <Field label="Days of grace after due date" htmlFor="s-grace">
              <input id="s-grace" name="late_fee_grace_days" type="number" min={0} max={28} defaultValue={b.late_fee_grace_days} className={inputClass} />
            </Field>
          </div>
        </fieldset>
        {!lateFees && <input type="hidden" name="late_fee_kind" value={b.late_fee_kind} />}
        {!lateFees && <input type="hidden" name="late_fee_grace_days" value={b.late_fee_grace_days} />}
        {state?.error && <Alert>{state.error}</Alert>}
        <SubmitButton variant="secondary" pendingText="Saving…">
          Save settings
        </SubmitButton>
      </form>
    </Card>
  );
}
