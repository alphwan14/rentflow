"use client";

import { useState, useTransition } from "react";
import { Button, ErrorText } from "@/components/ui";
import { softDeleteTenant } from "@/lib/tenants/actions";

const CONFIRM_PHRASE = "DELETE TENANT";

/**
 * Safe, multi-step tenant deletion (soft delete). Three deliberate gates:
 *   1. warning of consequences
 *   2. type the exact phrase "DELETE TENANT"
 *   3. final irreversible confirmation
 * Only rendered for admins. Calls the softDeleteTenant server action, which
 * redirects to /tenants on success.
 */
export function DeleteTenant({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0 = closed
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setStep(0);
    setTyped("");
    setError(null);
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const res = await softDeleteTenant(tenantId);
      // On success the action redirects; we only get here on failure.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <Button variant="danger" type="button" onClick={() => setStep(1)}>
        Delete tenant
      </Button>

      {step > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">Delete {tenantName}?</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                  <li>• The tenant is hidden from your tenant list and dashboard.</li>
                  <li>• Any un-sent SMS receipts are canceled.</li>
                  <li>• Payments, receipts and ledger history are kept for your records.</li>
                </ul>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="ghost" type="button" onClick={close}>
                    Cancel
                  </Button>
                  <Button variant="danger" type="button" onClick={() => setStep(2)}>
                    Continue
                  </Button>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">Confirm deletion</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Type <span className="font-mono font-semibold text-slate-900">{CONFIRM_PHRASE}</span> to
                  continue.
                </p>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200"
                />
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="ghost" type="button" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    disabled={typed !== CONFIRM_PHRASE}
                    onClick={() => setStep(3)}
                  >
                    Continue
                  </Button>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h3 className="text-lg font-semibold text-red-600">This cannot be undone</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {tenantName} will be permanently removed from your active records. Proceed?
                </p>
                <ErrorText>{error}</ErrorText>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="ghost" type="button" onClick={close} disabled={pending}>
                    Cancel
                  </Button>
                  <Button variant="danger" type="button" onClick={confirmDelete} disabled={pending}>
                    {pending ? "Deleting…" : "Delete permanently"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
