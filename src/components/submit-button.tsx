"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? pendingText ?? "Working…" : children}
    </Button>
  );
}
