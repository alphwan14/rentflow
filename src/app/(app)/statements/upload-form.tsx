"use client";

import { useActionState, useState } from "react";
import { uploadStatement, type UploadState } from "@/server/actions/statements";
import { Alert, Card, Field, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";
import { IconUpload } from "@/ui/icons";

export function UploadForm({
  buildings,
  defaultBuilding,
  onboarding = false,
}: {
  buildings: { id: string; name: string }[];
  defaultBuilding?: string | null;
  onboarding?: boolean;
}) {
  const [state, action] = useActionState<UploadState, FormData>(uploadStatement, undefined);
  const [file, setFile] = useState<File | null>(null);
  const isPdf = !!file && /\.pdf$/i.test(file.name);

  return (
    <Card className="p-5 sm:p-6">
      <form action={action} className="space-y-4">
        {onboarding && <input type="hidden" name="onboarding" value="1" />}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center hover:bg-page">
          <IconUpload className="text-muted" />
          <span className="text-[14px] font-medium">{file ? file.name : "Choose an M-Pesa statement"}</span>
          <span className="text-[12px] text-muted">CSV or Excel export from the M-Pesa business portal, or the PDF statement. Several months at once is fine.</span>
          <input name="file" type="file" required accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        {(isPdf || state?.needsPassword) && (
          <Field label="PDF password" htmlFor="password" hint="M-Pesa statement PDFs are locked with a code, usually sent by SMS or the ID number of the line. It's used once and never stored.">
            <input id="password" name="password" type="password" autoComplete="off" className={inputClass} />
          </Field>
        )}

        {buildings.length > 1 ? (
          <Field label="Which building is this paybill for?" htmlFor="building_id" hint="Choose “All buildings” if one paybill collects for several.">
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

        {state?.error && <Alert>{state.error}</Alert>}
        <div className="flex justify-end">
          <SubmitButton pendingText="Reading and matching…">Upload and match</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
