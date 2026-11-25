"use client";

import { Button, Card } from "@/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="p-8 text-center">
      <h1 className="text-[20px] font-semibold">Something went wrong</h1>
      <p className="mt-1 text-[15px] text-muted">Your records are safe. Try again in a moment.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
