"use client";

import { Button } from "./ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="ghost" type="button" onClick={() => window.print()} className="no-print">
      {label}
    </Button>
  );
}
