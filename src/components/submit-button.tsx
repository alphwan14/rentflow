"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  className = "",
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "primary" | "ghost" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending ? pendingText ?? "Working…" : children}
    </Button>
  );
}
