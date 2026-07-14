"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. http on old Android): select-and-copy
      // fallback is the visible input next to this button.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:bg-teal-800"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
