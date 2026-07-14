"use client";

import { useActionState } from "react";
import { acceptInvite, type AcceptState } from "@/lib/invites/actions";
import { ErrorText } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function JoinForm({ token }: { token: string }) {
  const [state, action] = useActionState<AcceptState, FormData>(acceptInvite, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Joining…" className="w-full">
        Join organization
      </SubmitButton>
    </form>
  );
}
