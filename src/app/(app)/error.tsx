"use client";

import { Card, Button } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">
        {error.message || "An unexpected error occurred. Your data is safe."}
      </p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
