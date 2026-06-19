import Link from "next/link";

/** RentFlow wordmark — used consistently across app, receipts and statements. */
export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const dot = size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${text}`}>
      <span className={`${dot} rounded-full bg-brand`} aria-hidden />
      <span>
        Rent<span className="text-brand">Flow</span>
      </span>
    </span>
  );
}

export function BrandLink() {
  return (
    <Link href="/dashboard" className="inline-flex">
      <Brand />
    </Link>
  );
}
