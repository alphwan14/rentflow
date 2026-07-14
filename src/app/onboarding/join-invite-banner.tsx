"use client";

import { useActionState } from "react";
import { acceptPendingInvite, type AcceptState } from "@/lib/invites/actions";
import { ErrorText } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { roleLabel } from "@/lib/auth/permissions";

/** Onboarding banner: an invite addressed to this email is waiting. */
export function JoinInviteBanner({ orgName, role }: { orgName: string; role: string }) {
  const [state, action] = useActionState<AcceptState, FormData>(acceptPendingInvite, null);
  return (
    <div className="mb-4 rounded-2xl border border-brand/30 bg-brand/5 p-5">
      <p className="text-sm text-slate-700">
        You&apos;ve been invited to join{" "}
        <span className="font-semibold text-slate-900">{orgName}</span> as{" "}
        <span className="font-medium">{roleLabel(role)}</span>.
      </p>
      <form action={action} className="mt-3 space-y-2">
        <ErrorText>{state?.error}</ErrorText>
        <SubmitButton pendingText="Joining…" className="w-full">
          Join {orgName}
        </SubmitButton>
      </form>
    </div>
  );
}
