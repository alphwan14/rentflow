"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "@/server/actions/org";
import { Button, Notice } from "@/ui";

export function JoinButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvite(token);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Joining…" : "Join"}
      </Button>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
