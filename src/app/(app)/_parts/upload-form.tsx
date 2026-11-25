"use client";

import { Upload } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadStatement, type UploadState } from "@/server/actions/statements";
import { Card, Field, Notice, buttonClass, cx, inputClass } from "@/ui";

const STEPS = ["Reading your statement…", "Finding payments into your account…", "Matching payments to tenants…", "Almost done…"];

/** "Upload M-Pesa statement" with clear progress while it works. */
export function UploadForm({ buildings, defaultBuilding, onboarding = false }: { buildings: { id: string; name: string }[]; defaultBuilding?: string | null; onboarding?: boolean }) {
  const [state, action] = useActionState<UploadState, FormData>(uploadStatement, undefined);
  const [file, setFile] = useState<File | null>(null);
  const isPdf = !!file && /\.pdf$/i.test(file.name);

  return (
    <Card className="p-6">
      <form action={action} className="space-y-5">
        {onboarding && <input type="hidden" name="onboarding" value="1" />}
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center hover:bg-page">
          <Upload size={24} strokeWidth={1.5} className="text-muted" aria-hidden />
          <span className="text-[15px] font-medium">{file ? file.name : "Choose your M-Pesa statement"}</span>
          <span className="max-w-sm text-[13px] text-muted">{file ? "Tap to choose a different file" : "Excel or CSV from the M-Pesa business portal, or the PDF statement. Up to 3 months at once is fine."}</span>
          <input name="file" type="file" required accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        {(isPdf || state?.needsPassword) && (
          <Field label="PDF password" htmlFor="password" hint="Safaricom sends this code with the statement. We use it once and don't keep it.">
            <input id="password" name="password" type="password" autoComplete="off" className={inputClass} />
          </Field>
        )}

        {buildings.length > 1 ? (
          <Field label="Which building is this paybill for?" htmlFor="building_id" hint="Choose “All buildings” if one paybill collects for all of them.">
            <select id="building_id" name="building_id" defaultValue={defaultBuilding ?? ""} className={inputClass}>
              <option value="">All buildings</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="building_id" value={buildings[0]?.id ?? ""} />
        )}

        {state?.error && <Notice>{state.error}</Notice>}
        <Submit />
      </form>
    </Card>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => {
      clearInterval(t);
      setStep(0);
    };
  }, [pending]);
  return (
    <div className="space-y-3">
      <button type="submit" disabled={pending} className={cx(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
        {pending ? "Working…" : "Upload and match"}
      </button>
      {pending && (
        <div className="fade-in space-y-2" role="status" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${((step + 1) / STEPS.length) * 90}%` }} />
          </div>
          <p className="text-[15px] text-muted">{STEPS[step]}</p>
        </div>
      )}
    </div>
  );
}
