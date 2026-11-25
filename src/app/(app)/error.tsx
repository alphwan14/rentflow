"use client";

import { Button, Card } from "@/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="p-8 text-center">
      <h1 className="text-[18px] font-semibold">Something went wrong</h1>
      <p className="mt-1 text-[14px] text-muted">Your data is safe. Try again, and if it keeps happening, tell RentFlow support.</p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
